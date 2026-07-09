// Anthropic Claude provider
// 消息接口与 OpenAI 不兼容，单独处理 system / messages 字段映射与 SSE 事件解析。

import type {
  AiModelConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChatChunk,
} from "@/domain/ai";
import { isTauri } from "@/lib/utils";
import {
  callAiApiViaRust,
  recordUsage,
  resolveApiKey,
} from "../internal";

/** Anthropic 流式事件帧 */
interface AnthropicStreamFrame {
  type?: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
}

// Anthropic 适配（消息接口不同，单独处理）
export async function callAnthropic(
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

// Anthropic 流式
export async function* callAnthropicStream(
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
