// Google Gemini provider
// 使用 generateContent / streamGenerateContent 接口，消息字段映射与 usageMetadata 解析独立处理。

import type {
  AiModelConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChatChunk,
} from "@/domain/ai";
import { isTauri } from "@/lib/utils";
import {
  callAiApiViaRust,
  readSseDataLines,
  recordUsage,
  resolveApiKey,
} from "../internal";

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

// Gemini 适配
export async function callGemini(
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

// Gemini 流式
export async function* callGeminiStream(
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
