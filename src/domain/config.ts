// 全局应用配置
import type { AiModelConfig } from "@/domain/ai";

// 应用模式：
// - fresh：正式用户模式，首次启动默认不创建任何假数据
// - demo：演示模式，允许导入 mock 持仓 / 交易 / Agent 任务用于体验
export type AppMode = "fresh" | "demo";

export interface MarketDataSource {
  id: string;
  name: string;
  type: "akshare" | "tushare" | "sina" | "eastmoney" | "alphavantage" | "finnhub" | "yahoo" | "custom";
  baseUrl: string;
  apiKey?: string;
  isEnabled: boolean;
  isDefault: boolean;
  markets: string[];
}

export interface AppConfig {
  // 通用设置
  theme: "light" | "dark" | "system";
  language: "zh-CN" | "en-US";
  firstRun: boolean;
  // 应用模式：fresh 不带 mock 数据，demo 允许 mock 数据
  appMode: AppMode;
  // 默认市场
  primaryMarket: "A_SHARE" | "HK" | "US";
  // 是否仅在交易时段运行 Agent
  tradingHoursOnlyByDefault: boolean;
  // 行情自动刷新间隔（秒）。0=关闭自动刷新，>0=按间隔秒数自动刷新（仅交易时段）
  autoRefreshIntervalSec: number;
  // 数据导出路径
  exportDir?: string;
}

export const defaultConfig: AppConfig = {
  theme: "dark",
  language: "zh-CN",
  firstRun: true,
  appMode: "fresh",
  primaryMarket: "A_SHARE",
  tradingHoursOnlyByDefault: true,
  autoRefreshIntervalSec: 0,
};

export const defaultMarketDataSource: MarketDataSource = {
  id: "default",
  name: "新浪财经（默认）",
  type: "sina",
  baseUrl: "https://hq.sinajs.cn",
  isEnabled: true,
  isDefault: true,
  markets: ["A_SHARE"],
};

export const defaultModelConfig: AiModelConfig = {
  id: "",
  provider: "deepseek",
  providerLabel: "DeepSeek",
  modelName: "deepseek-chat",
  displayName: "DeepSeek Chat",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  isEnabled: false,
  isDefault: false,
  createdAt: "",
  updatedAt: "",
};

// A 股交易时段（北京时间）
export const TRADING_HOURS = [
  { start: "09:30", end: "11:30" },
  { start: "13:00", end: "15:00" },
];
