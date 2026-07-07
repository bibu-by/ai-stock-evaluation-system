// 交易领域模型
export type TradeType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAW" | "DIVIDEND";

export interface Trade {
  id: string;
  symbol: string;
  name: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee: number;
  amount: number; // 总金额 = quantity * price + fee (买入) 或 quantity * price - fee (卖出)
  tradedAt: string; // ISO 时间
  source: "manual" | "ai_parse" | "import";
  rawInput?: string;
  note?: string;
  createdAt: string;
}

export const TRADE_TYPE_LABEL: Record<TradeType, string> = {
  BUY: "买入",
  SELL: "卖出",
  DEPOSIT: "入金",
  WITHDRAW: "出金",
  DIVIDEND: "分红",
};

export const TRADE_TYPE_COLOR: Record<TradeType, string> = {
  BUY: "text-red-400",
  SELL: "text-emerald-400",
  DEPOSIT: "text-blue-400",
  WITHDRAW: "text-amber-400",
  DIVIDEND: "text-purple-400",
};
