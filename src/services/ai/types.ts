// AI Gateway 公共类型定义
// 各厂商 provider 实现与聚合层共享的类型契约。

import type {
  AiModelConfig,
  ChatCompletionRequest,
  StreamChatChunk,
} from "@/domain/ai";

// ====== 会话级 Token 用量统计 ======
// 用于在聊天面板底部展示"本次会话累计消耗"。
// 重置时机：用户切换会话 / 主动点击"清空会话" / 应用重启。
export interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
  byModel: Record<string, { prompt: number; completion: number; total: number; count: number }>;
}

// ====== 统一网关接口 ======
// 业务代码只调用统一接口，不同厂商在 provider 层处理差异。
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
