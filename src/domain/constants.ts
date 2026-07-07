// 全局工程常量集中管理
// 将散落在各模块的 magic number / 硬编码阈值集中到此文件，便于后续统一调整与审查。
// 注意：交易时段定义位于 config.ts（TRADING_HOURS），此处不重复声明。

// ====== 行情服务 ======

/** 行情内存缓存有效期（毫秒）。超过此时间的缓存条目视为过期，需重新请求。 */
export const QUOTE_CACHE_MS = 15_000;

/** 行情内存缓存最大条目数（LRU 上限）。防止长期运行内存持续增长。 */
export const QUOTE_CACHE_MAX_SIZE = 256;

// ====== AI 网关 ======

/** 聊天历史滑动窗口 token 阈值。超过此值的早期消息会被截断，仅影响发送给 AI 的上下文。 */
export const SLIDING_WINDOW_MAX_TOKENS = 6000;

/** 滑动窗口为新生成预留的 token 数。 */
export const SLIDING_WINDOW_RESERVED_TOKENS = 2048;

// ====== Agent 调度 ======

/** Agent 调度器默认轮询间隔（毫秒）。 */
export const AGENT_SCHEDULER_INTERVAL_MS = 30_000;

// ====== 账户快照 ======

/** 账户快照保留天数。超过此天数的快照会被清理。 */
export const ACCOUNT_SNAPSHOT_RETAIN_DAYS = 90;

// ====== Rust HTTP 请求 ======

/** Rust 端 reqwest 请求默认超时（秒）。AI API 与行情接口共用。 */
export const RUST_HTTP_TIMEOUT_SECS = 30;

/** Rust 端 reqwest 默认 User-Agent。 */
export const RUST_HTTP_USER_AGENT = "Mozilla/5.0";
