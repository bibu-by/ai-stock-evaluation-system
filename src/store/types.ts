// 应用状态类型定义中心
// 将 AppState 拆分为多个按域 Slice 接口，供各 slice 文件与 appStore.ts 共享，
// 避免 slice 与 appStore.ts 之间的循环依赖（type-only import 会被擦除）。

import type { Account, AccountSummary, AccountSnapshot } from "@/domain/account";
import type { Position, Market } from "@/domain/position";
import type { Trade } from "@/domain/trade";
import type { AgentJob, AgentRun, AlertRule } from "@/domain/agent";
import type { Memory } from "@/domain/memory";
import type { ChatMessage, Conversation } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import type { AppConfig, MarketDataSource } from "@/domain/config";

export type PageKey =
  | "dashboard"
  | "positions"
  | "trades"
  | "agent"
  | "decision"
  | "research"
  | "memory"
  | "model"
  | "data-source"
  | "settings";

export type ChatMode = "open" | "collapsed" | "hidden";

// ====== 各 Slice 接口 ======

export interface ConfigSlice {
  // 配置
  config: AppConfig | null;
  setConfig: (patch: Partial<AppConfig>) => Promise<void>;
  // UI 主题（与配置同步持久化）
  theme: "light" | "dark";
  toggleTheme: () => Promise<void>;
}

export interface PositionsSlice {
  // 持仓
  positions: Position[];
  // 最近一次行情刷新的来源统计（体现数据源 fallback），供持仓页展示
  lastQuoteRefresh: {
    sina: number;          // 价格来自新浪（腾讯未补基本面）
    sinaTencent: number;   // 新浪价格 + 腾讯基本面
    tencent: number;       // 腾讯兜底（新浪缺失）
    total: number;
    time: string;          // ISO 时间
  } | null;
  addPosition: (pos: {
    symbol: string;
    name: string;
    market: Market;
    quantity: number;
    avgCost?: number;     // 方式 A：买入单价
    totalCost?: number;   // 方式 B：总花费
    currentPrice?: number;
    aiStatusText?: string;
    note?: string;
    externalFunding?: boolean; // 从外部资金买入（如银行卡转入）：跳过现金校验，自动累加本金
  }) => Promise<void>;
  updatePosition: (id: string, patch: Partial<Position>) => Promise<void>;
  removePosition: (id: string) => Promise<void>;
  sellPosition: (id: string, sellPrice?: number) => Promise<void>;
  refreshPrices: () => Promise<void>;
}

export interface ConversationsSlice {
  // 会话
  conversations: Conversation[];
  activeConversationId: string | null;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

export interface AgentsSlice {
  // Agent
  agentJobs: AgentJob[];
  agentRuns: AgentRun[];
  addAgentJob: (job: Omit<AgentJob, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateAgentJob: (id: string, patch: Partial<AgentJob>) => Promise<void>;
  removeAgentJob: (id: string) => Promise<void>;
  runJobNow: (jobId: string) => Promise<void>;
  addAgentRun: (run: AgentRun) => Promise<void>;
  updateAgentRun: (run: AgentRun) => Promise<void>;
}

export interface AlertsSlice {
  // 提醒
  alerts: AlertRule[];
  addAlert: (alert: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "triggerCount">) => Promise<void>;
  updateAlert: (id: string, patch: Partial<AlertRule>) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  checkAlerts: () => Promise<void>;
}

export interface ModelsSlice {
  // 模型
  models: AiModelConfig[];
  addModel: (m: Omit<AiModelConfig, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateModel: (id: string, patch: Partial<AiModelConfig>) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  defaultModel: () => AiModelConfig | null;
}

// ====== 未拆分域（保留在 appStore.ts 中） ======
// 这些域较小或与 initApp / 账户资金流耦合度高，故不强行拆分。

export interface CoreSlice {
  // 初始化
  initialized: boolean;
  initApp: () => Promise<void>;

  // 首次启动引导
  completeOnboarding: (initialCapital: number) => Promise<void>;
  importDemoData: () => Promise<void>;

  // 账户
  account: Account | null;
  setAccount: (patch: Partial<Account>) => Promise<void>;
  setInitialCapital: (capital: number) => Promise<void>;
  setCashBalance: (cash: number) => Promise<void>;
  deposit: (amount: number) => Promise<void>;
  withdraw: (amount: number) => Promise<void>;

  // 账户快照（用于收益折线图）
  accountSnapshots: AccountSnapshot[];
  recordSnapshot: () => Promise<void>;
  // 重置所有资产：清空账户本金/现金、持仓、交易记录、收益快照（保留聊天/Agent/记忆/模型/配置）
  resetAssets: () => Promise<void>;

  // 交易
  trades: Trade[];
  addTrade: (trade: Omit<Trade, "id" | "createdAt">) => Promise<void>;

  // 聊天
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, "id" | "createdAt"> & { id?: string; createdAt?: string }) => Promise<string>;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  removeMessagesAfter: (id: string) => Promise<void>;

  // 记忆
  memories: Memory[];
  addMemory: (mem: Omit<Memory, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateMemory: (id: string, patch: Partial<Memory>) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;

  // 数据源
  dataSources: MarketDataSource[];
  addDataSource: (s: Omit<MarketDataSource, "id">) => Promise<void>;
  updateDataSource: (id: string, patch: Partial<MarketDataSource>) => Promise<void>;
  removeDataSource: (id: string) => Promise<void>;

  // UI 状态
  currentPage: PageKey;
  setCurrentPage: (p: PageKey) => void;
  chatMode: ChatMode;
  setChatMode: (m: ChatMode) => void;

  // 派生：账户汇总
  getAccountSummary: () => AccountSummary;
}

// 组合后的完整应用状态
export type AppState = CoreSlice &
  ConfigSlice &
  PositionsSlice &
  ConversationsSlice &
  AgentsSlice &
  AlertsSlice &
  ModelsSlice;
