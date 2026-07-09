import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../services/__tests__/setup";

// 拦截 notification，checkAlerts 测试需要断言 notifyAlertTriggered 调用
vi.mock("@/services/notification", () => ({
  notifyAlertTriggered: vi.fn(async () => {}),
  showNotification: vi.fn(async () => {}),
}));

import { useAppStore } from "../appStore";
import * as localStore from "@/services/localStore";
import { notifyAlertTriggered } from "@/services/notification";
import type { Account } from "@/domain/account";
import type { Position } from "@/domain/position";
import type { AlertRule } from "@/domain/agent";
import type { ChatMessage } from "@/domain/chat";
import type { AppConfig } from "@/domain/config";

function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: "acc_1",
    name: "默认账户",
    cumulativePrincipal: 100000,
    cashBalance: 50000,
    currency: "CNY",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makePosition(over: Partial<Position> = {}): Position {
  return {
    id: "pos_1",
    symbol: "600519.SH",
    name: "贵州茅台",
    market: "A_SHARE",
    quantity: 100,
    avgCost: 1500,
    currentPrice: 1600,
    marketValue: 160000,
    unrealizedPnl: 10000,
    unrealizedPnlRate: 6.67,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeAlert(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "alert_1",
    name: "茅台价格提醒",
    enabled: true,
    condition: {
      metric: "price",
      operator: "above",
      value: 1500,
      symbol: "600519.SH",
    },
    level: "warning",
    triggerCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function resetStoreState() {
  useAppStore.setState({
    initialized: false,
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
  });
}

describe("resetAssets", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  it("清空账户本金/现金为 0，保留 id/name/currency", async () => {
    const acc = makeAccount({ cumulativePrincipal: 100000, cashBalance: 50000 });
    useAppStore.setState({ account: acc });
    await useAppStore.getState().resetAssets();
    const updated = useAppStore.getState().account!;
    expect(updated.id).toBe("acc_1");
    expect(updated.name).toBe("默认账户");
    expect(updated.currency).toBe("CNY");
    expect(updated.cumulativePrincipal).toBe(0);
    expect(updated.cashBalance).toBe(0);
  });

  it("清空 positions / trades / accountSnapshots", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition()],
      trades: [{ id: "t1" } as any],
      accountSnapshots: [{ id: "s1" } as any],
    });
    await useAppStore.getState().resetAssets();
    const s = useAppStore.getState();
    expect(s.positions).toHaveLength(0);
    expect(s.trades).toHaveLength(0);
    expect(s.accountSnapshots).toHaveLength(0);
  });

  it("保留 messages / agentJobs / agentRuns / alerts / memories / models / dataSources / config", async () => {
    const config: AppConfig = {
      theme: "dark",
      language: "zh-CN",
      firstRun: false,
      appMode: "fresh",
      primaryMarket: "A_SHARE",
      tradingHoursOnlyByDefault: true,
      autoRefreshIntervalSec: 0,
    };
    const msg: ChatMessage = {
      id: "m1",
      role: "user",
      type: "text",
      content: "hi",
      createdAt: new Date().toISOString(),
    };
    useAppStore.setState({
      account: makeAccount(),
      messages: [msg],
      agentJobs: [{ id: "j1" } as any],
      agentRuns: [{ id: "r1" } as any],
      alerts: [makeAlert()],
      memories: [{ id: "mem1" } as any],
      models: [{ id: "model1" } as any],
      dataSources: [{ id: "ds1" } as any],
      config,
    });
    await useAppStore.getState().resetAssets();
    const s = useAppStore.getState();
    expect(s.messages).toHaveLength(1);
    expect(s.agentJobs).toHaveLength(1);
    expect(s.agentRuns).toHaveLength(1);
    expect(s.alerts).toHaveLength(1);
    expect(s.memories).toHaveLength(1);
    expect(s.models).toHaveLength(1);
    expect(s.dataSources).toHaveLength(1);
    expect(s.config).toBe(config);
  });

  it("account 为 null 时直接 return，不抛错也不写存储", async () => {
    useAppStore.setState({ account: null });
    await expect(useAppStore.getState().resetAssets()).resolves.toBeUndefined();
    expect(localStore.saveAccount).not.toHaveBeenCalled();
  });

  it("调用 saveAccount / savePositions / saveTrades / saveAccountSnapshots 持久化", async () => {
    useAppStore.setState({ account: makeAccount(), positions: [makePosition()] });
    await useAppStore.getState().resetAssets();
    expect(localStore.saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ cumulativePrincipal: 0, cashBalance: 0 })
    );
    expect(localStore.savePositions).toHaveBeenCalledWith([]);
    expect(localStore.saveTrades).toHaveBeenCalledWith([]);
    expect(localStore.saveAccountSnapshots).toHaveBeenCalledWith([]);
  });
});

describe("getAccountSummary", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  it("account 为 null 时返回空 summary，totalAsset=0", () => {
    useAppStore.setState({ account: null });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.totalAsset).toBe(0);
    expect(s.totalPnl).toBe(0);
    expect(s.positionCount).toBe(0);
    expect(s.account.id).toBe("");
  });

  it("有账户无持仓：totalAsset = cashBalance", () => {
    useAppStore.setState({
      account: makeAccount({ cashBalance: 50000, cumulativePrincipal: 100000 }),
      positions: [],
    });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.positionMarketValue).toBe(0);
    expect(s.totalAsset).toBe(50000);
    expect(s.totalPnl).toBe(-50000); // 50000 - 100000
  });

  it("有账户有持仓：totalAsset = cashBalance + 持仓市值", () => {
    useAppStore.setState({
      account: makeAccount({ cashBalance: 50000, cumulativePrincipal: 100000 }),
      positions: [
        makePosition({ marketValue: 160000 }),
        makePosition({ id: "p2", marketValue: 40000 }),
      ],
    });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.positionMarketValue).toBe(200000);
    expect(s.totalAsset).toBe(250000);
    expect(s.positionCount).toBe(2);
  });

  it("盈亏与盈亏率计算正确", () => {
    useAppStore.setState({
      account: makeAccount({ cashBalance: 110000, cumulativePrincipal: 100000 }),
      positions: [makePosition({ marketValue: 90000 })],
    });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.totalPnl).toBe(100000); // 200000 - 100000
    expect(s.totalPnlRate).toBe(100); // 100%
  });

  it("本金为 0 时 totalPnlRate 为 null（避免除零）", () => {
    useAppStore.setState({
      account: makeAccount({ cumulativePrincipal: 0, cashBalance: 50000 }),
      positions: [],
    });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.totalPnlRate).toBeNull();
  });

  it("todayAlertCount 与 aiOpinionCount 按今日派生", () => {
    const today = new Date().toISOString();
    useAppStore.setState({
      account: makeAccount(),
      alerts: [
        makeAlert({ lastTriggeredAt: today }),
        makeAlert({ id: "a2", lastTriggeredAt: "2020-01-01T00:00:00.000Z" }),
      ],
      messages: [
        {
          id: "m1",
          role: "agent",
          type: "agent_run",
          content: "x",
          createdAt: today,
        } as ChatMessage,
        {
          id: "m2",
          role: "user",
          type: "text",
          content: "y",
          createdAt: today,
        } as ChatMessage,
      ],
    });
    const s = useAppStore.getState().getAccountSummary();
    expect(s.todayAlertCount).toBe(1);
    expect(s.aiOpinionCount).toBe(1); // 仅 role=agent 计入
  });
});

describe("checkAlerts", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  it("price above 条件触发：调用 notifyAlertTriggered 并增加 triggerCount", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition({ currentPrice: 1600, symbol: "600519.SH" })],
      alerts: [
        makeAlert({
          condition: { metric: "price", operator: "above", value: 1500, symbol: "600519.SH" },
        }),
      ],
    });
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).toHaveBeenCalledTimes(1);
    const alerts = useAppStore.getState().alerts;
    expect(alerts[0].triggerCount).toBe(1);
    expect(alerts[0].lastTriggeredAt).toBeTruthy();
  });

  it("price 未达条件：不触发通知", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition({ currentPrice: 1400 })],
      alerts: [
        makeAlert({
          condition: { metric: "price", operator: "above", value: 1500, symbol: "600519.SH" },
        }),
      ],
    });
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).not.toHaveBeenCalled();
    expect(useAppStore.getState().alerts[0].triggerCount).toBe(0);
  });

  it("price below 条件触发", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition({ currentPrice: 1400 })],
      alerts: [
        makeAlert({
          condition: { metric: "price", operator: "below", value: 1500, symbol: "600519.SH" },
        }),
      ],
    });
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).toHaveBeenCalledTimes(1);
  });

  it("total_drawdown 条件触发（总资产跌破本金阈值）", async () => {
    useAppStore.setState({
      account: makeAccount({ cumulativePrincipal: 100000, cashBalance: 50000 }),
      positions: [makePosition({ currentPrice: 100, quantity: 100, marketValue: 10000 })],
      alerts: [
        makeAlert({
          name: "回撤提醒",
          condition: { metric: "total_drawdown", operator: "above", value: 30 },
        }),
      ],
    });
    // totalAsset = 50000 + 10000 = 60000；drawdown = (100000-60000)/100000*100 = 40% > 30%
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).toHaveBeenCalledTimes(1);
  });

  it("冷却期内（lastTriggeredAt 在 5 分钟内）不重复触发", async () => {
    const justNow = new Date(Date.now() - 60_000).toISOString(); // 1 分钟前
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition({ currentPrice: 1600 })],
      alerts: [
        makeAlert({
          condition: { metric: "price", operator: "above", value: 1500, symbol: "600519.SH" },
          lastTriggeredAt: justNow,
          triggerCount: 5,
        }),
      ],
    });
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).not.toHaveBeenCalled();
    expect(useAppStore.getState().alerts[0].triggerCount).toBe(5); // 未变
  });

  it("无 enabled alerts 时直接 return，不触发任何通知", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition()],
      alerts: [makeAlert({ enabled: false })],
    });
    await useAppStore.getState().checkAlerts();
    expect(notifyAlertTriggered).not.toHaveBeenCalled();
  });

  it("触发后写入 agent 角色的聊天消息", async () => {
    useAppStore.setState({
      account: makeAccount(),
      positions: [makePosition({ currentPrice: 1600 })],
      alerts: [
        makeAlert({
          name: "测试提醒",
          condition: { metric: "price", operator: "above", value: 1500, symbol: "600519.SH" },
        }),
      ],
      messages: [],
    });
    await useAppStore.getState().checkAlerts();
    const msgs = useAppStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("agent");
    expect(msgs[0].content).toContain("测试提醒");
    expect(msgs[0].type).toBe("agent_run");
  });
});
