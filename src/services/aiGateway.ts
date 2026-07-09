// AI Gateway - 多厂商模型适配聚合层
// 业务代码只调用统一接口（defaultAiGateway），不同厂商的实现拆分到 ./ai/providers/* 下：
//   - OpenAI 兼容（OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义）→ ./ai/providers/openai
//   - Anthropic Claude → ./ai/providers/anthropic
//   - Google Gemini → ./ai/providers/gemini
// 桌面 GUI 版本：API Key 优先从系统安全凭据读取（apiKeyRef），其次回退到模型 JSON 里的 apiKey。
//
// 本文件作为聚合层：re-export 公共类型与纯函数，组装 defaultAiGateway，
// 并保留业务专用函数（parseUserInput / runAgentAnalysis）。

import type { AiModelConfig } from "@/domain/ai";
import type { ParsedDraft } from "@/domain/chat";
import type {
  SuggestionType,
  AnalysisDimensions,
  AnalysisStrategy,
  DebateConsensus,
  DebateModelConclusion,
  DebateResult,
} from "@/domain/agent";
import { DEBATE_CONSENSUS_LABEL, SUGGESTION_TYPE_TO_DECISION } from "@/domain/agent";

import type { AiGateway } from "./ai/types";
import { extractJsonFromText } from "./ai/internal";
import {
  callOpenAICompatible,
  callOpenAICompatibleStream,
} from "./ai/providers/openai";
import { callAnthropicStream } from "./ai/providers/anthropic";
import { callGeminiStream } from "./ai/providers/gemini";

// ====== 公共类型 re-export ======
export type { AiGateway, SessionUsage } from "./ai/types";

// ====== 公共纯函数 / 状态管理 re-export ======
// Task 5 已从 aiGateway.ts 导出 extractJsonFromText / parseSseDataLines / recordUsage 供测试，
// 拆分后这些函数实现迁移到 ./ai/internal，这里 re-export 保持公共 API 不变。
export {
  extractJsonFromText,
  getSessionUsage,
  parseSseDataLines,
  recordUsage,
  resetSessionUsage,
} from "./ai/internal";

// ====== 默认网关实现 ======
// generateText / generateJson / testConnection 走 callOpenAICompatible（内部按 model.provider 分流）；
// streamChat 按 provider 分流到各自的流式实现。
export const defaultAiGateway: AiGateway = {
  async generateText(model, messages, options) {
    const res = await callOpenAICompatible(model, {
      model: model.modelName,
      messages,
      temperature: options?.temperature ?? 0.6,
      max_tokens: options?.maxTokens,
      stream: false,
    });
    return res.content;
  },

  async generateJson(model, messages, options) {
    const res = await callOpenAICompatible(model, {
      model: model.modelName,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens,
      stream: false,
      response_format: { type: "json_object" },
    });
    try {
      return JSON.parse(res.content) as unknown;
    } catch {
      // 容错：尝试从文本中提取 JSON（代码块 / 裸 JSON）
      // 注：这里 cast 为 JSON.parse 的返回类型（any），以保持与原内联实现一致的 <T> 泛型推断
      return extractJsonFromText(res.content) as ReturnType<typeof JSON.parse>;
    }
  },

  async testConnection(model) {
    try {
      const ans = await callOpenAICompatible(
        model,
        {
          model: model.modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 8,
          stream: false,
        },
        true
      );
      return { ok: true, message: `连接成功，模型返回：${ans.content.slice(0, 40)}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },

  async *streamChat(model, messages, options) {
    // 按厂商分流到各自的流式实现
    if (model.provider === "anthropic") {
      yield* callAnthropicStream(model, messages, options);
      return;
    }
    if (model.provider === "gemini") {
      yield* callGeminiStream(model, messages, options);
      return;
    }
    // OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义 均走兼容协议
    yield* callOpenAICompatibleStream(model, messages, options);
  },
};

// ====== 业务专用：自然语言解析为结构化草稿 ======

const PARSE_SYSTEM_PROMPT = `你是 AI 炒股评估系统的输入解析器。
你的任务是把用户的自然语言转换为结构化 JSON 数据，不要回答用户问题。

支持的意图（intent）：
- update_account: 设置本金或现金
- add_position: 新增/买入股票
- sell_position: 卖出股票
- update_position: 更新成本价/备注
- create_agent_job: 创建定时任务
- set_alert: 设置风险提醒
- save_memory: 保存投资偏好/规则
- query: 查询账户、收益、持仓分析
- chat: 普通聊天

输出严格的 JSON 格式：
{
  "intent": "string",
  "account": { "cumulativePrincipal"?: number, "cashBalance"?: number },
  "positions": [{ "name": string, "symbol"?: string, "quantity": number, "avgCost"?: number, "totalCost"?: number, "action"?: "buy"|"sell"|"update" }],
  "agentJob": { "name": string, "triggerType": "interval"|"fixed_time"|"condition", "intervalMinutes"?: number, "fixedTimes"?: string[], "scope": "all_positions"|"watchlist"|"single_symbol", "symbol"?: string, "tradingHoursOnly"?: boolean },
  "alert": { "name": string, "symbol"?: string, "metric": string, "operator": string, "value": number },
  "memory": { "type": string, "title": string, "content": string },
  "queriedSymbols": ["string"],
  "requiresConfirmation": boolean,
  "summary": "给用户看到的中文摘要，说明你识别到了什么"
}

规则：
1. 数值字段必须为数字，不能是字符串。
2. 如果用户提到金额单位"万"，需要换算成具体数字（10万 = 100000）。
3. 股票代码无法确定时，symbol 字段省略，由系统后续匹配。
4. 凡是涉及修改账户、新增/卖出持仓、创建任务、设置提醒、保存记忆，requiresConfirmation 必须为 true。
5. summary 必须用简洁中文说明你识别到了什么，以及需要用户确认什么。
6. 【买入成本字段二选一，严格区分用户语义】：
   - 用户说"每股 X"、"单价 X"、"成本价 X"、"X 元一股"等单价语义 → 填 avgCost = X，totalCost 留空。
   - 用户说"总共 X"、"总花费 X"、"一共 X"、"花了 X"等总价语义 → 填 totalCost = X，avgCost 留空（系统会自动除以 quantity 算出单价，避免你算错）。
   - 不要同时填 avgCost 和 totalCost。
   - 不要自己换算单价/总价，保留用户原始语义即可。
   - summary 中如实复述用户原话（如"100 股茅台，总共 118000"），不要擅自改成"每股 1180"。
7. 【create_agent_job 交易时段】：
   - 默认 tradingHoursOnly = true（A 股周末和非交易时段 9:30 前/15:00 后不开盘，定时分析无意义）。
   - 用户明确说"全天运行""不要限制时段""夜间也要"才设为 false。
   - interval/fixed_time 类型都适用。
8. 【行情实体识别】：
   - 当 intent 为 query 或 chat，且用户问到具体股票行情（如"茅台多少钱""平安今天涨跌"）时，把股票代码或名称填入 queriedSymbols 数组。
   - 优先输出 6 位纯数字股票代码（如"600519"），因为你具备股票代码知识，代码比名称更稳定且系统能自动推断市场。
   - 仅当你不确定代码时才输出中文全称（如"贵州茅台"）。
   - 用户没问具体股票时，queriedSymbols 留空数组或省略。
   - 不要把用户持有的股票自动加入（系统会另传持仓上下文）。
   - 示例：用户问"茅台多少钱" → queriedSymbols: ["600519"]；用户问"平安今天涨跌" → queriedSymbols: ["601318"]。`;

export async function parseUserInput(
  model: AiModelConfig,
  userInput: string,
  context?: { accountSummary?: string; positions?: string }
): Promise<ParsedDraft> {
  const userContent = context
    ? `【当前账户信息】\n${context.accountSummary || "无"}\n【当前持仓】\n${context.positions || "无"}\n\n【用户输入】\n${userInput}`
    : userInput;

  const draft = await defaultAiGateway.generateJson<ParsedDraft>(model, [
    { role: "system", content: PARSE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]);

  // 兜底字段
  if (!draft.summary) {
    draft.summary = "已识别你的输入，请确认是否写入。";
  }
  if (draft.requiresConfirmation === undefined) {
    draft.requiresConfirmation = !["query", "chat"].includes(draft.intent);
  }
  return draft;
}

// ====== 业务专用：Agent 分析持仓 ======

export interface AgentAnalysisInput {
  accountSummary: string;
  positions: string;
  marketData: string;
  klineSummary?: string; // 技术面：近 60 日 K 线 + MA5/MA10/MA20
  fundamentalsSummary?: string; // 估值面：PE/PB/市值/换手率
  announcementsSummary?: string; // 公告面：持仓股近期公告标题列表
  userPreferences: string;
  recentAgentMemories: string;
}

export interface AgentAnalysisOutput {
  marketOverview: string;
  positionChanges: string;
  risks: string[];
  opportunities: string[];
  suggestionType: SuggestionType;
  suggestion: string;
  confidence: number; // 0-1
  needUserConfirm: boolean;
  rawMarkdown: string;
  dimensions?: AnalysisDimensions; // 5 维度评分（可选，旧结果可能缺失）
}

export const AGENT_SYSTEM_PROMPT = `你是一个股票投资辅助 Agent，不是持牌投顾，不能承诺收益，不能替用户下单。
你的任务是帮助用户记录账户、分析持仓、识别风险、总结行情变化，并给出谨慎的辅助观点。

你必须遵守：
1. 所有观点都要说明依据。
2. 不得使用"必涨""稳赚""马上买入"等绝对化表达。
3. 涉及买卖时，必须提醒用户自行决策。
4. 如果数据不足，必须明确说明数据不足。
5. 输出要简洁、可执行、带风险提示。
6. 当发现明确板块机会且用户尚未持有时，可在 suggestionType 输出 "buy_position" 并在 opportunities 中说明标的与原因，但 rawMarkdown 仍需提示"需用户自行决策，本建议不构成投资建议"。
7. 若提供技术面数据（MA5/MA10/MA20），需结合均线位置判断短期趋势：多头排列（MA5>MA10>MA20）视为偏多，空头排列（MA5<MA10<MA20）视为偏空，纠缠视为震荡。
8. 若提供估值面数据（PE/PB/市值），需结合行业常见区间判断估值高低，避免脱离行业基准下结论。
9. 输出 dimensions 字段，包含 5 个维度评分（technical/fundamental/capital/sentiment/risk，每个 1-10 分 + 1-2 句 rationale）。技术面基于 MA 均线趋势，基本面基于 PE/PB 估值，资金面基于换手率与量价，情绪面基于涨跌幅与热度，风险面基于回撤与集中度。

请同时输出严格 JSON 字段，rawMarkdown 字段为给用户展示的完整中文 Markdown。`;

// ====== Task 3：调研流水线策略 Prompt ======
// 保留原 AGENT_SYSTEM_PROMPT 以向后兼容；新策略走 STRATEGY_PROMPTS。
// BASE_RULES 为各策略共享的通用规则（含规则 1-9，与 AGENT_SYSTEM_PROMPT 等价但不含末尾的输出说明段）。
const BASE_RULES = `你是一个股票投资辅助 Agent，不是持牌投顾，不能承诺收益，不能替用户下单。
你的任务是帮助用户记录账户、分析持仓、识别风险、总结行情变化，并给出谨慎的辅助观点。

你必须遵守：
1. 所有观点都要说明依据。
2. 不得使用"必涨""稳赚""马上买入"等绝对化表达。
3. 涉及买卖时，必须提醒用户自行决策。
4. 如果数据不足，必须明确说明数据不足。
5. 输出要简洁、可执行、带风险提示。
6. 当发现明确板块机会且用户尚未持有时，可在 suggestionType 输出 "buy_position" 并在 opportunities 中说明标的与原因，但 rawMarkdown 仍需提示"需用户自行决策，本建议不构成投资建议"。
7. 若提供技术面数据（MA5/MA10/MA20），需结合均线位置判断短期趋势：多头排列（MA5>MA10>MA20）视为偏多，空头排列（MA5<MA10<MA20）视为偏空，纠缠视为震荡。
8. 若提供估值面数据（PE/PB/市值），需结合行业常见区间判断估值高低，避免脱离行业基准下结论。
9. 输出 dimensions 字段，包含 5 个维度评分（technical/fundamental/capital/sentiment/risk，每个 1-10 分 + 1-2 句 rationale）。`;

export const STRATEGY_PROMPTS: Record<AnalysisStrategy, string> = {
  quick_valuation: `${BASE_RULES}

## 当前策略：快速估值
聚焦于估值锚点：当前价格 → PE(TTM)/PB → 与行业均值对比 → 是否高估/低估。
技术面只看 MA20 趋势方向，不做深入分析。
rawMarkdown 应简洁（200 字以内），重点给出"估值偏高/合理/偏低"结论。`,

  standard_patrol: `${BASE_RULES}

## 当前策略：标准巡检
全面覆盖技术面（MA 均线趋势）+ 基本面（PE/PB 估值）+ 风险面（回撤/集中度）。
这是默认策略，保持原有分析深度。
若有近期公告数据，在 rawMarkdown 中包含"近期公告 AI 摘要"段落（3-5 条要点压缩）。`,

  deep_research: `${BASE_RULES}

## 当前策略：深度调研
深度覆盖：机构覆盖数 → 估值分位 → 概念题材 → 资金面（换手率/量价）→ 龙虎榜 → 解禁到期 → 两融余额变化。
rawMarkdown 应详细（500 字以上），包含多维度交叉验证。
若数据不足（如龙虎榜/解禁/两融数据未提供），明确说明"该维度数据暂不可用"，不要臆测。
若有近期公告数据，在 rawMarkdown 中包含"近期公告 AI 摘要"段落（3-5 条要点压缩），并结合公告内容评估对持仓的潜在影响。`,

  peer_compare: `${BASE_RULES}

## 当前策略：同类对比
将用户持仓与同行业典型公司横向对比（估值 PE/PB、市值、成长性）。
rawMarkdown 应以表格形式呈现对比结果，并标注用户持仓在行业中的相对位置。
若未提供同行业数据，基于持仓股的行业常识给出对比框架。`,
};

export async function runAgentAnalysis(
  model: AiModelConfig,
  input: AgentAnalysisInput,
  strategy: AnalysisStrategy = "standard_patrol"
): Promise<AgentAnalysisOutput> {
  const klineSection = input.klineSummary
    ? `\n技术面数据（近 60 日 K 线摘要）：\n${input.klineSummary}\n`
    : "";
  const fundamentalsSection = input.fundamentalsSummary
    ? `\n估值面数据（PE/PB/市值/换手率）：\n${input.fundamentalsSummary}\n`
    : "";
  const announcementsSection = input.announcementsSummary
    ? `\n近期公告：\n${input.announcementsSummary}\n`
    : "";

  const userContent = `请基于以下信息分析用户当前持仓：

账户信息：
${input.accountSummary}

持仓列表：
${input.positions}

行情数据：
${input.marketData}
${klineSection}${fundamentalsSection}${announcementsSection}
用户投资偏好：
${input.userPreferences}

历史 Agent 观点：
${input.recentAgentMemories}

请输出 JSON，包含字段：marketOverview, positionChanges, risks(数组), opportunities(数组), suggestionType(枚举), suggestion, confidence(0-1), needUserConfirm(boolean), rawMarkdown(给用户看的完整中文 Markdown 报告), dimensions(5 维度评分对象，含 technical/fundamental/capital/sentiment/risk，每个维度为 {score:1-10, rationale:"1-2句依据"})。
注意：不得给出确定性收益承诺，不得替用户做最终买卖决定。
若发现明显板块机会且用户尚未持有，可输出 suggestionType="buy_position"，并在 opportunities 中说明标的与原因。`;

  const systemPrompt = STRATEGY_PROMPTS[strategy] || STRATEGY_PROMPTS.standard_patrol;
  const result = await defaultAiGateway.generateJson<AgentAnalysisOutput>(model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  return {
    marketOverview: result.marketOverview || "",
    positionChanges: result.positionChanges || "",
    risks: result.risks || [],
    opportunities: result.opportunities || [],
    suggestionType: result.suggestionType || "continue_watch",
    suggestion: result.suggestion || "",
    confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
    needUserConfirm: !!result.needUserConfirm,
    rawMarkdown:
      result.rawMarkdown ||
      `${result.marketOverview || ""}\n\n${result.suggestion || ""}`,
    // dimensions 可选：AI 未返回时保留 undefined，不伪造
    dimensions: result.dimensions,
  };
}

// ====== 业务专用：多模型辩论（Task 2） ======
// 让用户可选 2-3 个模型独立分析同一持仓，汇总共识/分歧。
// 辩论模式下不额外调 AI 提取共识点（简化版），仅基于各模型 suggestionType 归并一致性。

export async function runAgentAnalysisDebate(
  models: AiModelConfig[],
  input: AgentAnalysisInput,
  strategy: AnalysisStrategy = "standard_patrol"
): Promise<DebateResult> {
  // 并发调用各模型独立分析（使用统一的分析策略）
  const results = await Promise.all(
    models.map(async (m) => {
      const output = await runAgentAnalysis(m, input, strategy);
      return {
        modelId: m.id,
        modelName: m.displayName ?? m.modelName,
        suggestionType: output.suggestionType,
        confidence: output.confidence,
        dimensions: output.dimensions,
        summary: output.suggestion,
      } as DebateModelConclusion;
    })
  );

  // 汇总一致性
  const bullTypes: SuggestionType[] = ["buy_position"];
  const bearTypes: SuggestionType[] = ["reduce_position", "stop_loss_warn"];
  const bullCount = results.filter((r) => bullTypes.includes(r.suggestionType)).length;
  const bearCount = results.filter((r) => bearTypes.includes(r.suggestionType)).length;
  const total = results.length;
  let consensus: DebateConsensus;
  if (bullCount === total) consensus = "all_bull";
  else if (bearCount === total) consensus = "all_bear";
  else if (bullCount > bearCount && bullCount > total / 2) consensus = "majority_bull";
  else if (bearCount > bullCount && bearCount > total / 2) consensus = "majority_bear";
  else consensus = "divided";

  // 构造综合报告 rawMarkdown
  const modelLines = results
    .map(
      (r) =>
        `### ${r.modelName}\n- 建议：${SUGGESTION_TYPE_TO_DECISION[r.suggestionType].label}（置信度 ${(r.confidence * 100).toFixed(0)}%）\n- ${r.summary}`
    )
    .join("\n\n");

  const rawMarkdown = `## 多模型辩论报告

**一致性：${DEBATE_CONSENSUS_LABEL[consensus]}**

${modelLines}

---
*本辩论报告由 ${total} 个模型独立分析后汇总，不构成投资建议，需用户自行决策。*`;

  return {
    models: results,
    consensus,
    consensusPoints: [], // 简化版：不额外调 AI 提取共识点，留空
    dissentPoints: [],
    overallSuggestion: `经 ${total} 个模型辩论，${DEBATE_CONSENSUS_LABEL[consensus]}。请参考各模型独立结论自行判断。`,
    modelDistribution: Object.fromEntries(results.map((r) => [r.modelId, r.confidence])),
    rawMarkdown,
  };
}
