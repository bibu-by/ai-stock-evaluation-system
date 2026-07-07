// 账户领域模型
export type Currency = "CNY" | "USD" | "HKD";

export interface Account {
  id: string;
  name: string;
  // 累计投入本金（用户历史充进账户的总钱数，出金时 floor 在 0）
  cumulativePrincipal: number;
  cashBalance: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

// 账户快照（每日）
export interface AccountSnapshot {
  id: string;
  accountId: string;
  snapshotTime: string;
  totalAsset: number;
  cashBalance: number;
  positionMarketValue: number;
  totalPnl: number;
  totalPnlRate: number | null;
}

// 账户汇总计算结果
export interface AccountSummary {
  account: Account;
  positionMarketValue: number;
  totalAsset: number;
  totalPnl: number;
  totalPnlRate: number | null;
  positionCount: number;
  todayAlertCount: number;
  aiOpinionCount: number;
}

export const emptyAccount: Account = {
  id: "",
  name: "默认账户",
  cumulativePrincipal: 0,
  cashBalance: 0,
  currency: "CNY",
  createdAt: "",
  updatedAt: "",
};
