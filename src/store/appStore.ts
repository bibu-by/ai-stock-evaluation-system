// 全局应用状态 - Zustand（按域 Slice 组合层）
// 原先集中管理的巨型 store 已拆分为按域 slice：
//   - slices/configSlice.ts        配置 / 主题
//   - slices/positionsSlice.ts     持仓
//   - slices/conversationsSlice.ts 会话
//   - slices/agentsSlice.ts        Agent 任务 / 运行记录
//   - slices/alertsSlice.ts        风险提醒
//   - slices/modelsSlice.ts        AI 模型
// 本文件保留较小或与账户资金流耦合度高的核心域（account / trades / messages /
// memories / dataSources / accountSnapshots / UI），并通过 initApp 统筹各 slice 的初始化。
// 公共 API（useAppStore 及所有 state 字段、action 签名）与拆分前完全一致。

import { create } from "zustand";
import type { Account } from "@/domain/account";
import type { Trade } from "@/domain/trade";
import type { Memory } from "@/domain/memory";
import type { ChatMessage, Conversation } from "@/domain/chat";
import type { AppConfig } from "@/domain/config";
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
} from "@/services/localStore";
import {
  mockAccount, mockPositions, mockTrades, mockMessages,
  mockAgentJobs, mockAgentRuns, mockAlerts, mockMemories,
  mockModels, mockDataSources, mockAccountSnapshots,
} from "@/mock/mockData";
import { uid, nowIso, cloneJson } from "@/lib/utils";
import { setMarketMode } from "@/services/marketData";
import { defaultConfig } from "@/domain/config";
import { ACCOUNT_SNAPSHOT_RETAIN_DAYS } from "@/domain/constants";

import type { AppState } from "./types";
import { createConfigSlice } from "./slices/configSlice";
import { createPositionsSlice } from "./slices/positionsSlice";
import { createConversationsSlice } from "./slices/conversationsSlice";
import { createAgentsSlice } from "./slices/agentsSlice";
import { createAlertsSlice } from "./slices/alertsSlice";
import { createModelsSlice } from "./slices/modelsSlice";

// 公共类型再导出，保持与拆分前完全一致的对外 API
export type { AppState, PageKey, ChatMode } from "./types";

export const useAppStore = create<AppState>()((set, get, store) => ({
  // ====== 组合各域 slice ======
  ...createConfigSlice(set, get, store),
  ...createPositionsSlice(set, get, store),
  ...createConversationsSlice(set, get, store),
  ...createAgentsSlice(set, get, store),
  ...createAlertsSlice(set, get, store),
  ...createModelsSlice(set, get, store),

  // ====== 核心域（未拆分，保留在本文件） ======
  initialized: false,

  // 初始值（在 initApp 中会被本地存储数据覆盖）
  account: null,
  trades: [],
  messages: [],
  memories: [],
  dataSources: [],
  accountSnapshots: [],

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
      outputJson: msg.outputJson,
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

  // ====== 数据源 ======
  async addDataSource(s) {
    const list = get().dataSources.slice();
    const newS = { ...s, id: uid("ds") };
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
        account: {
          id: "",
          name: "",
          cumulativePrincipal: 0,
          cashBalance: 0,
          currency: "CNY",
          createdAt: "",
          updatedAt: "",
        },
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
