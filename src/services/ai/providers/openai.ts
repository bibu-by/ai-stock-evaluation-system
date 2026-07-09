// OpenAI 兼容协议 provider
// 覆盖 OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义 等兼容厂商。
// callOpenAICompatible 作为兼容入口，内部按 model.provider 分流到对应厂商实现，
// 保持与拆分前完全一致的行为。

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
import { callAnthropic } from "./anthropic";
import { callGemini } from "./gemini";

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

// OpenAI 兼容协议
export async function callOpenAICompatible(
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

// OpenAI 兼容厂商流式（含 OpenAI / DeepSeek / Qwen / GLM / Kimi / Ollama / 自定义）
export async function* callOpenAICompatibleStream(
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
