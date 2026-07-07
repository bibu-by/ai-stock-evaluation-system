// 记忆库领域模型
export type MemoryType =
  | "preference" // 用户偏好
  | "rule" // 投资规则
  | "stock_note" // 个股记忆
  | "agent_note" // Agent 记忆
  | "conversation"; // 对话记忆

export interface Memory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  importance: number; // 1-5
  symbol?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// 用户投资偏好
export interface UserPreference {
  riskTolerance: "low" | "medium" | "high";
  tradingCycle: "short" | "medium" | "long";
  focusIndustries: string[];
  avoidList?: string[]; // 禁止买入类型
  highDividend?: boolean;
  avoidGEM?: boolean; // 回避创业板
  markets: string[];
}

// 投资规则
export interface InvestmentRule {
  id: string;
  name: string;
  content: string;
  type: "max_position" | "stop_loss" | "take_profit" | "no_chase_high" | "no_st" | "custom";
  enabled: boolean;
  createdAt: string;
}

export const MEMORY_TYPE_LABEL: Record<MemoryType, string> = {
  preference: "用户偏好",
  rule: "投资规则",
  stock_note: "个股记忆",
  agent_note: "Agent 记忆",
  conversation: "对话记忆",
};

export const MEMORY_TYPE_COLOR: Record<MemoryType, string> = {
  preference: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  rule: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  stock_note: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  agent_note: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  conversation: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};
