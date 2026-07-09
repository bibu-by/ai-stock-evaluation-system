// 测试 mock 工厂 - 集中提供 Tauri invoke / fetch / keyring 的 mock 工具
//
// 设计要点：
// - vi.mock 工厂在模块加载时注册拦截器；运行时状态通过 vi.hoisted 提升的注册表持有，
//   这样工厂闭包能稳定访问到注册表实例。
// - 默认拦截 @tauri-apps/api/tauri 的 invoke 与 @/services/localStore 的 save/load/apiKey 函数；
//   原有 3 个纯函数测试文件不导入本 setup，因此不受影响。

import { vi } from "vitest";

// vi.hoisted 把注册表提升到 vi.mock 调用之前，
// 这样 vi.mock 工厂闭包可以安全引用同一份注册表实例。
const registry = vi.hoisted(() => ({
  // invoke 命令分发表：command name -> handler
  invokeHandlers: {} as Record<string, (args: any) => any>,
  // keyring 内存条目：keyRef -> apiKey
  keyringEntries: new Map<string, string>(),
}));

// ====== 拦截 @tauri-apps/api/tauri ======
vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (cmd: string, args?: any) => {
    const h = registry.invokeHandlers[cmd];
    if (!h) {
      return Promise.reject(
        new Error(`[mockTauriInvoke] 未注册的 command: ${cmd}`)
      );
    }
    return Promise.resolve(h(args));
  },
}));

// ====== 拦截 @/services/localStore ======
// keyring 函数走内存 Map；其余 save 函数默认 no-op（可用 vi.mocked 在用例中改写），
// load 函数默认返回 fallback，避免在 node 测试环境触碰不存在的 localStorage。
vi.mock("@/services/localStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/localStore")>();
  return {
    ...actual,
    // API Key 凭据：走内存 Map
    readApiKey: vi.fn(async (keyRef: string) =>
      registry.keyringEntries.get(keyRef) ?? null
    ),
    saveApiKey: vi.fn(async (keyRef: string, apiKey: string) => {
      registry.keyringEntries.set(keyRef, apiKey);
    }),
    deleteApiKey: vi.fn(async (keyRef: string) => {
      registry.keyringEntries.delete(keyRef);
    }),
    // save 函数默认 no-op（用例可通过 vi.mocked 改写以断言调用）
    saveAccount: vi.fn(async () => {}),
    savePositions: vi.fn(async () => {}),
    saveTrades: vi.fn(async () => {}),
    saveMessages: vi.fn(async () => {}),
    saveConversations: vi.fn(async () => {}),
    saveAgentJobs: vi.fn(async () => {}),
    saveAgentRuns: vi.fn(async () => {}),
    saveAlerts: vi.fn(async () => {}),
    saveMemories: vi.fn(async () => {}),
    saveModels: vi.fn(async () => {}),
    saveConfig: vi.fn(async () => {}),
    saveDataSources: vi.fn(async () => {}),
    saveAccountSnapshots: vi.fn(async () => {}),
    // load 函数默认返回 fallback
    loadAccount: vi.fn(async () => null),
    loadPositions: vi.fn(async () => []),
    loadTrades: vi.fn(async () => []),
    loadMessages: vi.fn(async () => []),
    loadConversations: vi.fn(async () => []),
    loadAgentJobs: vi.fn(async () => []),
    loadAgentRuns: vi.fn(async () => []),
    loadAlerts: vi.fn(async () => []),
    loadMemories: vi.fn(async () => []),
    loadModels: vi.fn(async () => []),
    loadConfig: vi.fn(async () => null),
    loadDataSources: vi.fn(async () => []),
    loadAccountSnapshots: vi.fn(async () => []),
  };
});

// ====== 对外工厂函数 ======

/**
 * mock @tauri-apps/api/tauri 的 invoke，按 command 名分发到 handler。
 * handlers: { [command]: (args) => result }
 */
export function mockTauriInvoke(
  handlers: Record<string, (args: any) => any>
): void {
  // 清空旧 handler 再注入新的，避免跨用例污染
  for (const k of Object.keys(registry.invokeHandlers)) {
    delete registry.invokeHandlers[k];
  }
  Object.assign(registry.invokeHandlers, handlers);
}

/**
 * mock global fetch，按 URL 子串匹配返回。
 * responses: { [urlSubstr]: { status?, body?, text?, bytes? } }
 *   - body: JSON 序列化对象（res.json() 可解析）
 *   - text: 原始字符串
 *   - bytes: 二进制（用于非文本响应）
 */
export function mockFetch(
  responses: Record<
    string,
    { status?: number; body?: any; text?: string; bytes?: Uint8Array }
  >
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const matchedKey = Object.keys(responses).find((k) =>
        urlStr.includes(k)
      );
      if (!matchedKey) {
        throw new Error(`[mockFetch] 未匹配到 URL: ${urlStr}`);
      }
      const cfg = responses[matchedKey] || {};
      const status = cfg.status ?? 200;
      const headers = new Headers({
        "Content-Type": cfg.bytes
          ? "application/octet-stream"
          : "application/json",
      });
      const bodyText =
        cfg.text !== undefined
          ? cfg.text
          : cfg.body !== undefined
            ? JSON.stringify(cfg.body)
            : "";
      const bodyBytes =
        cfg.bytes ??
        (bodyText ? new TextEncoder().encode(bodyText) : new Uint8Array());
      return {
        ok: status >= 200 && status < 300,
        status,
        headers,
        url: urlStr,
        async json() {
          return cfg.body ?? JSON.parse(cfg.text ?? "null");
        },
        async text() {
          return bodyText;
        },
        async bytes() {
          return bodyBytes;
        },
        async arrayBuffer() {
          return bodyBytes.buffer;
        },
        // SSE 流式测试不通过 fetch（直接调用 parseSseDataLines），body 留空
        body: null as ReadableStream<Uint8Array> | null,
      } as Response;
    })
  );
}

/**
 * mock keyring（API Key 凭据）：注入 keyRef -> apiKey 条目。
 * 调用后 readApiKey/saveApiKey/deleteApiKey 会读写这份内存表。
 */
export function mockKeyring(entries: Record<string, string>): void {
  registry.keyringEntries.clear();
  for (const k of Object.keys(entries)) {
    registry.keyringEntries.set(k, entries[k]);
  }
}

/**
 * 重置所有 mock：清空 invoke/keyring 注册表，恢复 fetch，重置 vi.fn 调用记录。
 */
export function resetMocks(): void {
  for (const k of Object.keys(registry.invokeHandlers)) {
    delete registry.invokeHandlers[k];
  }
  registry.keyringEntries.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
}
