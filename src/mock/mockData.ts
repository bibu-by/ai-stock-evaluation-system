// Mock 数据 - 用于首次启动时填充示例数据
import type { Account, AccountSnapshot } from "@/domain/account";
import type { Position } from "@/domain/position";
import type { Trade } from "@/domain/trade";
import type { AgentJob, AgentRun, AlertRule } from "@/domain/agent";
import type { Memory } from "@/domain/memory";
import type { ChatMessage } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import type { AppConfig, MarketDataSource } from "@/domain/config";

const now = new Date().toISOString();

export const mockConfig: AppConfig = {
  theme: "dark",
  language: "zh-CN",
  firstRun: true,
  appMode: "fresh",
  primaryMarket: "A_SHARE",
  tradingHoursOnlyByDefault: true,
  autoRefreshIntervalSec: 0,
};

export const mockAccount: Account = {
  id: "acc_default",
  name: "默认账户",
  cumulativePrincipal: 100000,
  cashBalance: 19350,
  currency: "CNY",
  createdAt: now,
  updatedAt: now,
};

// 收益曲线示例快照（最近 14 天，用于 demo 模式下直观展示收益折线图）
// 真实运行时每次 refreshPrices / addTrade / setAccount 会追加/覆盖当天快照
function buildMockSnapshots(): AccountSnapshot[] {
  const snapshots: AccountSnapshot[] = [];
  // 一条预先准备好的曲线（轻微波动，最终小幅亏损），让首屏图看起来真实
  const curve = [
    100000, 100820, 101540, 100980, 99850, 99200, 99680, 100230,
    100540, 99870, 99120, 98540, 98960, 98645,
  ];
  const today = new Date();
  for (let i = curve.length - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const totalAsset = curve[curve.length - 1 - i];
    const positionMarketValue = totalAsset - 19350;
    const totalPnl = totalAsset - 100000;
    const totalPnlRate = (totalPnl / 100000) * 100;
    snapshots.push({
      id: `snap_mock_${curve.length - 1 - i}`,
      accountId: "acc_default",
      snapshotTime: d.toISOString(),
      totalAsset,
      cashBalance: 19350,
      positionMarketValue,
      totalPnl,
      totalPnlRate,
    });
  }
  return snapshots;
}

export const mockAccountSnapshots: AccountSnapshot[] = buildMockSnapshots();

export const mockPositions: Position[] = [
  {
    id: "pos_001",
    symbol: "600519.SH",
    name: "贵州茅台",
    market: "A_SHARE",
    quantity: 30,
    avgCost: 1680.0,
    currentPrice: 1652.3,
    marketValue: 49569,
    unrealizedPnl: -831,
    unrealizedPnlRate: -1.65,
    todayChangeRate: -0.85,
    aiStatus: "stable",
    aiStatusText: "等待企稳",
    watchlist: true,
    note: "白酒龙头，长期持有",
    updatedAt: now,
  },
  {
    id: "pos_002",
    symbol: "300750.SZ",
    name: "宁德时代",
    market: "A_SHARE",
    quantity: 100,
    avgCost: 180.0,
    currentPrice: 172.5,
    marketValue: 17250,
    unrealizedPnl: -750,
    unrealizedPnlRate: -4.17,
    todayChangeRate: -2.15,
    aiStatus: "cautious",
    aiStatusText: "走势偏弱",
    note: "新能源动力电池龙头",
    updatedAt: now,
  },
  {
    id: "pos_003",
    symbol: "002594.SZ",
    name: "比亚迪",
    market: "A_SHARE",
    quantity: 50,
    avgCost: 245.0,
    currentPrice: 258.6,
    marketValue: 12930,
    unrealizedPnl: 680,
    unrealizedPnlRate: 5.55,
    todayChangeRate: 1.32,
    aiStatus: "strong",
    aiStatusText: "量价齐升",
    watchlist: true,
    note: "新能源车 + 电池",
    updatedAt: now,
  },
];

export const mockTrades: Trade[] = [
  {
    id: "trade_001",
    symbol: "600519.SH",
    name: "贵州茅台",
    type: "BUY",
    quantity: 30,
    price: 1680.0,
    fee: 0,
    amount: 50400,
    tradedAt: now,
    source: "manual",
    note: "首次建仓",
    createdAt: now,
  },
  {
    id: "trade_002",
    symbol: "300750.SZ",
    name: "宁德时代",
    type: "BUY",
    quantity: 100,
    price: 180.0,
    fee: 0,
    amount: 18000,
    tradedAt: now,
    source: "manual",
    createdAt: now,
  },
  {
    id: "trade_003",
    symbol: "002594.SZ",
    name: "比亚迪",
    type: "BUY",
    quantity: 50,
    price: 245.0,
    fee: 0,
    amount: 12250,
    tradedAt: now,
    source: "manual",
    createdAt: now,
  },
];

export const mockAgentJobs: AgentJob[] = [
  {
    id: "job_001",
    name: "每小时持仓巡检",
    enabled: true,
    triggerType: "interval",
    intervalMinutes: 60,
    scope: "all_positions",
    tradingHoursOnly: true,
    nextRunAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    lastRunAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "job_002",
    name: "14:50 收盘前分析",
    enabled: true,
    triggerType: "fixed_time",
    fixedTimes: ["14:50"],
    scope: "all_positions",
    tradingHoursOnly: true,
    nextRunAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
];

export const mockAgentRuns: AgentRun[] = [
  {
    id: "run_001",
    jobId: "job_001",
    jobName: "每小时持仓巡检",
    status: "success",
    startedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 29 * 60_000).toISOString(),
    outputSummary:
      "今天主要拖累来自宁德时代，分时走势偏弱。建议暂时不要急着加仓，先观察是否重新站回 5 日均线。",
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
];

export const mockAlerts: AlertRule[] = [
  {
    id: "alert_001",
    name: "贵州茅台跌破 1600",
    enabled: true,
    condition: {
      symbol: "600519.SH",
      metric: "price",
      operator: "below",
      value: 1600,
    },
    level: "warning",
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "alert_002",
    name: "宁德时代浮亏超 8%",
    enabled: true,
    condition: {
      symbol: "300750.SZ",
      metric: "pnl_rate",
      operator: "below",
      value: -8,
    },
    level: "warning",
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
  },
];

export const mockMemories: Memory[] = [
  {
    id: "mem_001",
    type: "preference",
    title: "风险偏好",
    content: "用户偏好中长期持仓，不喜欢追高，单只股票最大仓位不超过 30%。",
    importance: 4,
    tags: ["风险偏好", "仓位"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "mem_002",
    type: "rule",
    title: "不追高",
    content: "用户不喜欢追高，分析时应提醒其避免在短期大涨后冲动买入。",
    importance: 5,
    tags: ["规则"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "mem_003",
    type: "stock_note",
    title: "贵州茅台买入理由",
    content: "白酒龙头，长期持有，关注消费复苏。",
    importance: 3,
    symbol: "600519.SH",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "mem_004",
    type: "agent_note",
    title: "最近巡检结论",
    content: "新能源板块持续走弱，需要观察是否企稳；白酒相对抗跌。",
    importance: 3,
    createdAt: now,
    updatedAt: now,
  },
];

export const mockMessages: ChatMessage[] = [
  {
    id: "msg_001",
    role: "system",
    type: "text",
    content:
      "欢迎使用 AI 炒股 Agent 系统。你可以直接告诉我你的本金、现金和持仓，我会帮你结构化记录。所有关键操作都需要你确认后才会写入。",
    createdAt: now,
  },
  {
    id: "msg_002",
    role: "agent",
    type: "agent_run",
    content:
      "14:50 自动巡检完成。\n\n你的持仓总资产约 98,645.40 元，当前收益率 -1.35%。\n今天主要拖累来自宁德时代，分时走势偏弱，量能没有明显放大。\n\n我建议暂时不要急着加仓，先观察是否能重新站回 5 日均线。\n如果明天继续放量下跌，需要重新评估仓位风险。\n\n这不是买卖指令，只是基于当前数据的辅助分析。",
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    metadata: { agentRunId: "run_001" },
  },
];

export const mockModels: AiModelConfig[] = [
  {
    id: "model_001",
    provider: "deepseek",
    providerLabel: "DeepSeek",
    modelName: "deepseek-chat",
    displayName: "DeepSeek Chat",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    isEnabled: false,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  },
];

export const mockDataSources: MarketDataSource[] = [
  {
    id: "ds_001",
    name: "新浪财经（默认）",
    type: "sina",
    baseUrl: "https://hq.sinajs.cn",
    isEnabled: true,
    isDefault: true,
    markets: ["A_SHARE"],
  },
  {
    id: "ds_002",
    name: "AkShare 网关",
    type: "akshare",
    baseUrl: "http://localhost:8080",
    isEnabled: false,
    isDefault: false,
    markets: ["A_SHARE", "HK", "US"],
  },
];
