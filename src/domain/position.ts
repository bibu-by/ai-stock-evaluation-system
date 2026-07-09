// 持仓领域模型
export type Market = "A_SHARE" | "HK" | "US" | "ETF" | "FUND";

export type AiStatus =
  | "watch" // 观察
  | "cautious" // 谨慎
  | "strong" // 强势
  | "risk" // 风险
  | "wait_confirm" // 等待确认
  | "stable"; // 企稳

export interface Position {
  id: string;
  symbol: string; // 股票代码，如 600519.SH
  name: string; // 股票名称
  market: Market;
  quantity: number;
  availableQuantity?: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlRate: number;
  todayChangeRate?: number; // 今日涨跌幅
  aiStatus?: AiStatus;
  aiStatusText?: string; // AI 标签文本：观察、谨慎、强势、风险、等待确认
  note?: string;
  externalFunding?: boolean; // 是否外部资金买入（如银行卡转入），删除时用于判断回退现金还是本金
  watchlist?: boolean; // 是否重点观察
  updatedAt: string;
}

// 行情快照
export interface Quote {
  symbol: string;
  name: string;
  currentPrice: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changeRate: number; // 今日涨跌幅
  volume: number;
  turnover: number; // 成交额
  turnoverRate?: number; // 换手率
  pe?: number; // PE(TTM) - 语义对齐为 PE(TTM)
  pb?: number;
  updatedAt: string;
  // 基本面字段（腾讯财经补充）
  peTtm?: number;
  peStatic?: number;
  marketCapYi?: number; // 总市值(亿)
  floatMarketCapYi?: number; // 流通市值(亿)
  limitUp?: number;
  limitDown?: number;
  // 行情数据来源（"sina" / "tencent" / "sina+tencent"），体现数据源 fallback
  source?: string;
}

// K 线
export interface KlineBar {
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  // 均线（MA5/MA10/MA20，前几根 K 线可能为 undefined）
  ma5?: number;
  ma10?: number;
  ma20?: number;
}

export type KlinePeriod = "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1w" | "1M";

// 公告条目（对应 Rust 端 AnnouncementItem，camelCase）
export interface AnnouncementItem {
  title: string;
  publishTime: string; // ISO 时间或日期字符串
  announcementType?: string; // 公告类型（如"财报"/"重大事项"）
  url?: string;
}

export const AI_STATUS_LABEL: Record<AiStatus, string> = {
  watch: "观察",
  cautious: "谨慎",
  strong: "强势",
  risk: "风险",
  wait_confirm: "等待确认",
  stable: "企稳",
};

export const AI_STATUS_COLOR: Record<AiStatus, string> = {
  watch: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  cautious: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  strong: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  risk: "text-red-400 bg-red-500/10 border-red-500/30",
  wait_confirm: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  stable: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};
