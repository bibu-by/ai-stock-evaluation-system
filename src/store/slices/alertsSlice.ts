// 提醒域 Slice
// 管理 alerts 及其增删改 / 风险检查。
// checkAlerts 跨域依赖 positions/account（计算回撤）、updateAlert/addMessage（触发后写记录），
// 通过 get() 访问完整 AppState。
// 支持条件：price / change_rate / pnl_rate / total_drawdown（原有）+ ma_cross_up/down（Task 4）+ composite AND/OR（Task 4）。

import type { StateCreator } from "zustand";
import type { AppState, AlertsSlice } from "../types";
import type { AlertRule, AlertCondition } from "@/domain/agent";
import type { Position } from "@/domain/position";
import { saveAlerts } from "@/services/localStore";
import { getKline } from "@/services/marketData";
import { uid, nowIso } from "@/lib/utils";
import { notifyAlertTriggered } from "@/services/notification";

export const createAlertsSlice: StateCreator<AppState, [], [], AlertsSlice> = (set, get) => ({
  alerts: [],

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

  // 评估所有已启用的风险提醒，触发条件时推送系统通知
  async checkAlerts() {
    const { alerts, positions, account } = get();
    const enabledAlerts = alerts.filter((a) => a.enabled);
    if (enabledAlerts.length === 0) return;

    // 计算当前总资产
    const totalAssets =
      (account?.cashBalance ?? 0) +
      positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
    const principal = account?.cumulativePrincipal ?? 0;
    // 总资产回撤百分比（相对本金）
    const drawdownPct = principal > 0
      ? Math.max(0, (principal - totalAssets) / principal) * 100
      : 0;

    const now = Date.now();
    const COOLDOWN_MS = 5 * 60_000; // 同一提醒 5 分钟内不重复触发

    for (const alert of enabledAlerts) {
      // 冷却：上次触发 5 分钟内跳过
      if (alert.lastTriggeredAt) {
        const lastTs = new Date(alert.lastTriggeredAt).getTime();
        if (now - lastTs < COOLDOWN_MS) continue;
      }

      const { metric, operator, value } = alert.condition;

      // composite 组合条件：递归求值，不走下面的单条件逻辑
      if (alert.condition.composite) {
        const compositeResult = await evaluateComposite(alert.condition.composite, positions, drawdownPct);
        if (compositeResult.triggered) {
          await notifyAlertTriggered(alert.name, compositeResult.label);
          await get().updateAlert(alert.id, {
            lastTriggeredAt: nowIso(),
            triggerCount: alert.triggerCount + 1,
          });
          await get().addMessage({
            id: uid("msg"),
            role: "agent",
            type: "agent_run",
            content: `**风险提醒触发**：${alert.name}\n\n${compositeResult.label}`,
            createdAt: nowIso(),
          });
        }
        continue;
      }

      const symbol = alert.condition.symbol;
      // 确定要检查的持仓（统一去掉市场后缀后比较，支持裸代码与标准格式互配）
      const targetPositions = symbol
        ? positions.filter((p) => normalizeSymbol(p.symbol) === normalizeSymbol(symbol))
        : positions;

      let triggeredValue: number | null = null;
      let triggeredLabel = "";

      if (metric === "total_drawdown") {
        triggeredValue = drawdownPct;
        triggeredLabel = `总资产回撤 ${drawdownPct.toFixed(2)}%`;
      } else if (targetPositions.length > 0) {
        // 取最严重的（最接近触发条件的值）
        for (const p of targetPositions) {
          // MA 交叉条件：拉取 K 线后判断前一日/今日收盘是否穿越 MA
          if (metric === "ma_cross_up" || metric === "ma_cross_down") {
            const window = alert.condition.maWindow ?? 20;
            try {
              const bars = await getKline(p.symbol, "1d", Math.max(window + 5, 30));
              if (bars.length < window + 1) continue;
              const last = bars[bars.length - 1];
              const prev = bars[bars.length - 2];
              // 自定义 window（如 20）可能不在 ma5/ma10/ma20 中，本地计算 SMA
              const closes = bars.map((b) => b.close);
              const lastMa = computeSMAAt(closes, window, closes.length - 1);
              const prevMa = computeSMAAt(closes, window, closes.length - 2);
              if (lastMa === null || prevMa === null) continue;

              const isTriggered = metric === "ma_cross_up"
                ? prev.close <= prevMa && last.close > lastMa  // 上穿：前一日收盘在 MA 下方，今日收盘在 MA 上方
                : prev.close >= prevMa && last.close < lastMa;  // 下穿：前一日收盘在 MA 上方，今日收盘在 MA 下方

              if (isTriggered) {
                triggeredValue = last.close;
                triggeredLabel = `${p.name}(${p.symbol}) 价格 ${metric === "ma_cross_up" ? "上穿" : "下穿"} MA${window}（现价 ${last.close.toFixed(2)}）`;
                break;
              }
            } catch (e) {
              console.warn(`[checkAlerts] 拉取 ${p.symbol} K 线失败，跳过 MA 条件检查`, e);
            }
            continue; // ma_cross 处理完毕（未触发或异常），跳过下面的 currentValue 逻辑
          }

          let currentValue: number | null = null;
          if (metric === "price") {
            currentValue = p.currentPrice;
          } else if (metric === "change_rate") {
            currentValue = p.todayChangeRate ?? 0;
          } else if (metric === "pnl_rate") {
            currentValue = p.unrealizedPnlRate ?? 0;
          }
          if (currentValue === null) continue;

          const isTriggered =
            operator === "above" ? currentValue > value :
            operator === "below" ? currentValue < value :
            false;

          if (isTriggered) {
            triggeredValue = currentValue;
            triggeredLabel = `${p.name}(${p.symbol}) ${metric === "price" ? "价格" : metric === "change_rate" ? "涨跌幅" : "收益率"} ${currentValue.toFixed(2)}`;
            break;
          }
        }
      }

      if (triggeredValue !== null) {
        // MA 交叉条件已在 label 中包含完整信息，不再追加 "高于/低于 阈值" 后缀
        const isCross = metric === "ma_cross_up" || metric === "ma_cross_down";
        const notifySuffix = isCross ? "" : ` ${operator === "above" ? "高于" : "低于"} ${value}`;
        const msgSuffix = isCross ? "" : ` ${operator === "above" ? "高于" : "低于"} 阈值 ${value}`;
        // 推送系统通知
        await notifyAlertTriggered(alert.name, `${triggeredLabel}${notifySuffix}`);
        // 更新触发记录
        await get().updateAlert(alert.id, {
          lastTriggeredAt: nowIso(),
          triggerCount: alert.triggerCount + 1,
        });
        // 写入聊天消息
        await get().addMessage({
          id: uid("msg"),
          role: "agent",
          type: "agent_run",
          content: `**风险提醒触发**：${alert.name}\n\n${triggeredLabel}${msgSuffix}`,
          createdAt: nowIso(),
        });
      }
    }
  },
});

// ====== MA / 组合条件求值辅助函数 ======

// 计算指定位置的 SMA，若位置不足 window 则返回 null
function computeSMAAt(closes: number[], window: number, index: number): number | null {
  if (index + 1 < window) return null;
  const start = index + 1 - window;
  const sum = closes.slice(start, index + 1).reduce((a, b) => a + b, 0);
  return sum / window;
}

// 统一股票代码格式：去掉 .SH/.SZ/.BJ 后缀并小写，便于裸代码与标准格式互配
function normalizeSymbol(symbol: string): string {
  return symbol.replace(/\.(SH|SZ|BJ)$/i, "").toLowerCase();
}

// 评估单个（非 composite）条件，返回是否触发 + 描述
// 用于 composite 组合条件的子规则求值（与主循环单条件逻辑一致，但对 total_drawdown 也按 operator 判断）
async function evaluateSingleCondition(
  condition: AlertCondition,
  positions: Position[],
  drawdownPct: number
): Promise<{ triggered: boolean; label: string }> {
  const { metric, operator, value, symbol } = condition;
  const targetPositions = symbol
    ? positions.filter((p) => normalizeSymbol(p.symbol) === normalizeSymbol(symbol))
    : positions;

  if (metric === "total_drawdown") {
    const isTriggered =
      operator === "above" ? drawdownPct > value :
      operator === "below" ? drawdownPct < value : false;
    return { triggered: isTriggered, label: `总资产回撤 ${drawdownPct.toFixed(2)}%` };
  }

  if (metric === "ma_cross_up" || metric === "ma_cross_down") {
    const window = condition.maWindow ?? 20;
    for (const p of targetPositions) {
      try {
        const bars = await getKline(p.symbol, "1d", Math.max(window + 5, 30));
        if (bars.length < window + 1) continue;
        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const closes = bars.map((b) => b.close);
        const lastMa = computeSMAAt(closes, window, closes.length - 1);
        const prevMa = computeSMAAt(closes, window, closes.length - 2);
        if (lastMa === null || prevMa === null) continue;

        const isTriggered = metric === "ma_cross_up"
          ? prev.close <= prevMa && last.close > lastMa
          : prev.close >= prevMa && last.close < lastMa;

        if (isTriggered) {
          return {
            triggered: true,
            label: `${p.name}(${p.symbol}) 价格 ${metric === "ma_cross_up" ? "上穿" : "下穿"} MA${window}（现价 ${last.close.toFixed(2)}）`,
          };
        }
      } catch (e) {
        console.warn(`[checkAlerts] 拉取 ${p.symbol} K 线失败，跳过 MA 条件检查`, e);
        continue;
      }
    }
    return { triggered: false, label: "" };
  }

  // price / change_rate / pnl_rate / position_ratio
  for (const p of targetPositions) {
    let currentValue: number | null = null;
    if (metric === "price") {
      currentValue = p.currentPrice;
    } else if (metric === "change_rate") {
      currentValue = p.todayChangeRate ?? 0;
    } else if (metric === "pnl_rate") {
      currentValue = p.unrealizedPnlRate ?? 0;
    }
    if (currentValue === null) continue;

    const isTriggered =
      operator === "above" ? currentValue > value :
      operator === "below" ? currentValue < value : false;

    if (isTriggered) {
      const label = `${p.name}(${p.symbol}) ${metric === "price" ? "价格" : metric === "change_rate" ? "涨跌幅" : "收益率"} ${currentValue.toFixed(2)}`;
      return { triggered: true, label };
    }
  }
  return { triggered: false, label: "" };
}

// 组合条件最大允许嵌套深度，防止异常数据导致栈溢出
const MAX_COMPOSITE_DEPTH = 5;

// 递归求值组合条件：AND = 全部满足，OR = 任一满足
async function evaluateComposite(
  composite: { op: "AND" | "OR"; rules: AlertCondition[] },
  positions: Position[],
  drawdownPct: number,
  depth = 0
): Promise<{ triggered: boolean; label: string }> {
  if (depth > MAX_COMPOSITE_DEPTH) {
    console.warn("[checkAlerts] 组合条件嵌套过深，已跳过");
    return { triggered: false, label: "" };
  }
  const results = await Promise.all(
    composite.rules.map((rule) => {
      if (rule.composite) {
        return evaluateComposite(rule.composite, positions, drawdownPct, depth + 1);
      }
      return evaluateSingleCondition(rule, positions, drawdownPct);
    })
  );
  const triggered = composite.op === "AND"
    ? results.every((r) => r.triggered)
    : results.some((r) => r.triggered);
  const label = results.filter((r) => r.triggered).map((r) => r.label).join("; ");
  return { triggered, label };
}
