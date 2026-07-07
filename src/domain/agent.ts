// Agent 定时任务领域模型
export type TriggerType = "interval" | "fixed_time" | "condition";

export type AgentScope = "all_positions" | "watchlist" | "single_symbol";

export type AgentRunStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface AgentJob {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  intervalMinutes?: number; // 固定间隔（分钟）
  fixedTimes?: string[]; // 固定时间，如 ["09:35", "14:50"]
  condition?: AlertCondition; // 条件触发
  scope: AgentScope;
  symbol?: string; // scope=single_symbol 时使用
  tradingHoursOnly?: boolean; // 仅交易时段执行
  nextRunAt?: string; // ISO 时间
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Agent 执行记录
export interface AgentRun {
  id: string;
  jobId: string;
  jobName: string;
  status: AgentRunStatus;
  startedAt: string;
  finishedAt?: string;
  inputSnapshot?: Record<string, unknown>;
  outputSummary?: string;
  outputJson?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
}

// 风控条件
export interface AlertCondition {
  symbol?: string;
  metric: "price" | "change_rate" | "pnl_rate" | "total_drawdown" | "position_ratio";
  operator: "above" | "below" | "cross_up" | "cross_down";
  value: number;
}

// 风险提醒规则
export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  level: "info" | "notice" | "warning" | "severe";
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export type AlertLevel = "info" | "notice" | "warning" | "severe";

export const ALERT_LEVEL_LABEL: Record<AlertLevel, string> = {
  info: "信息",
  notice: "注意",
  warning: "警告",
  severe: "严重",
};

// Agent 建议类型
export type SuggestionType =
  | "continue_watch"
  | "reduce_position"
  | "wait_confirm"
  | "take_profit_watch"
  | "stop_loss_warn"
  | "buy_position"; // 新增：买入新标的

// 决策方向归并
export type DecisionDirection = "buy" | "sell" | "hold";

export interface DecisionMeta {
  direction: DecisionDirection;
  label: string;       // 买入 / 卖出 / 观望
  color: string;      // tailwind class
}

export const SUGGESTION_TYPE_TO_DECISION: Record<SuggestionType, DecisionMeta> = {
  buy_position: { direction: "buy", label: "买入", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  reduce_position: { direction: "sell", label: "卖出", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  stop_loss_warn: { direction: "sell", label: "卖出", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  continue_watch: { direction: "hold", label: "观望", color: "text-muted-foreground bg-muted" },
  wait_confirm: { direction: "hold", label: "观望", color: "text-muted-foreground bg-muted" },
  take_profit_watch: { direction: "hold", label: "观望", color: "text-muted-foreground bg-muted" },
};

export const ALERT_LEVEL_COLOR: Record<AlertLevel, string> = {
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  notice: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  severe: "text-red-400 bg-red-500/10 border-red-500/30",
};

export const TRIGGER_TYPE_LABEL: Record<TriggerType, string> = {
  interval: "固定间隔",
  fixed_time: "固定时间",
  condition: "条件触发",
};

export const AGENT_SCOPE_LABEL: Record<AgentScope, string> = {
  all_positions: "全部持仓",
  watchlist: "重点观察",
  single_symbol: "单只股票",
};

export const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  pending: "等待中",
  running: "执行中",
  success: "成功",
  failed: "失败",
  skipped: "跳过",
};

export const AGENT_RUN_STATUS_COLOR: Record<AgentRunStatus, string> = {
  pending: "text-muted-foreground bg-muted",
  running: "text-blue-400 bg-blue-500/10",
  success: "text-emerald-400 bg-emerald-500/10",
  failed: "text-red-400 bg-red-500/10",
  skipped: "text-muted-foreground bg-muted",
};
