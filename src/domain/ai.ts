// AI 模型领域模型
export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "glm"
  | "kimi"
  | "ollama"
  | "custom";

export interface AiModelConfig {
  id: string;
  provider: AiProvider;
  providerLabel: string; // 显示名
  modelName: string;
  displayName?: string;
  baseUrl: string;
  // 正式版本：JSON 只保存 apiKeyRef，真正的 API Key 存在系统安全凭据里
  apiKey?: string; // 兼容旧数据 / 开发环境
  apiKeyRef?: string; // 形如 "ai-stock-agent:model_001"
  isEnabled: boolean;
  isDefault: boolean;
  contextLength?: number;
  supportsTools?: boolean;
  supportsJson?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  jsonMode?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// 流式聊天增量 chunk
export interface StreamChatChunk {
  delta: string; // 增量文本
  finishReason?: string; // 仅最后一个 chunk 携带
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }; // 仅最后一个 chunk 携带
}

export const PROVIDER_PRESETS: Array<{
  provider: AiProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}> = [
  {
    provider: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    // GPT-4.1 / GPT-4o 系列为当前主力；GPT-5 系列视账号权限逐步开放
    defaultModel: "gpt-4o-mini",
    models: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
    ],
  },
  {
    provider: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    // Claude 4.x 为当前主力；旧版 3.x 保留兼容
    defaultModel: "claude-sonnet-4-6",
    models: [
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-opus-4-6",
      "claude-opus-4-1",
      "claude-opus-4",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-sonnet-4",
      "claude-haiku-4-5",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    // Gemini 2.5 Pro / Flash 为当前主力；2.0 系列保留兼容
    defaultModel: "gemini-2.5-flash",
    models: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-2.0-pro-exp",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    // DeepSeek-V4 为最新一代（2026-04），deepseek-chat/reasoner 仍兼容指向 V3.2/V4
    defaultModel: "deepseek-chat",
    models: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-v3.2",
      "deepseek-r1",
    ],
  },
  {
    provider: "qwen",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // Qwen3 / Qwen3.5 为当前主力；Qwen2.5 保留兼容
    defaultModel: "qwen-plus",
    models: [
      "qwen3-235b-a22b",
      "qwen3-80b-a3b",
      "qwen3-32b",
      "qwen3-14b",
      "qwen3-8b",
      "qwen3-4b",
      "qwen3-1.5b",
      "qwen3-0.6b",
      "qwen3-coder-480b-a35b",
      "qwen-plus",
      "qwen-max",
      "qwen-turbo",
      "qwen-long",
      "qwen2.5-72b-instruct",
      "qwen2.5-32b-instruct",
      "qwen2.5-14b-instruct",
      "qwen2.5-7b-instruct",
    ],
  },
  {
    provider: "glm",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    // GLM-4 系列为当前主力；GLM-4-Flash 作为轻量默认
    defaultModel: "glm-4-flash",
    models: [
      "glm-4-plus",
      "glm-4-0520",
      "glm-4",
      "glm-4-air",
      "glm-4-airx",
      "glm-4-flash",
      "glm-4-flashx",
      "glm-4v-plus",
      "glm-4v",
      "glm-3-turbo",
    ],
  },
  {
    provider: "kimi",
    label: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    // Kimi K2 系列为当前主力（2025-06）
    defaultModel: "kimi-k2-0711-preview",
    models: [
      "kimi-k2-0711-preview",
      "kimi-k2-0711",
      "kimi-k2-think-0711",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
  },
  {
    provider: "ollama",
    label: "Ollama 本地",
    baseUrl: "http://localhost:11434/v1",
    // 本地模型更新较快，这里列出常见推荐；用户可自行输入任意模型名
    defaultModel: "llama3.1",
    models: [
      "llama3.1",
      "llama3.2",
      "llama3.3",
      "qwen2.5",
      "qwen3",
      "deepseek-r1",
      "deepseek-v3",
      "gemma3",
      "phi4",
      "mistral",
      "mixtral",
    ],
  },
  {
    provider: "custom",
    label: "自定义 OpenAI Compatible",
    baseUrl: "",
    defaultModel: "",
    models: [],
  },
];

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  glm: "智谱 GLM",
  kimi: "Moonshot Kimi",
  ollama: "Ollama 本地",
  custom: "自定义",
};
