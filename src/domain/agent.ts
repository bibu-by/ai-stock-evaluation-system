// Agent 定时任务领域模型
export type TriggerType = "interval" | "fixed_time" | "condition";

export type AgentScope = "all_positions" | "watchlist" | "single_symbol";

export type AgentRunStatus = "pending" | "running" | "success" | "failed" | "skipped";

// 调研流水线策略（Task 3）
export type AnalysisStrategy = "quick_valuation" | "standard_patrol" | "deep_research" | "peer_compare";

export const ANALYSIS_STRATEGY_LABEL: Record<AnalysisStrategy, string> = {
  quick_valuation: "快速估值",
  standard_patrol: "标准巡检",
  deep_research: "深度调研",
  peer_compare: "同类对比",
};

export const ANALYSIS_STRATEGY_DESC: Record<AnalysisStrategy, string> = {
  quick_valuation: "约 30s：价格 → 一致预期 EPS → 前向 PE/PEG",
  standard_patrol: "约 60s（默认）：技术面 + 基本面 + 风险面",
  deep_research: "约 120s：机构覆盖 → 估值 → 概念 → 资金 → 龙虎榜 → 解禁 → 两融",
  peer_compare: "约 60s：同行业多只股票横向排列对比",
};

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
  analysisStrategy?: AnalysisStrategy; // 调研流水线策略，默认 standard_patrol
  debateModelIds?: string[]; // 辩论模式：选定的模型 id 列表（长度 >= 2 时启用辩论）
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
  metric: "price" | "change_rate" | "pnl_rate" | "total_drawdown" | "position_ratio" | "ma_cross_up" | "ma_cross_down";
  operator: "above" | "below" | "cross_up" | "cross_down";
  value: number;
  maWindow?: number;  // MA 窗口，默认 20（用于 ma_cross_up/down）
  composite?: {
    op: "AND" | "OR";
    rules: AlertCondition[];  // 嵌套组合条件
  };
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

// 单个维度的评分与依据
export interface DimensionScore {
  score: number;      // 1-10
  rationale: string;  // 1-2 句判断依据
}

// 5 维度评分集合
export interface AnalysisDimensions {
  technical: DimensionScore;    // 技术面：趋势/均线/量价
  fundamental: DimensionScore;  // 基本面：估值/盈利/成长
  capital: DimensionScore;      // 资金面：主力/北向/筹码
  sentiment: DimensionScore;    // 情绪面：热度/题材/舆情
  risk: DimensionScore;         // 风险面：回撤/集中度/事件
}

export const DIMENSION_LABELS: Record<keyof AnalysisDimensions, string> = {
  technical: "技术面",
  fundamental: "基本面",
  capital: "资金面",
  sentiment: "情绪面",
  risk: "风险面",
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

// ====== 多模型辩论机制（Task 2） ======

// 单模型辩论结论
export interface DebateModelConclusion {
  modelId: string;
  modelName: string;
  suggestionType: SuggestionType;
  confidence: number;
  dimensions?: AnalysisDimensions; // 复用 Task 1 的多维度评分类型
  summary: string; // 该模型的核心结论摘要
}

// 一致性枚举
export type DebateConsensus =
  | "all_bull"
  | "majority_bull"
  | "divided"
  | "majority_bear"
  | "all_bear";

// 辩论汇总结果
export interface DebateResult {
  models: DebateModelConclusion[];
  consensus: DebateConsensus;
  consensusPoints: string[]; // 共识点
  dissentPoints: string[]; // 分歧点
  overallSuggestion: string; // 综合建议
  modelDistribution: Record<string, number>; // modelId -> confidence 加权
  rawMarkdown: string; // 给用户展示的完整辩论报告
}

export const DEBATE_CONSENSUS_LABEL: Record<DebateConsensus, string> = {
  all_bull: "全部看多",
  majority_bull: "多数看多",
  divided: "观点分歧",
  majority_bear: "多数看空",
  all_bear: "全部看空",
};

export const DEBATE_CONSENSUS_COLOR: Record<DebateConsensus, string> = {
  all_bull: "text-red-400 bg-red-500/10 border-red-500/30",
  majority_bull: "text-red-400 bg-red-500/10 border-red-500/30",
  divided: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  majority_bear: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  all_bear: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
