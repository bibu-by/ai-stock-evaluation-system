// 持仓域 Slice
// 管理 positions 及其增删改 / 卖出 / 行情刷新。
// 注意：本 slice 的 action 跨域依赖 account（扣减现金/本金）、addTrade（写交易记录）、
// recordSnapshot（刷新收益曲线），均通过 get() 访问完整 AppState 实现。

import type { StateCreator } from "zustand";
import type { AppState, PositionsSlice } from "../types";
import type { Account } from "@/domain/account";
import type { Position } from "@/domain/position";
import { savePositions, saveAccount } from "@/services/localStore";
import { uid, nowIso } from "@/lib/utils";
import { getBatchQuotes } from "@/services/marketData";

export const createPositionsSlice: StateCreator<AppState, [], [], PositionsSlice> = (set, get) => ({
  positions: [],
  lastQuoteRefresh: null,

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
    // 行情全部为空时抛错，让调用方（RefreshButton / 自动刷新）能给用户反馈
    if (Object.keys(quotes).length === 0) {
      throw new Error("未获取到任何行情数据，请检查股票代码或网络");
    }
    // 统计各数据源来源数量，体现新浪主 + 腾讯补 + fallback 机制
    let sina = 0, sinaTencent = 0, tencent = 0;
    for (const sym of Object.keys(quotes)) {
      const src = quotes[sym].source;
      if (src === "sina+tencent") sinaTencent++;
      else if (src === "tencent") tencent++;
      else sina++;
    }
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
    set({
      positions: list,
      // 记录本次行情刷新的来源统计，供持仓页展示数据源 fallback 机制
      lastQuoteRefresh: {
        sina,
        sinaTencent,
        tencent,
        total: Object.keys(quotes).length,
        time: nowIso(),
      },
    });
    // 行情刷新后写入当日快照，让收益曲线最新点跟随行情
    await get().recordSnapshot();
  },
});
