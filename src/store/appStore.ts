// 全局应用状态 - Zustand
// 集中管理账户、持仓、交易、聊天、Agent、记忆、模型、配置等。
// 同时负责初始化时从 localStore 加载，以及提供持久化方法。

import { create } from "zustand";
import type { Account, AccountSummary, AccountSnapshot } from "@/domain/account";
import type { Position, Market } from "@/domain/position";
import type { Trade } from "@/domain/trade";
import type { AgentJob, AgentRun, AlertRule } from "@/domain/agent";
import type { Memory } from "@/domain/memory";
import type { ChatMessage, Conversation } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import type { AppConfig, MarketDataSource } from "@/domain/config";
import {
  loadAccount, saveAccount,
  loadPositions, savePositions,
  loadTrades, saveTrades,
  loadMessages, saveMessages,
  loadConversations, saveConversations,
  loadAgentJobs, saveAgentJobs,
  loadAgentRuns, saveAgentRuns,
  loadAlerts, saveAlerts,
  loadMemories, saveMemories,
  loadModels, saveModels,
  loadConfig, saveConfig,
  loadDataSources, saveDataSources,
  loadAccountSnapshots, saveAccountSnapshots,
  deleteApiKey,
} from "@/services/localStore";
import {
  mockAccount, mockPositions, mockTrades, mockMessages,
  mockAgentJobs, mockAgentRuns, mockAlerts, mockMemories,
  mockModels, mockDataSources, mockAccountSnapshots,
} from "@/mock/mockData";
import { uid, nowIso, cloneJson } from "@/lib/utils";
import { getBatchQuotes, setMarketMode } from "@/services/marketData";
import { runAgentJob, calculateNextRunAt } from "@/services/agentRunner";
import { defaultConfig } from "@/domain/config";
import { ACCOUNT_SNAPSHOT_RETAIN_DAYS } from "@/domain/constants";

export type PageKey =
  | "dashboard"
  | "positions"
  | "trades"
  | "agent"
  | "decision"
  | "memory"
  | "model"
  | "data-source"
  | "settings";

export type ChatMode = "open" | "collapsed" | "hidden";

interface AppState {
  // 初始化
  initialized: boolean;
  initApp: () => Promise<void>;

  // 配置
  config: AppConfig | null;
  setConfig: (patch: Partial<AppConfig>) => Promise<void>;

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

  // 持仓
  positions: Position[];
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

  // 交易
  trades: Trade[];
  addTrade: (trade: Omit<Trade, "id" | "createdAt">) => Promise<void>;

  // 聊天
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, "id" | "createdAt"> & { id?: string; createdAt?: string }) => Promise<string>;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  removeMessagesAfter: (id: string) => Promise<void>;

  // 会话
  conversations: Conversation[];
  activeConversationId: string | null;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Agent
  agentJobs: AgentJob[];
  agentRuns: AgentRun[];
  addAgentJob: (job: Omit<AgentJob, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateAgentJob: (id: string, patch: Partial<AgentJob>) => Promise<void>;
  removeAgentJob: (id: string) => Promise<void>;
  runJobNow: (jobId: string) => Promise<void>;
  addAgentRun: (run: AgentRun) => Promise<void>;
  updateAgentRun: (run: AgentRun) => Promise<void>;

  // 提醒
  alerts: AlertRule[];
  addAlert: (alert: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "triggerCount">) => Promise<void>;
  updateAlert: (id: string, patch: Partial<AlertRule>) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;

  // 记忆
  memories: Memory[];
  addMemory: (mem: Omit<Memory, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateMemory: (id: string, patch: Partial<Memory>) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;

  // 模型
  models: AiModelConfig[];
  addModel: (m: Omit<AiModelConfig, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateModel: (id: string, patch: Partial<AiModelConfig>) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  defaultModel: () => AiModelConfig | null;

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
  theme: "light" | "dark";
  toggleTheme: () => Promise<void>;

  // 派生：账户汇总
  getAccountSummary: () => AccountSummary;
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,

  // 初始值（在 initApp 中会被本地存储数据覆盖）
  config: null,
  account: null,
  positions: [],
  trades: [],
  messages: [],
  conversations: [],
  activeConversationId: null,
  agentJobs: [],
  agentRuns: [],
  alerts: [],
  memories: [],
  models: [],
  dataSources: [],
  accountSnapshots: [],
  theme: "dark",

  async initApp() {
    if (get().initialized) return;
    let [config, account, positions, trades, messages, conversations, jobs, runs, alerts, memories, models, dataSources, snapshots] =
      await Promise.all([
        loadConfig(),
        loadAccount(),
        loadPositions(),
        loadTrades(),
        loadMessages(),
        loadConversations(),
        loadAgentJobs(),
        loadAgentRuns(),
        loadAlerts(),
        loadMemories(),
        loadModels(),
        loadDataSources(),
        loadAccountSnapshots(),
      ]);

    // 首次启动：默认 fresh 模式，不写入任何 mock 数据
    // firstRun=true 时由前端 Onboarding 引导用户完成初始配置
    if (!config) {
      config = cloneJson(defaultConfig);
      await saveConfig(config);
    }

    // 根据应用模式设置行情模式：demo 模式允许 mock 行情，fresh 模式必须走真实接口
    setMarketMode(config.appMode === "demo" ? "demo" : "fresh");

    const theme = config.theme === "light" ? "light" : "dark";
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }

    // 会话迁移：若无会话但已有消息，创建默认会话「主会话」并给现有消息补 conversationId
    if (conversations.length === 0) {
      const defaultConv: Conversation = {
        id: uid("conv"),
        title: "主会话",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      conversations = [defaultConv];
      messages = messages.map((m) =>
        m.conversationId ? m : { ...m, conversationId: defaultConv.id }
      );
      await saveConversations(conversations);
      await saveMessages(messages);
    }
    const activeConversationId = conversations[0]?.id || null;

    set({
      initialized: true,
      config,
      account,
      positions,
      trades,
      messages,
      conversations,
      activeConversationId,
      agentJobs: jobs,
      agentRuns: runs,
      alerts,
      memories,
      models,
      dataSources,
      accountSnapshots: snapshots,
      theme,
      currentPage: "dashboard",
      chatMode: "open",
    });
  },

  // 完成首次启动引导：写入本金、关闭 firstRun
  async completeOnboarding(initialCapital) {
    const old = get().config;
    const next: AppConfig = {
      ...(old || cloneJson(defaultConfig)),
      firstRun: false,
    };
    await saveConfig(next);

    // 创建账户记录
    const now = nowIso();
    const account: Account = {
      id: uid("acc"),
      name: "默认账户",
      cumulativePrincipal: initialCapital,
      cashBalance: initialCapital,
      currency: "CNY",
      createdAt: now,
      updatedAt: now,
    };
    await saveAccount(account);

    set({ config: next, account });

    // 写入初始入金交易记录
    await get().addTrade({
      symbol: "",
      name: "首次入金",
      type: "DEPOSIT",
      quantity: 0,
      price: 0,
      fee: 0,
      amount: initialCapital,
      tradedAt: now,
      source: "manual",
      note: "Onboarding 首次入金",
    });

    // 写入初始快照，作为收益曲线起点
    await get().recordSnapshot();
  },

  // 导入 Demo 数据（用户在 Onboarding 或设置页主动触发）
  async importDemoData() {
    const config = get().config;
    if (config) {
      const next = { ...config, appMode: "demo" as const };
      await saveConfig(next);
      set({ config: next });
    }
    setMarketMode("demo");

    const account = cloneJson(mockAccount);
    const positions = cloneJson(mockPositions);
    const trades = cloneJson(mockTrades);
    const messages = cloneJson(mockMessages);
    const jobs = cloneJson(mockAgentJobs);
    const runs = cloneJson(mockAgentRuns);
    const alerts = cloneJson(mockAlerts);
    const memories = cloneJson(mockMemories);
    // 保留用户已配置的模型（Onboarding 中通过测试的真实模型）；若用户尚未配置任何模型，才导入 mock 模型
    const existingModels = get().models;
    const models = existingModels.length > 0 ? existingModels : cloneJson(mockModels);
    const dataSources = cloneJson(mockDataSources);
    const snapshots = cloneJson(mockAccountSnapshots);

    await Promise.all([
      saveAccount(account),
      savePositions(positions),
      saveTrades(trades),
      saveMessages(messages),
      saveAgentJobs(jobs),
      saveAgentRuns(runs),
      saveAlerts(alerts),
      saveMemories(memories),
      saveModels(models),
      saveDataSources(dataSources),
      saveAccountSnapshots(snapshots),
    ]);

    set({
      account,
      positions,
      trades,
      messages,
      agentJobs: jobs,
      agentRuns: runs,
      alerts,
      memories,
      models,
      dataSources,
      accountSnapshots: snapshots,
    });
  },

  // ====== 配置 ======
  async setConfig(patch) {
    const old = get().config;
    if (!old) return;
    const next = { ...old, ...patch };
    await saveConfig(next);
    set({ config: next });
    if (patch.theme) {
      const theme = patch.theme === "light" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      set({ theme });
    }
  },

  async toggleTheme() {
    const cur = get().theme;
    const next = cur === "dark" ? "light" : "dark";
    await get().setConfig({ theme: next });
  },

  // ====== 账户 ======
  async setAccount(patch) {
    const old = get().account;
    if (!old) return;
    const next: Account = { ...old, ...patch, updatedAt: nowIso() };
    await saveAccount(next);
    set({ account: next });
    // 本金/现金变化后，刷新曲线最新一个点
    if (patch.cumulativePrincipal !== undefined || patch.cashBalance !== undefined) {
      await get().recordSnapshot();
    }
  },

  async setInitialCapital(capital) {
    await get().setAccount({ cumulativePrincipal: capital });
  },

  async setCashBalance(cash) {
    await get().setAccount({ cashBalance: cash });
  },

  async deposit(amount) {
    const old = get().account;
    if (!old) return;
    if (amount <= 0) throw new Error("入金金额必须大于 0");
    const next: Account = {
      ...old,
      cumulativePrincipal: old.cumulativePrincipal + amount,
      cashBalance: old.cashBalance + amount,
      updatedAt: nowIso(),
    };
    await saveAccount(next);
    set({ account: next });
    // 写入 DEPOSIT 交易记录
    await get().addTrade({
      symbol: "",
      name: "账户入金",
      type: "DEPOSIT",
      quantity: 0,
      price: 0,
      fee: 0,
      amount: amount,
      tradedAt: nowIso(),
      source: "manual",
      note: "手动入金",
    });
    await get().recordSnapshot();
  },

  async withdraw(amount) {
    const old = get().account;
    if (!old) return;
    if (amount <= 0) throw new Error("出金金额必须大于 0");
    if (old.cashBalance < amount) throw new Error("现金余额不足");
    const next: Account = {
      ...old,
      cumulativePrincipal: Math.max(0, old.cumulativePrincipal - amount),
      cashBalance: old.cashBalance - amount,
      updatedAt: nowIso(),
    };
    await saveAccount(next);
    set({ account: next });
    // 写入 WITHDRAW 交易记录
    await get().addTrade({
      symbol: "",
      name: "账户出金",
      type: "WITHDRAW",
      quantity: 0,
      price: 0,
      fee: 0,
      amount: amount,
      tradedAt: nowIso(),
      source: "manual",
      note: "手动出金",
    });
    await get().recordSnapshot();
  },

  // 记录账户快照（按天去重，覆盖当天已有快照；保留最近 90 天数据）
  async recordSnapshot() {
    const account = get().account;
    const positions = get().positions;
    if (!account) return;
    const positionMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalAsset = positionMarketValue + account.cashBalance;
    const totalPnl = totalAsset - account.cumulativePrincipal;
    const totalPnlRate =
      account.cumulativePrincipal > 0 ? (totalPnl / account.cumulativePrincipal) * 100 : null;
    const now = nowIso();
    const dayKey = now.slice(0, 10);

    const existing = get().accountSnapshots.slice();
    // 同一天覆盖：删除当天已有的，再追加最新
    const filtered = existing.filter((s) => !s.snapshotTime.startsWith(dayKey));
    filtered.push({
      id: uid("snap"),
      accountId: account.id,
      snapshotTime: now,
      totalAsset,
      cashBalance: account.cashBalance,
      positionMarketValue,
      totalPnl,
      totalPnlRate,
    });
    // 按时间升序
    filtered.sort((a, b) => a.snapshotTime.localeCompare(b.snapshotTime));
    // 仅保留最近 90 天
    const cutoff = Date.now() - ACCOUNT_SNAPSHOT_RETAIN_DAYS * 86400_000;
    const trimmed = filtered.filter((s) => new Date(s.snapshotTime).getTime() >= cutoff);
    await saveAccountSnapshots(trimmed);
    set({ accountSnapshots: trimmed });
  },

  // 重置所有资产：清空本金/现金/持仓/交易/收益快照，保留账户 id、聊天、Agent、记忆、模型、配置
  async resetAssets() {
    const account = get().account;
    if (!account) return;
    // 重置账户：保留 id/name/currency/createdAt，清零本金和现金
    const resetAccount: Account = {
      ...account,
      cumulativePrincipal: 0,
      cashBalance: 0,
      updatedAt: nowIso(),
    };
    await saveAccount(resetAccount);
    await savePositions([]);
    await saveTrades([]);
    await saveAccountSnapshots([]);
    set({
      account: resetAccount,
      positions: [],
      trades: [],
      accountSnapshots: [],
    });
  },

  // ====== 持仓 ======
  async addPosition(pos) {
    // 根据 avgCost 或 totalCost 统一算出 avgCost 和总成本
    let avgCost: number;
    let totalCost: number;
    if (pos.avgCost !== undefined) {
      avgCost = pos.avgCost;
      totalCost = avgCost * pos.quantity;
    } else if (pos.totalCost !== undefined) {
      totalCost = pos.totalCost;
      avgCost = totalCost / pos.quantity;
    } else {
      throw new Error("必须提供 avgCost 或 totalCost");
    }

    const account = get().account;
    if (!account) throw new Error("账户未初始化");

    // externalFunding：从外部资金买入（如银行卡转入），跳过现金校验，自动累加本金
    // 现金净效果不变（先入金 totalCost 再扣减 totalCost）
    const externalFunding = !!pos.externalFunding;
    if (!externalFunding && account.cashBalance < totalCost) {
      throw new Error("现金不足，请先入金");
    }

    const currentPrice = pos.currentPrice ?? avgCost;
    const marketValue = currentPrice * pos.quantity;
    const unrealizedPnl = (currentPrice - avgCost) * pos.quantity;
    const unrealizedPnlRate =
      avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;

    const newPos: Position = {
      id: uid("pos"),
      symbol: pos.symbol,
      name: pos.name,
      market: pos.market,
      quantity: pos.quantity,
      avgCost,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlRate,
      aiStatusText: pos.aiStatusText,
      note: pos.note,
      externalFunding,
      updatedAt: nowIso(),
    };

    // 写入持仓
    const list = get().positions.slice();
    list.push(newPos);
    await savePositions(list);
    set({ positions: list });

    // 扣减现金：externalFunding 时同时累加本金（相当于先入金再买入）
    const principalDelta = externalFunding ? totalCost : 0;
    const updatedAccount: Account = {
      ...account,
      cumulativePrincipal: account.cumulativePrincipal + principalDelta,
      cashBalance: account.cashBalance + principalDelta - totalCost,
      updatedAt: nowIso(),
    };
    await saveAccount(updatedAccount);
    set({ account: updatedAccount });

    // 写入 BUY 交易记录
    await get().addTrade({
      symbol: pos.symbol,
      name: pos.name,
      type: "BUY",
      quantity: pos.quantity,
      price: avgCost,
      fee: 0,
      amount: totalCost,
      tradedAt: nowIso(),
      source: "manual",
      note: externalFunding
        ? `AI 录入·自动入金 ¥${totalCost.toLocaleString("zh-CN")}${pos.note ? "｜" + pos.note : ""}`
        : pos.note,
    });

    // 刷新收益曲线最新点
    await get().recordSnapshot();
  },

  async updatePosition(id, patch) {
    const list = get().positions.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch, updatedAt: nowIso() };
      // 重新计算
      next.marketValue = next.currentPrice * next.quantity;
      next.unrealizedPnl = (next.currentPrice - next.avgCost) * next.quantity;
      next.unrealizedPnlRate =
        next.avgCost > 0
          ? ((next.currentPrice - next.avgCost) / next.avgCost) * 100
          : 0;
      return next;
    });
    await savePositions(list);
    set({ positions: list });
  },

  async removePosition(id) {
    const position = get().positions.find((p) => p.id === id);
    if (!position) return;
    const account = get().account;
    if (!account) return;

    // 撤回买入：把当初占用的资金按买入方式回退
    const totalCost = position.avgCost * position.quantity;
    const externalFunding = !!position.externalFunding;
    const principalDelta = externalFunding ? -totalCost : 0;
    const cashDelta = externalFunding ? 0 : totalCost;
    const updatedAccount: Account = {
      ...account,
      cumulativePrincipal: account.cumulativePrincipal + principalDelta,
      cashBalance: account.cashBalance + cashDelta,
      updatedAt: nowIso(),
    };
    await saveAccount(updatedAccount);
    set({ account: updatedAccount });

    // 移除持仓
    const list = get().positions.filter((p) => p.id !== id);
    await savePositions(list);
    set({ positions: list });

    // 刷新收益曲线快照
    await get().recordSnapshot();
  },

  async sellPosition(id, sellPrice) {
    const position = get().positions.find((p) => p.id === id);
    if (!position) return;
    const account = get().account;
    if (!account) return;
    const price = sellPrice ?? position.currentPrice;
    const proceeds = price * position.quantity;
    const realizedPnl = (price - position.avgCost) * position.quantity;

    // 回笼现金
    const updatedAccount: Account = {
      ...account,
      cashBalance: account.cashBalance + proceeds,
      updatedAt: nowIso(),
    };
    await saveAccount(updatedAccount);
    set({ account: updatedAccount });

    // 删除持仓
    const list = get().positions.filter((p) => p.id !== id);
    await savePositions(list);
    set({ positions: list });

    // 写入 SELL 交易记录
    await get().addTrade({
      symbol: position.symbol,
      name: position.name,
      type: "SELL",
      quantity: position.quantity,
      price: price,
      fee: 0,
      amount: proceeds,
      tradedAt: nowIso(),
      source: "manual",
      note: `已实现盈亏 ${realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}`,
    });

    // 刷新收益曲线
    await get().recordSnapshot();
  },

  async refreshPrices() {
    const positions = get().positions;
    if (positions.length === 0) return;
    const quotes = await getBatchQuotes(positions.map((p) => p.symbol));
    const list = positions.map((p) => {
      const q = quotes[p.symbol];
      // 拿不到行情 或 返回 0 价格（非交易时段部分股票可能返回 0），保持原样不覆盖
      if (!q || q.currentPrice <= 0) return p;
      const marketValue = q.currentPrice * p.quantity;
      const unrealizedPnl = (q.currentPrice - p.avgCost) * p.quantity;
      const unrealizedPnlRate =
        p.avgCost > 0 ? ((q.currentPrice - p.avgCost) / p.avgCost) * 100 : 0;
      // 行情更新成功后清除导入时的"等待刷新"标记
      const aiStatusText = p.aiStatusText === "等待刷新" ? "" : p.aiStatusText;
      return {
        ...p,
        currentPrice: q.currentPrice,
        todayChangeRate: q.changeRate,
        marketValue,
        unrealizedPnl,
        unrealizedPnlRate,
        aiStatusText,
        updatedAt: nowIso(),
      };
    });
    await savePositions(list);
    set({ positions: list });
    // 行情刷新后写入当日快照，让收益曲线最新点跟随行情
    await get().recordSnapshot();
  },

  // ====== 交易 ======
  async addTrade(trade) {
    const list = get().trades.slice();
    const newTrade: Trade = { ...trade, id: uid("trade"), createdAt: nowIso() };
    list.unshift(newTrade);
    await saveTrades(list);
    set({ trades: list });
  },

  // ====== 聊天 ======
  async addMessage(msg) {
    const list = get().messages.slice();
    const newMsg: ChatMessage = {
      id: msg.id || uid("msg"),
      role: msg.role,
      type: msg.type,
      content: msg.content,
      createdAt: msg.createdAt || nowIso(),
      status: msg.status,
      conversationId: msg.conversationId || get().activeConversationId || undefined,
      metadata: msg.metadata,
    };
    list.push(newMsg);
    await saveMessages(list);
    set({ messages: list });
    return newMsg.id;
  },

  async updateMessage(id, patch) {
    const list = get().messages.map((m) =>
      m.id === id ? { ...m, ...patch } : m
    );
    await saveMessages(list);
    set({ messages: list });
  },

  async removeMessage(id) {
    const list = get().messages.filter((m) => m.id !== id);
    await saveMessages(list);
    set({ messages: list });
  },

  async removeMessagesAfter(id) {
    const list = get().messages;
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) return;
    // 保留该消息及其之前的所有消息，删除其后的所有消息
    const trimmed = list.slice(0, idx + 1);
    await saveMessages(trimmed);
    set({ messages: trimmed });
  },

  // ====== 会话管理 ======
  async createConversation() {
    const list = get().conversations.slice();
    const now = nowIso();
    // 标题格式「新会话 YYYY-MM-DD HH:mm」
    const d = new Date(now);
    const title = `新会话 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const conv: Conversation = {
      id: uid("conv"),
      title,
      createdAt: now,
      updatedAt: now,
    };
    list.push(conv);
    await saveConversations(list);
    set({ conversations: list, activeConversationId: conv.id });
  },

  async switchConversation(id) {
    set({ activeConversationId: id });
  },

  async renameConversation(id, title) {
    const list = get().conversations.map((c) =>
      c.id === id ? { ...c, title, updatedAt: nowIso() } : c
    );
    await saveConversations(list);
    set({ conversations: list });
  },

  async deleteConversation(id) {
    const list = get().conversations.filter((c) => c.id !== id);
    // 删除该会话的所有消息
    const msgs = get().messages.filter((m) => m.conversationId !== id);
    await saveConversations(list);
    await saveMessages(msgs);
    // 若删的是活跃会话，切换到第一个剩余会话；若无剩余，创建新空白会话
    let activeId = get().activeConversationId;
    if (activeId === id) {
      if (list.length > 0) {
        activeId = list[0].id;
      } else {
        // 无剩余会话，创建空白会话
        const now = nowIso();
        const d = new Date(now);
        const title = `新会话 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const conv: Conversation = { id: uid("conv"), title, createdAt: now, updatedAt: now };
        list.push(conv);
        await saveConversations(list);
        activeId = conv.id;
      }
    }
    set({ conversations: list, messages: msgs, activeConversationId: activeId });
  },

  // ====== Agent ======
  async addAgentJob(job) {
    const list = get().agentJobs.slice();
    const newJob: AgentJob = {
      ...job,
      id: uid("job"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      nextRunAt: job.enabled ? calculateNextRunAt(job as AgentJob) : undefined,
    };
    list.push(newJob);
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async updateAgentJob(id, patch) {
    const list = get().agentJobs.map((j) => {
      if (j.id !== id) return j;
      const next: AgentJob = { ...j, ...patch, updatedAt: nowIso() };
      // 重新计算下次运行时间
      if (patch.enabled !== undefined || patch.triggerType || patch.intervalMinutes || patch.fixedTimes) {
        next.nextRunAt = next.enabled ? calculateNextRunAt(next) : undefined;
      }
      return next;
    });
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async removeAgentJob(id) {
    const list = get().agentJobs.filter((j) => j.id !== id);
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async runJobNow(jobId) {
    const job = get().agentJobs.find((j) => j.id === jobId);
    if (!job) return;
    const model = get().defaultModel();
    await runAgentJob(job, {
      account: get().account,
      positions: get().positions,
      memories: get().memories,
      model,
      onMessage: (msg) => {
        void get().addMessage(msg);
      },
      onRunUpdate: (run) => {
        void get().updateAgentRun(run);
      },
    });
    // 更新 job 的 nextRunAt
    await get().updateAgentJob(jobId, {
      lastRunAt: nowIso(),
      nextRunAt: job.enabled ? calculateNextRunAt(job) : undefined,
    });
  },

  async addAgentRun(run) {
    const list = get().agentRuns.slice();
    list.unshift(run);
    await saveAgentRuns(list);
    set({ agentRuns: list });
  },

  async updateAgentRun(run) {
    let list = get().agentRuns.slice();
    const idx = list.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      list[idx] = run;
    } else {
      list.unshift(run);
    }
    await saveAgentRuns(list);
    set({ agentRuns: list });
  },

  // ====== 提醒 ======
  async addAlert(alert) {
    const list = get().alerts.slice();
    const newAlert: AlertRule = {
      ...alert,
      id: uid("alert"),
      triggerCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    list.push(newAlert);
    await saveAlerts(list);
    set({ alerts: list });
  },

  async updateAlert(id, patch) {
    const list = get().alerts.map((a) =>
      a.id === id ? { ...a, ...patch, updatedAt: nowIso() } : a
    );
    await saveAlerts(list);
    set({ alerts: list });
  },

  async removeAlert(id) {
    const list = get().alerts.filter((a) => a.id !== id);
    await saveAlerts(list);
    set({ alerts: list });
  },

  // ====== 记忆 ======
  async addMemory(mem) {
    const list = get().memories.slice();
    const newMem: Memory = {
      ...mem,
      id: uid("mem"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    list.push(newMem);
    await saveMemories(list);
    set({ memories: list });
  },

  async updateMemory(id, patch) {
    const list = get().memories.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m
    );
    await saveMemories(list);
    set({ memories: list });
  },

  async removeMemory(id) {
    const list = get().memories.filter((m) => m.id !== id);
    await saveMemories(list);
    set({ memories: list });
  },

  // ====== 模型 ======
  async addModel(m) {
    const list = get().models.slice();
    const newM: AiModelConfig = {
      ...m,
      id: uid("model"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    // 如果设为默认，取消其他默认
    if (newM.isDefault) {
      for (const item of list) item.isDefault = false;
    }
    list.push(newM);
    await saveModels(list);
    set({ models: list });
  },

  async updateModel(id, patch) {
    let list = get().models.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m
    );
    // 如果设为默认，取消其他默认
    if (patch.isDefault) {
      list = list.map((m) => (m.id === id ? m : { ...m, isDefault: false }));
    }
    await saveModels(list);
    set({ models: list });
  },

  async removeModel(id) {
    // 先清理系统凭据中残留的 API Key（若存在 apiKeyRef）
    const model = get().models.find((m) => m.id === id);
    if (model?.apiKeyRef) {
      try {
        await deleteApiKey(model.apiKeyRef);
      } catch (e) {
        // 凭据删除失败不应阻塞模型删除流程，仅记录日志
        console.warn("[appStore] 删除模型时清理凭据失败", e);
      }
    }
    const list = get().models.filter((m) => m.id !== id);
    await saveModels(list);
    set({ models: list });
  },

  defaultModel() {
    return get().models.find((m) => m.isEnabled && m.isDefault) || get().models.find((m) => m.isEnabled) || null;
  },

  // ====== 数据源 ======
  async addDataSource(s) {
    const list = get().dataSources.slice();
    const newS: MarketDataSource = { ...s, id: uid("ds") };
    if (newS.isDefault) {
      for (const item of list) item.isDefault = false;
    }
    list.push(newS);
    await saveDataSources(list);
    set({ dataSources: list });
  },

  async updateDataSource(id, patch) {
    let list = get().dataSources.map((s) =>
      s.id === id ? { ...s, ...patch } : s
    );
    if (patch.isDefault) {
      list = list.map((s) => (s.id === id ? s : { ...s, isDefault: false }));
    }
    await saveDataSources(list);
    set({ dataSources: list });
  },

  async removeDataSource(id) {
    const list = get().dataSources.filter((s) => s.id !== id);
    await saveDataSources(list);
    set({ dataSources: list });
  },

  // ====== UI ======
  currentPage: "dashboard",
  setCurrentPage: (p) => set({ currentPage: p }),
  chatMode: "open",
  setChatMode: (m) => set({ chatMode: m }),

  // ====== 派生：账户汇总 ======
  getAccountSummary() {
    const account = get().account;
    const positions = get().positions;
    const alerts = get().alerts;
    const messages = get().messages;
    if (!account) {
      return {
        account: { ...account!, id: "", name: "", cumulativePrincipal: 0, cashBalance: 0, currency: "CNY", createdAt: "", updatedAt: "" },
        positionMarketValue: 0,
        totalAsset: 0,
        totalPnl: 0,
        totalPnlRate: 0,
        positionCount: 0,
        todayAlertCount: 0,
        aiOpinionCount: 0,
      };
    }
    const positionMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalAsset = positionMarketValue + account.cashBalance;
    const totalPnl = totalAsset - account.cumulativePrincipal;
    const totalPnlRate =
      account.cumulativePrincipal > 0
        ? (totalPnl / account.cumulativePrincipal) * 100
        : null;
    const today = new Date().toISOString().slice(0, 10);
    const todayAlertCount = alerts.filter(
      (a) => a.lastTriggeredAt && a.lastTriggeredAt.slice(0, 10) === today
    ).length;
    const aiOpinionCount = messages.filter(
      (m) => m.role === "agent" && m.createdAt.slice(0, 10) === today
    ).length;
    return {
      account,
      positionMarketValue,
      totalAsset,
      totalPnl,
      totalPnlRate,
      positionCount: positions.length,
      todayAlertCount,
      aiOpinionCount,
    };
  },
}));
