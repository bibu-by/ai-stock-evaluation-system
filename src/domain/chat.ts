// 聊天领域模型
export type ChatRole = "user" | "assistant" | "system" | "agent";

export type MessageType =
  | "text" // 普通文本
  | "confirmation" // 确认卡片
  | "alert" // 提醒
  | "agent_run" // Agent 执行结果
  | "error"; // 错误

export interface ChatMessage {
  id: string;
  role: ChatRole;
  type: MessageType;
  content: string;
  createdAt: string;
  // 发送状态（仅 user 消息使用）：sending 流程进行中 / sent 已成功 / failed 失败可重试
  status?: "sending" | "sent" | "failed";
  // 所属会话 id（旧消息无此字段视为默认会话）
  conversationId?: string;
  // Agent 执行结果的结构化输出（type=agent_run 时存储 AgentAnalysisOutput，含 dimensions 等）
  outputJson?: Record<string, unknown>;
  // 确认卡片元数据
  metadata?: {
    intent?: string; // 意图：update_account / add_position / sell / create_agent_job / set_alert / save_memory
    draft?: unknown; // 结构化草稿
    alertLevel?: string;
    agentRunId?: string;
    confirmed?: boolean;
    rejected?: boolean;
    // 错误重试与消息编辑相关
    errorMessage?: string; // user 消息失败时的错误描述
    relatedUserMessageId?: string; // error 消息关联的 user 消息 id（用于触发重试）
    agentJobId?: string; // agent error 消息关联的 job id（用于触发重新运行）
  };
}

// AI 解析用户输入后的结构化草稿
export interface ParsedDraft {
  intent: string;
  account?: {
    cumulativePrincipal?: number;
    cashBalance?: number;
  };
  positions?: Array<{
    name: string;
    symbol?: string;
    quantity: number;
    avgCost?: number;     // 买入单价（用户说"每股 X"时填）
    totalCost?: number;   // 买入总花费（用户说"总共 X"时填，此时 avgCost 留空）
    action?: "buy" | "sell" | "update";
  }>;
  agentJob?: {
    name: string;
    triggerType: "interval" | "fixed_time" | "condition";
    intervalMinutes?: number;
    fixedTimes?: string[];
    scope: "all_positions" | "watchlist" | "single_symbol";
    symbol?: string;
    tradingHoursOnly?: boolean; // 仅交易时段执行（默认 true）
  };
  alert?: {
    name: string;
    symbol?: string;
    metric: string;
    operator: string;
    value: number;
  };
  memory?: {
    type: string;
    title: string;
    content: string;
  };
  // 用户问到的股票名称或代码（仅 query/chat 意图填充，用于行情上下文注入）
  queriedSymbols?: string[];
  requiresConfirmation: boolean;
  summary: string; // 给用户看的自然语言摘要
}

// 会话
export interface Conversation {
  id: string;
  title: string;
  modelProvider?: string;
  modelName?: string;
  createdAt: string;
  updatedAt: string;
}
