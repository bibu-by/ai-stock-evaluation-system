// AI Gateway 共享内部辅助
// 跨厂商复用的纯函数、状态管理与 Rust 代理调用。provider 实现与聚合层共享这些能力，
// 避免 provider 之间横向依赖或与聚合层形成循环依赖。

import type {
  AiModelConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "@/domain/ai";
import type { SessionUsage } from "./types";
import { isTauri } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/tauri";
import { readApiKey } from "../localStore";

// ====== 会话级 Token 用量统计 ======
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

export function recordUsage(model: AiModelConfig, usage: ChatCompletionResponse["usage"]): void {
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

// 从文本中提取首个平衡的 JSON 对象（跳过字符串内的花括号）
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

// 从 AI 返回文本中容错提取 JSON：
// 1. 优先匹配 ```json ... ``` 代码块
// 2. 退而匹配首个平衡的 {...} 对象（避免贪婪正则匹配到非 JSON 内容）
// 3. 仍解析失败时抛错（保持原 generateJson 容错行为）
export function extractJsonFromText(text: string): unknown {
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim());
    } catch (e) {
      console.warn("[aiGateway] 从代码块中提取 JSON 失败", e);
    }
  }
  const firstJson = extractFirstJsonObject(text);
  if (firstJson) {
    try {
      return JSON.parse(firstJson);
    } catch (e) {
      console.warn("[aiGateway] 从文本中提取首个 JSON 对象失败", e);
    }
  }
  throw new Error("AI 返回内容不是合法 JSON：" + text.slice(0, 200));
}

// 获取模型实际可用的 API Key：优先系统凭据，回退 JSON
export async function resolveApiKey(model: AiModelConfig): Promise<string> {
  if (model.apiKeyRef && isTauri()) {
    const key = await readApiKey(model.apiKeyRef);
    if (key) return key;
  }
  return model.apiKey || "";
}

// 通过 Rust 代理调用 AI API（非流式）：前端只传 apiKeyRef 引用，Key 全程不离开 Rust 进程
// 返回值与 ChatCompletionResponse 一致；失败时抛出错误，由调用方决定是否回退
export async function callAiApiViaRust(
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

// ====== SSE 流式响应解析 ======
// 纯函数：从一段完整的 SSE 文本中提取所有 data: 行的 payload。
// 跳过 event: 行、注释行、空行；payload 去掉 "data:" 前缀和首尾空白。
// 抽出为可独立测试的纯函数；readSseDataLines 内部对单行使用相同判定逻辑。
export function parseSseDataLines(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      out.push(trimmed.slice(5).trim());
    }
    // 跳过 event: 行、注释行、空行
  }
  return out;
}

// 通用 SSE 行解析：从 ReadableStream 中按行读取，遇到 `data: ` 前缀的行收集 payload，
// 空行视为帧边界。yield 每个 data payload 字符串。
export async function* readSseDataLines(
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
