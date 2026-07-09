// Agent Runner - 定时任务执行引擎
// 在前端运行（应用打开时），按 AgentJob 配置触发分析。

import type { AgentJob, AgentRun, AnalysisStrategy, DebateResult } from "@/domain/agent";
import type { Account } from "@/domain/account";
import type { Position, Quote } from "@/domain/position";
import type { Memory } from "@/domain/memory";
import type { ChatMessage } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import { uid, nowIso } from "@/lib/utils";
import { runAgentAnalysis, runAgentAnalysisDebate, type AgentAnalysisOutput } from "./aiGateway";
import { getBatchQuotes, getKline, getAnnouncements } from "./marketData";
import { isWithinTradingHours, alignToNextTradingSession } from "./tradingCalendar";

export interface AgentRunContext {
  account: Account | null;
  positions: Position[];
  memories: Memory[];
  model: AiModelConfig | null;
  models?: AiModelConfig[]; // 辩论模式：用于按 debateModelIds 查找模型配置
  onMessage: (msg: ChatMessage) => void;
  onRunUpdate: (run: AgentRun) => void;
}

// 执行单个 Agent 任务
export async function runAgentJob(
  job: AgentJob,
  ctx: AgentRunContext
): Promise<AgentRun> {
  const run: AgentRun = {
    id: uid("run"),
    jobId: job.id,
    jobName: job.name,
    status: "running",
    startedAt: nowIso(),
    createdAt: nowIso(),
  };
  ctx.onRunUpdate({ ...run });

  try {
    if (!ctx.model) {
      throw new Error("未配置 AI 模型，请先在模型设置中添加 API Key。");
    }

    // 1. 刷新持仓行情
    let positions = ctx.positions;
    let quotes: Record<string, Quote> = {};
    if (positions.length > 0) {
      quotes = await getBatchQuotes(positions.map((p) => p.symbol));
      positions = positions.map((p) => {
        const q = quotes[p.symbol];
        if (!q) return p;
        const marketValue = q.currentPrice * p.quantity;
        const unrealizedPnl = (q.currentPrice - p.avgCost) * p.quantity;
        const unrealizedPnlRate =
          p.avgCost > 0 ? ((q.currentPrice - p.avgCost) / p.avgCost) * 100 : 0;
        return {
          ...p,
          currentPrice: q.currentPrice,
          todayChangeRate: q.changeRate,
          marketValue,
          unrealizedPnl,
          unrealizedPnlRate,
          updatedAt: nowIso(),
        };
      });
    }

    // 1.5 抓取每只持仓的日 K 线（技术面），失败降级为空上下文不影响主流程
    let klineSummary = "无 K 线数据";
    try {
      const klineLines: string[] = [];
      for (const p of positions) {
        const bars = await getKline(p.symbol, "1d", 60);
        if (bars.length === 0) continue;
        const last = bars[bars.length - 1];
        const ma5 = last.ma5?.toFixed(2) ?? "—";
        const ma10 = last.ma10?.toFixed(2) ?? "—";
        const ma20 = last.ma20?.toFixed(2) ?? "—";
        // 近 20 日趋势：首尾收盘价对比
        const start20 = bars[Math.max(0, bars.length - 20)];
        const trend20 =
          start20 && start20.close > 0
            ? (((last.close - start20.close) / start20.close) * 100).toFixed(2)
            : "—";
        klineLines.push(
          `${p.name}(${p.symbol}) 现价${last.close} MA5=${ma5} MA10=${ma10} MA20=${ma20} 近20日${trend20}%`
        );
      }
      if (klineLines.length > 0) {
        klineSummary = klineLines.join("\n");
      }
    } catch (e) {
      console.warn("[agentRunner] K 线抓取失败，降级为空上下文", e);
      klineSummary = "K 线数据暂不可用";
    }

    // 1.6 构造基本面摘要（复用已刷新的 quotes，其 Quote 已含 PE/PB/市值）
    const fundamentalsSummary =
      positions
        .map((p) => {
          const q = quotes[p.symbol];
          const pe = q?.peTtm?.toFixed(2) ?? "—";
          const pb = q?.pb?.toFixed(2) ?? "—";
          const mcap = q?.marketCapYi?.toFixed(1) ?? "—";
          const turnover = q?.turnoverRate?.toFixed(2) ?? "—";
          return `${p.name}: PE(TTM)=${pe} PB=${pb} 总市值${mcap}亿 换手率${turnover}%`;
        })
        .join("\n") || "无基本面数据";

    // 1.7 拉取持仓股最新公告（仅 standard_patrol / deep_research 策略）
    // quick_valuation / peer_compare 不拉公告，节省请求
    let announcementsSummary = "";
    const strategy: AnalysisStrategy = job.analysisStrategy || "standard_patrol";
    if (strategy === "standard_patrol" || strategy === "deep_research") {
      try {
        const annLines: string[] = [];
        for (const p of positions) {
          const anns = await getAnnouncements(p.symbol, 3);
          if (anns.length === 0) continue;
          const titles = anns
            .map((a) => `[${a.publishTime.slice(0, 10)}] ${a.title}`)
            .join("; ");
          annLines.push(`${p.name}: ${titles}`);
        }
        announcementsSummary = annLines.join("\n") || "无近期公告";
      } catch (e) {
        console.warn("[agentRunner] 公告拉取失败，降级为空上下文", e);
        announcementsSummary = "公告数据暂不可用";
      }
    }

    // 2. 拼装上下文
    const accountSummary = ctx.account
      ? `累计投入本金：${ctx.account.cumulativePrincipal}，现金：${ctx.account.cashBalance}`
      : "未设置账户";
    const positionsText =
      positions
        .map(
          (p) =>
            `${p.name}(${p.symbol}) 持仓${p.quantity}股 成本${p.avgCost} 现价${p.currentPrice} 浮盈${p.unrealizedPnl.toFixed(2)} 收益率${p.unrealizedPnlRate.toFixed(2)}%`
        )
        .join("\n") || "无持仓";
    const marketData = positions
      .map((p) => `${p.name}: 现价${p.currentPrice} 今日${p.todayChangeRate?.toFixed(2) || 0}%`)
      .join("\n");
    const prefs = ctx.memories
      .filter((m) => m.type === "preference" || m.type === "rule")
      .map((m) => `${m.title}: ${m.content}`)
      .join("\n");
    const recentAgentNotes = ctx.memories
      .filter((m) => m.type === "agent_note")
      .slice(-5)
      .map((m) => `${m.title}: ${m.content}`)
      .join("\n");

    // 3. 调用 AI 分析
    const agentInput = {
      accountSummary,
      positions: positionsText,
      marketData,
      klineSummary,
      fundamentalsSummary,
      announcementsSummary,
      userPreferences: prefs,
      recentAgentMemories: recentAgentNotes,
    };

    // 判断辩论模式：debateModelIds 选了 2+ 个且能在 ctx.models 中匹配到
    const debateModels =
      job.debateModelIds && job.debateModelIds.length > 0
        ? (ctx.models?.filter((m) => job.debateModelIds!.includes(m.id)) ?? [])
        : [];

    if (debateModels.length >= 2) {
      // 辩论模式：多模型独立分析后汇总共识/分歧
      const debateResult: DebateResult = await runAgentAnalysisDebate(debateModels, agentInput, strategy);
      const debateMessage: ChatMessage = {
        id: uid("msg"),
        role: "agent",
        type: "agent_run",
        content: debateResult.rawMarkdown,
        createdAt: nowIso(),
        // 透传完整辩论结果（含各模型结论 / 一致性），供前端渲染
        outputJson: debateResult as unknown as Record<string, unknown>,
        metadata: {
          agentRunId: run.id,
        },
      };
      ctx.onMessage(debateMessage);

      run.status = "success";
      run.finishedAt = nowIso();
      run.outputSummary = debateResult.overallSuggestion;
      run.outputJson = debateResult as unknown as Record<string, unknown>;
      ctx.onRunUpdate({ ...run });
      return run;
    }

    // 单模型路径（原逻辑）
    const output: AgentAnalysisOutput = await runAgentAnalysis(ctx.model, agentInput, strategy);

    // 4. 写入聊天消息
    const agentMessage: ChatMessage = {
      id: uid("msg"),
      role: "agent",
      type: "agent_run",
      content: output.rawMarkdown,
      createdAt: nowIso(),
      // 透传完整结构化输出（含 dimensions），供前端渲染雷达图 / 维度 badge
      outputJson: output as unknown as Record<string, unknown>,
      metadata: {
        agentRunId: run.id,
      },
    };
    ctx.onMessage(agentMessage);

    // 5. 更新 run
    run.status = "success";
    run.finishedAt = nowIso();
    run.outputSummary = output.suggestion;
    run.outputJson = output as unknown as Record<string, unknown>;
    ctx.onRunUpdate({ ...run });
    return run;
  } catch (e) {
    run.status = "failed";
    run.finishedAt = nowIso();
    run.errorMessage = (e as Error).message;
    ctx.onRunUpdate({ ...run });

    // 错误消息也写入聊天
    ctx.onMessage({
      id: uid("msg"),
      role: "system",
      type: "error",
      content: `Agent 任务「${job.name}」执行失败：${(e as Error).message}`,
      createdAt: nowIso(),
      metadata: {
        agentJobId: job.id,
      },
    });
    return run;
  }
}

// 计算下次执行时间
export function calculateNextRunAt(job: AgentJob): string | undefined {
  const now = new Date();
  if (!job.enabled) return undefined;

  if (job.triggerType === "interval" && job.intervalMinutes) {
    let next = new Date(now.getTime() + job.intervalMinutes * 60_000);
    // 仅交易时段任务：如果下次时间落在非交易时段，对齐到下一个交易时段开始
    if (job.tradingHoursOnly) {
      next = alignToNextTradingSession(next);
    }
    return next.toISOString();
  }
  if (job.triggerType === "fixed_time" && job.fixedTimes?.length) {
    // 找到下一个最近的固定时间
    const candidates = job.fixedTimes
      .map((t) => {
        const [h, m] = t.split(":").map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
        // 仅交易时段任务：如果该时间落在周末/非交易时段，跳到下一个交易日同一时间
        if (job.tradingHoursOnly) {
          return alignToNextTradingSession(d);
        }
        return d;
      })
      .sort((a, b) => a.getTime() - b.getTime());
    return candidates[0]?.toISOString();
  }
  return undefined;
}

// 判断是否到期
export function isJobDue(job: AgentJob, now = new Date()): boolean {
  if (!job.enabled || !job.nextRunAt) return false;
  // 时间未到
  if (new Date(job.nextRunAt).getTime() > now.getTime()) return false;
  // 已到期，但如果 tradingHoursOnly=true，还要求当前在交易时段（周末/非交易时段不触发）
  if (job.tradingHoursOnly && !isWithinTradingHours(now)) {
    return false;
  }
  return true;
}
