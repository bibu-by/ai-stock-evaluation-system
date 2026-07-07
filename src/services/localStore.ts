// 本地存储服务 - 桌面 GUI 应用数据访问封装
// 正式版本通过 Tauri 命令读写 AppData 目录下的 JSON 文件：
//   loadXxx() -> invoke("read_app_json", { key })
//   saveXxx() -> invoke("write_app_json", { key, content })
// localStorage 仅作为浏览器开发环境下的 fallback，不作为正式存储。
// 前端不直接传文件路径，由 Rust 端按 key 白名单映射到安全路径。

import type { Account, AccountSnapshot } from "@/domain/account";
import type { Position } from "@/domain/position";
import type { Trade } from "@/domain/trade";
import type { AgentJob, AgentRun, AlertRule } from "@/domain/agent";
import type { Memory } from "@/domain/memory";
import type { ChatMessage, Conversation } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import type { AppConfig, MarketDataSource } from "@/domain/config";
import { isTauri } from "@/lib/utils";

const KEY_PREFIX = "ai-stock-agent:";

// 与 Rust 端 ALLOWED_KEYS 白名单一致的数据 key
export type AppDataKey =
  | "config"
  | "account"
  | "positions"
  | "trades"
  | "models"
  | "data-sources"
  | "messages"
  | "conversations"
  | "agent-jobs"
  | "agent-runs"
  | "alerts"
  | "memories"
  | "account-snapshots";

// ====== 底层封装 ======

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<T>(cmd, args);
}

async function appRead<T>(key: AppDataKey, fallback: T): Promise<T> {
  if (isTauri()) {
    try {
      const content = await tauriInvoke<string>("read_app_json", { key });
      if (!content) return fallback;
      return JSON.parse(content) as T;
    } catch (e) {
      console.warn("[localStore] read failed", key, e);
      return fallback;
    }
  }
  // 开发环境 fallback：localStorage
  return readFromLocalStorage(key, fallback);
}

async function appWrite<T>(key: AppDataKey, value: T): Promise<void> {
  const content = JSON.stringify(value, null, 2);
  if (isTauri()) {
    try {
      await tauriInvoke("write_app_json", { key, content });
      return;
    } catch (e) {
      console.warn("[localStore] write failed, fallback to localStorage", key, e);
    }
  }
  writeToLocalStorage(key, value);
}

function readFromLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn("[localStore] 读取 localStorage 失败，使用 fallback", key, e);
    return fallback;
  }
}

function writeToLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("[localStore] localStorage write failed", key, e);
  }
}

// ====== 业务封装 ======

export async function loadConfig(): Promise<AppConfig | null> {
  return appRead<AppConfig | null>("config", null);
}
export async function saveConfig(config: AppConfig): Promise<void> {
  await appWrite("config", config);
}

export async function loadAccount(): Promise<Account | null> {
  const account = await appRead<Account | null>("account", null);
  if (!account) return null;
  // 数据迁移：旧字段 initialCapital → cumulativePrincipal
  const a = account as any;
  if (a.initialCapital !== undefined && a.cumulativePrincipal === undefined) {
    a.cumulativePrincipal = a.initialCapital;
    delete a.initialCapital;
    await saveAccount(account);
  }
  return account;
}
export async function saveAccount(account: Account): Promise<void> {
  await appWrite("account", account);
}

// 账户快照（用于收益折线图）
export async function loadAccountSnapshots(): Promise<AccountSnapshot[]> {
  return appRead<AccountSnapshot[]>("account-snapshots", []);
}
export async function saveAccountSnapshots(snapshots: AccountSnapshot[]): Promise<void> {
  await appWrite("account-snapshots", snapshots);
}

export async function loadPositions(): Promise<Position[]> {
  return appRead<Position[]>("positions", []);
}
export async function savePositions(positions: Position[]): Promise<void> {
  await appWrite("positions", positions);
}

export async function loadTrades(): Promise<Trade[]> {
  return appRead<Trade[]>("trades", []);
}
export async function saveTrades(trades: Trade[]): Promise<void> {
  await appWrite("trades", trades);
}

export async function loadMessages(): Promise<ChatMessage[]> {
  return appRead<ChatMessage[]>("messages", []);
}
export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  await appWrite("messages", messages);
}

export async function loadConversations(): Promise<Conversation[]> {
  return appRead<Conversation[]>("conversations", []);
}
export async function saveConversations(list: Conversation[]): Promise<void> {
  await appWrite("conversations", list);
}

export async function loadAgentJobs(): Promise<AgentJob[]> {
  return appRead<AgentJob[]>("agent-jobs", []);
}
export async function saveAgentJobs(jobs: AgentJob[]): Promise<void> {
  await appWrite("agent-jobs", jobs);
}

export async function loadAgentRuns(): Promise<AgentRun[]> {
  return appRead<AgentRun[]>("agent-runs", []);
}
export async function saveAgentRuns(runs: AgentRun[]): Promise<void> {
  await appWrite("agent-runs", runs);
}

export async function loadAlerts(): Promise<AlertRule[]> {
  return appRead<AlertRule[]>("alerts", []);
}
export async function saveAlerts(alerts: AlertRule[]): Promise<void> {
  await appWrite("alerts", alerts);
}

export async function loadMemories(): Promise<Memory[]> {
  return appRead<Memory[]>("memories", []);
}
export async function saveMemories(memories: Memory[]): Promise<void> {
  await appWrite("memories", memories);
}

export async function loadModels(): Promise<AiModelConfig[]> {
  return appRead<AiModelConfig[]>("models", []);
}
export async function saveModels(models: AiModelConfig[]): Promise<void> {
  await appWrite("models", models);
}

export async function loadDataSources(): Promise<MarketDataSource[]> {
  return appRead<MarketDataSource[]>("data-sources", []);
}
export async function saveDataSources(sources: MarketDataSource[]): Promise<void> {
  await appWrite("data-sources", sources);
}

// ====== API Key 安全凭据封装 ======
// 模型 JSON 只保存 apiKeyRef，真正的 API Key 存在系统安全凭据里。

export async function saveApiKey(keyRef: string, apiKey: string): Promise<void> {
  if (!isTauri()) {
    // 开发环境 fallback：写入 localStorage（仅用于浏览器调试）
    try {
      localStorage.setItem(KEY_PREFIX + "key:" + keyRef, apiKey);
    } catch (e) {
      console.error("[localStore] saveApiKey fallback failed", e);
    }
    return;
  }
  await tauriInvoke("save_api_key", { keyRef, apiKey });
}

export async function readApiKey(keyRef: string): Promise<string | null> {
  if (!isTauri()) {
    try {
      return localStorage.getItem(KEY_PREFIX + "key:" + keyRef);
    } catch (e) {
      console.warn("[localStore] 读取 API Key 失败", keyRef, e);
      return null;
    }
  }
  const result = await tauriInvoke<string | null>("read_api_key", { keyRef });
  return result;
}

export async function deleteApiKey(keyRef: string): Promise<void> {
  if (!isTauri()) {
    try {
      localStorage.removeItem(KEY_PREFIX + "key:" + keyRef);
    } catch (e) {
      console.error("[localStore] deleteApiKey fallback failed", e);
    }
    return;
  }
  await tauriInvoke("delete_api_key", { keyRef });
}

// ====== 全量数据操作 ======

// 导出全部数据为 JSON（优先调用 Rust 命令，确保拿到 AppData 真实数据）
export async function exportAllData(): Promise<string> {
  if (isTauri()) {
    try {
      return await tauriInvoke<string>("export_all_data", {});
    } catch (e) {
      console.warn("[localStore] export_all_data failed, fallback to local", e);
    }
  }
  const [config, account, positions, trades, messages, jobs, runs, alerts, memories, models, dataSources, snapshots] =
    await Promise.all([
      loadConfig(),
      loadAccount(),
      loadPositions(),
      loadTrades(),
      loadMessages(),
      loadAgentJobs(),
      loadAgentRuns(),
      loadAlerts(),
      loadMemories(),
      loadModels(),
      loadDataSources(),
      loadAccountSnapshots(),
    ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      config,
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
    },
    null,
    2
  );
}

// 清空所有数据（优先调用 Rust 命令，确保 AppData 下的文件被真实删除）
export async function clearAllData(): Promise<void> {
  if (isTauri()) {
    try {
      await tauriInvoke("clear_all_data", {});
      return;
    } catch (e) {
      console.warn("[localStore] clear_all_data failed, fallback to local", e);
    }
  }
  const keys: AppDataKey[] = [
    "config",
    "account",
    "positions",
    "trades",
    "messages",
    "agent-jobs",
    "agent-runs",
    "alerts",
    "memories",
    "models",
    "data-sources",
    "account-snapshots",
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(KEY_PREFIX + k);
    } catch (e) {
      console.error("[localStore] clear failed", k, e);
    }
  }
}
