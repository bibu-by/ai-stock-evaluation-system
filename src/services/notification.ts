// 系统通知服务 - 桌面 GUI 应用专用
// 通过 Tauri 命令弹出真正的系统通知（Windows 通知中心）。
// 典型场景：Agent 巡检完成、股票触发价格提醒、总资产回撤超阈值、行情/AI 接口失败。

import { isTauri } from "@/lib/utils";

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<T>(cmd, args);
}

/**
 * 弹出系统通知
 * @param title 通知标题
 * @param body 通知正文
 */
export async function showNotification(title: string, body: string): Promise<void> {
  if (!isTauri()) {
    // 浏览器开发环境 fallback：使用 Web Notification API
    if (typeof Notification !== "undefined") {
      try {
        if (Notification.permission === "granted") {
          new Notification(title, { body });
        } else if (Notification.permission !== "denied") {
          const perm = await Notification.requestPermission();
          if (perm === "granted") {
            new Notification(title, { body });
          }
        }
      } catch (e) {
        console.warn("[notification] Web Notification 失败", e);
      }
    }
    return;
  }
  try {
    await tauriInvoke("show_notification", { title, body });
  } catch (e) {
    console.error("[notification] 系统通知失败", e);
  }
}

/**
 * Agent 巡检完成通知
 */
export function notifyAgentRunFinished(jobName: string, summary: string): Promise<void> {
  return showNotification("AI 炒股 Agent 巡检完成", `${jobName}\n${summary}`);
}

/**
 * Agent 任务失败通知
 */
export function notifyAgentRunFailed(jobName: string, reason: string): Promise<void> {
  return showNotification("Agent 任务执行失败", `${jobName}\n${reason}`);
}

/**
 * 价格提醒触发通知
 */
export function notifyAlertTriggered(alertName: string, detail: string): Promise<void> {
  return showNotification("风险提醒触发", `${alertName}\n${detail}`);
}

/**
 * 行情接口失败通知
 */
export function notifyMarketDataFailed(reason: string): Promise<void> {
  return showNotification("行情数据获取失败", reason);
}

/**
 * AI API 调用失败通知
 */
export function notifyAiApiFailed(reason: string): Promise<void> {
  return showNotification("AI 接口调用失败", reason);
}
