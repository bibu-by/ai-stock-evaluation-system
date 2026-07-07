// AI Gateway - 多厂商模型适配层
// 业务代码只调用统一接口，不同厂商在适配层处理差异。
// 桌面 GUI 版本：API Key 优先从系统安全凭据读取（apiKeyRef），其次回退到模型 JSON 里的 apiKey。

import type {
  AiModelConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChatChunk,
} from "@/domain/ai";
import type { ParsedDraft } from "@/domain/chat";
import type { SuggestionType } from "@/domain/agent";
import { isTauri } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/tauri";
import { readApiKey } from "./localStore";

// ====== 会话级 Token 用量统计 ======
// 用于在聊天面板底部展示"本次会话累计消耗"。
// 重置时机：用户切换会话 / 主动点击"清空会话" / 应用重启。
interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
  byModel: Record<string, { prompt: number; completion: number; total: number; count: number }>;
}

// ====== SSE 流式响应帧类型 ======
// 仅约束各厂商流式响应中实际读取的字段，未读取字段保持宽松以便兼容厂商扩展。

/** OpenAI 兼容流式帧（DeepSeek / OpenAI / 通义等） */
interface OpenAIStreamFrame {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Anthropic 流式事件帧 */
interface AnthropicStreamFrame {
  type?: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
}

/** Gemini SSE 流式帧 */
interface GeminiStreamFrame {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

let sessionUsage: SessionUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  callCount: 0,
  byModel: {},
};

export function getSessionUsage(): SessionUsage {
  // 返回浅拷贝，避免外部直接修改内部状态
  return {
    promptTokens: sessionUsage.promptTokens,
    completionTokens: sessionUsage.completionTokens,
    totalTokens: sessionUsage.totalTokens,
    callCount: sessionUsage.callCount,
    byModel: Object.fromEntries(
      Object.entries(sessionUsage.byModel).map(([k, v]) => [k, { ...v }])
    ),
  };
}

export function resetSessionUsage(): void {
  sessionUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    callCount: 0,
    byModel: {},
  };
}

function recordUsage(model: AiModelConfig, usage: ChatCompletionResponse["usage"]): void {
  if (!usage) return;
  const p = usage.promptTokens || 0;
  const c = usage.completionTokens || 0;
  const t = usage.totalTokens || p + c;
  sessionUsage.promptTokens += p;
  sessionUsage.completionTokens += c;
  sessionUsage.totalTokens += t;
  sessionUsage.callCount += 1;
  const key = `${model.providerLabel || model.provider}/${model.modelName}`;
  const entry = sessionUsage.byModel[key] || { prompt: 0, completion: 0, total: 0, count: 0 };
  entry.prompt += p;
  entry.completion += c;
  entry.total += t;
  entry.count += 1;
  sessionUsage.byModel[key] = entry;
}

// 获取模型实际可用的 API Key：优先系统凭据，回退 JSON
async function resolveApiKey(model: AiModelConfig): Promise<string> {
  if (model.apiKeyRef && isTauri()) {
    const key = await readApiKey(model.apiKeyRef);
    if (key) return key;
  }
  return model.apiKey || "";
}

// 通过 Rust 代理调用 AI API（非流式）：前端只传 apiKeyRef 引用，Key 全程不离开 Rust 进程
// 返回值与 ChatCompletionResponse 一致；失败时抛出错误，由调用方决定是否回退
async function callAiApiViaRust(
  model: AiModelConfig,
  body: ChatCompletionRequest & { response_format?: { type: string } }
): Promise<ChatCompletionResponse> {
  const args = {
    provider: model.provider,
    baseUrl: model.baseUrl,
    modelName: model.modelName,
    apiKeyRef: model.apiKeyRef || "",
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: body.temperature,
    maxTokens: body.maxTokens,
    jsonMode: !!(body as { response_format?: { type: string } }).response_format,
  };
  const res = await invoke<{
    content: string;
    finishReason: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>("call_ai_api", args);
  return {
    content: res.content,
    finishReason: res.finishReason,
    usage: res.usage,
  };
}

// 统一接口
export interface AiGateway {
  generateText(
    model: AiModelConfig,
    messages: ChatCompletionRequest["messages"],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;

  generateJson<T = unknown>(
    model: AiModelConfig,
    messages: ChatCompletionRequest["messages"],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<T>;

  streamChat(
    model: AiModelConfig,
    messages: ChatCompletionRequest["messages"],
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): AsyncIterable<StreamChatChunk>;

  testConnection(model: AiModelConfig): Promise<{ ok: boolean; message: string }>;
}

// 默认实现：使用 OpenAI 兼容协议（绝大多数厂商均支持）
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
      // 容错：尝试从文本中提取 JSON
      const match = res.content.match(/```json\s*([\s\S]*?)```/) || res.content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[1] || match[0]);
        } catch (e) {
          console.warn("[aiGateway] 从 AI 返回文本中提取 JSON 失败", e);
        }
      }
      throw new Error("AI 返回内容不是合法 JSON：" + res.content.slice(0, 200));
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

// Anthropic 适配（消息接口不同，单独处理）
async function callAnthropic(
  model: AiModelConfig,
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  // 优先走 Rust 代理
  if (isTauri() && model.apiKeyRef) {
    try {
      return await callAiApiViaRust(model, body);
    } catch (rustErr) {
      const msg = (rustErr as Error).message || String(rustErr);
      if (msg.includes("未配置 API Key") || msg.includes("Anthropic API 错误")) {
        throw rustErr;
      }
      console.warn("[aiGateway] Rust 代理 Anthropic 失败，回退到前端 fetch：", msg);
    }
  }
  // 前端 fetch 回退
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");
  const systemMsg = body.messages.find((m) => m.role === "system")?.content || "";
  const userMessages = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(`${model.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.modelName,
      system: systemMsg,
      messages: userMessages,
      max_tokens: body.maxTokens ?? 1024,
      temperature: body.temperature ?? 0.6,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API 错误：${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content = (data.content?.[0]?.text || "") as string;
  return {
    content,
    finishReason: data.stop_reason || "stop",
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens:
        (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// Gemini 适配
async function callGemini(
  model: AiModelConfig,
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  // 优先走 Rust 代理
  if (isTauri() && model.apiKeyRef) {
    try {
      return await callAiApiViaRust(model, body);
    } catch (rustErr) {
      const msg = (rustErr as Error).message || String(rustErr);
      if (msg.includes("未配置 API Key") || msg.includes("Gemini API 错误")) {
        throw rustErr;
      }
      console.warn("[aiGateway] Rust 代理 Gemini 失败，回退到前端 fetch：", msg);
    }
  }
  // 前端 fetch 回退
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");
  const contents = body.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `${model.baseUrl}/models/${model.modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: body.temperature ?? 0.6,
        maxOutputTokens: body.maxTokens ?? 1024,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API 错误：${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return {
    content,
    finishReason: data.candidates?.[0]?.finishReason || "stop",
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

// OpenAI 兼容协议
async function callOpenAICompatible(
  model: AiModelConfig,
  body: Record<string, unknown>,
  isTest = false
): Promise<ChatCompletionResponse> {
  if (model.provider === "anthropic") {
    const res = await callAnthropic(model, body as unknown as ChatCompletionRequest);
    if (!isTest) recordUsage(model, res.usage);
    return res;
  }
  if (model.provider === "gemini") {
    const res = await callGemini(model, body as unknown as ChatCompletionRequest);
    if (!isTest) recordUsage(model, res.usage);
    return res;
  }
  // OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义 均兼容
  // 优先走 Rust 代理（API Key 不离开 Rust 进程），失败回退到前端 fetch
  if (isTauri() && model.apiKeyRef) {
    try {
      const res = await callAiApiViaRust(model, body as unknown as ChatCompletionRequest & { response_format?: { type: string } });
      if (!isTest) recordUsage(model, res.usage);
      return res;
    } catch (rustErr) {
      // Rust 代理失败：如果错误是"未配置 API Key"或明确的业务错误，直接抛出
      const msg = (rustErr as Error).message || String(rustErr);
      if (msg.includes("未配置 API Key") || msg.includes("API 错误")) {
        throw rustErr;
      }
      // 其它错误（如 invoke 失败、网络异常）回退到前端 fetch
      console.warn("[aiGateway] Rust 代理失败，回退到前端 fetch：", msg);
    }
  }
  // 前端 fetch 回退路径
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");
  const res = await fetch(`${model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI API 错误：${res.status} ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const result: ChatCompletionResponse = {
    content,
    finishReason: data.choices?.[0]?.finish_reason || "stop",
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
  if (!isTest) recordUsage(model, result.usage);
  return result;
}

// ====== 流式响应实现 ======
// 通用 SSE 行解析：从 ReadableStream 中按行读取，遇到 `data: ` 前缀的行收集 payload，
// 空行视为帧边界。yield 每个 data payload 字符串。
async function* readSseDataLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return;
      }
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      // 按 \n 切分，逐行处理
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          yield trimmed.slice(5).trim();
        }
        // 跳过 event: 行、注释行、空行
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

// OpenAI 兼容厂商流式（含 OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义）
async function* callOpenAICompatibleStream(
  model: AiModelConfig,
  messages: ChatCompletionRequest["messages"],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<StreamChatChunk> {
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");

  const res = await fetch(`${model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.modelName,
      messages,
      temperature: options?.temperature ?? 0.6,
      max_tokens: options?.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI API 错误：${res.status} ${txt.slice(0, 200)}`);
  }
  if (!res.body) return;

  let lastUsage: StreamChatChunk["usage"] | undefined;
  let lastFinishReason: string | undefined;

  for await (const payload of readSseDataLines(res.body, options?.signal)) {
    if (payload === "[DONE]") {
      break;
    }
    if (!payload) continue;
    let data: OpenAIStreamFrame;
    try {
      data = JSON.parse(payload) as OpenAIStreamFrame;
    } catch (e) {
      console.warn("[aiGateway] OpenAI 流式帧解析失败，已跳过", e);
      continue; // 跳过无法解析的帧
    }
    const delta: string = data.choices?.[0]?.delta?.content || "";
    const finishReason: string | undefined = data.choices?.[0]?.finish_reason || undefined;
    if (finishReason) lastFinishReason = finishReason;
    if (data.usage) {
      lastUsage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      };
    }
    if (delta) {
      yield { delta };
    }
  }

  // 录入会话用量并发送最终 chunk
  if (lastUsage) {
    recordUsage(model, lastUsage);
  } else {
    // 厂商未返回 usage 时仅记录一次调用次数
    recordUsage(model, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }
  yield { delta: "", finishReason: lastFinishReason, usage: lastUsage };
}

// Anthropic 流式
async function* callAnthropicStream(
  model: AiModelConfig,
  messages: ChatCompletionRequest["messages"],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<StreamChatChunk> {
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(`${model.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.modelName,
      system: systemMsg,
      messages: userMessages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.6,
      stream: true,
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API 错误：${res.status} ${txt.slice(0, 200)}`);
  }
  if (!res.body) return;

  let promptTokens = 0;
  let completionTokens = 0;
  let lastFinishReason: string | undefined;
  let sawMessageStop = false;

  // Anthropic SSE 同时有 event: 和 data: 行，需要追踪当前 event 类型
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentEvent = "";

  try {
    while (!sawMessageStop) {
      if (options?.signal?.aborted) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let data: AnthropicStreamFrame;
          try {
            data = JSON.parse(payload) as AnthropicStreamFrame;
          } catch (e) {
            console.warn("[aiGateway] Anthropic 流式帧解析失败，已跳过", e);
            continue;
          }
          if (currentEvent === "message_start") {
            promptTokens = data.message?.usage?.input_tokens || 0;
          } else if (currentEvent === "content_block_delta") {
            const text: string = data.delta?.text || "";
            if (text) {
              yield { delta: text };
            }
          } else if (currentEvent === "message_delta") {
            completionTokens = data.usage?.output_tokens ?? completionTokens;
            if (data.delta?.stop_reason) {
              lastFinishReason = data.delta.stop_reason;
            }
          } else if (currentEvent === "message_stop") {
            sawMessageStop = true;
            break;
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const usage: StreamChatChunk["usage"] = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
  recordUsage(model, usage);
  yield { delta: "", finishReason: lastFinishReason, usage };
}

// Gemini 流式
async function* callGeminiStream(
  model: AiModelConfig,
  messages: ChatCompletionRequest["messages"],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<StreamChatChunk> {
  const apiKey = await resolveApiKey(model);
  if (!apiKey) throw new Error("未配置 API Key，请先在模型设置中添加。");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `${model.baseUrl}/models/${model.modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.6,
        maxOutputTokens: options?.maxTokens ?? 1024,
      },
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API 错误：${res.status} ${txt.slice(0, 200)}`);
  }
  if (!res.body) return;

  let lastUsage: StreamChatChunk["usage"] | undefined;
  let lastFinishReason: string | undefined;

  for await (const payload of readSseDataLines(res.body, options?.signal)) {
    if (!payload) continue;
    let data: GeminiStreamFrame;
    try {
      data = JSON.parse(payload) as GeminiStreamFrame;
    } catch (e) {
      console.warn("[aiGateway] Gemini 流式帧解析失败，已跳过", e);
      continue;
    }
    const parts = data.candidates?.[0]?.content?.parts;
    const text: string = Array.isArray(parts) ? (parts.map((p) => p.text || "").join("")) : "";
    if (data.candidates?.[0]?.finishReason) {
      lastFinishReason = data.candidates[0].finishReason;
    }
    if (data.usageMetadata) {
      lastUsage = {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      };
    }
    if (text) {
      yield { delta: text };
    }
  }

  if (lastUsage) {
    recordUsage(model, lastUsage);
  } else {
    recordUsage(model, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }
  yield { delta: "", finishReason: lastFinishReason, usage: lastUsage };
}

// ====== 业务专用：自然语言解析为结构化草稿 ======

const PARSE_SYSTEM_PROMPT = `你是 AI 炒股 Agent 系统的输入解析器。
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
}

const AGENT_SYSTEM_PROMPT = `你是一个股票投资辅助 Agent，不是持牌投顾，不能承诺收益，不能替用户下单。
你的任务是帮助用户记录账户、分析持仓、识别风险、总结行情变化，并给出谨慎的辅助观点。

你必须遵守：
1. 所有观点都要说明依据。
2. 不得使用"必涨""稳赚""马上买入"等绝对化表达。
3. 涉及买卖时，必须提醒用户自行决策。
4. 如果数据不足，必须明确说明数据不足。
5. 输出要简洁、可执行、带风险提示。
6. 当发现明确板块机会且用户尚未持有时，可在 suggestionType 输出 "buy_position" 并在 opportunities 中说明标的与原因，但 rawMarkdown 仍需提示"需用户自行决策，本建议不构成投资建议"。

请同时输出严格 JSON 字段，rawMarkdown 字段为给用户展示的完整中文 Markdown。`;

export async function runAgentAnalysis(
  model: AiModelConfig,
  input: AgentAnalysisInput
): Promise<AgentAnalysisOutput> {
  const userContent = `请基于以下信息分析用户当前持仓：

账户信息：
${input.accountSummary}

持仓列表：
${input.positions}

行情数据：
${input.marketData}

用户投资偏好：
${input.userPreferences}

历史 Agent 观点：
${input.recentAgentMemories}

请输出 JSON，包含字段：marketOverview, positionChanges, risks(数组), opportunities(数组), suggestionType(枚举), suggestion, confidence(0-1), needUserConfirm(boolean), rawMarkdown(给用户看的完整中文 Markdown 报告)。
注意：不得给出确定性收益承诺，不得替用户做最终买卖决定。
若发现明显板块机会且用户尚未持有，可输出 suggestionType="buy_position"，并在 opportunities 中说明标的与原因。`;

  const result = await defaultAiGateway.generateJson<AgentAnalysisOutput>(model, [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
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
  };
}
