// 行情数据服务 - 桌面 GUI 应用版本
// 桌面环境通过 Tauri command（get_batch_quotes）在 Rust 端调用行情 HTTP API，
// 避免浏览器 CORS 限制，并统一重试 / 缓存。
//
// 必须明确区分两种模式：
//   - Demo 模式：允许返回 mock 行情（仅用于体验界面，不作为真实价格）
//   - Real 模式：行情失败必须抛错提示，绝不伪造价格误导用户

import type { Quote, KlineBar, KlinePeriod, AnnouncementItem } from "@/domain/position";
import type { MarketDataSource } from "@/domain/config";
import { isTauri } from "@/lib/utils";
import { QUOTE_CACHE_MS, QUOTE_CACHE_MAX_SIZE } from "@/domain/constants";

// 简易内存缓存（LRU，上限 QUOTE_CACHE_MAX_SIZE）
const quoteCache = new Map<string, { quote: Quote; ts: number }>();

// LRU 写入：Map 在 JS 中按插入顺序遍历，超过上限时删除最旧条目
function setCache(symbol: string, entry: { quote: Quote; ts: number }): void {
  // 若已存在，先删除以保证重新插入后位于最新位置
  quoteCache.delete(symbol);
  quoteCache.set(symbol, entry);
  // 超过上限时淘汰最旧（Map 迭代顺序 = 插入顺序）
  while (quoteCache.size > QUOTE_CACHE_MAX_SIZE) {
    const oldest = quoteCache.keys().next().value;
    if (oldest === undefined) break;
    quoteCache.delete(oldest);
  }
}

// 当前行情模式：默认 real，由 appStore 在初始化时根据 config.appMode 设置
let marketMode: "fresh" | "demo" = "fresh";

export function setMarketMode(mode: "fresh" | "demo") {
  marketMode = mode;
}

export function getMarketMode(): "fresh" | "demo" {
  return marketMode;
}

// 股票名称 -> 代码的简易匹配表（A 股常见股票，用于第一版）
const SYMBOL_MAP: Record<string, { symbol: string; name: string; market: string }> = {
  贵州茅台: { symbol: "600519.SH", name: "贵州茅台", market: "A_SHARE" },
  比亚迪: { symbol: "002594.SZ", name: "比亚迪", market: "A_SHARE" },
  宁德时代: { symbol: "300750.SZ", name: "宁德时代", market: "A_SHARE" },
  中国平安: { symbol: "601318.SH", name: "中国平安", market: "A_SHARE" },
  招商银行: { symbol: "600036.SH", name: "招商银行", market: "A_SHARE" },
  五粮液: { symbol: "000858.SZ", name: "五粮液", market: "A_SHARE" },
  隆基绿能: { symbol: "601012.SH", name: "隆基绿能", market: "A_SHARE" },
  阳光电源: { symbol: "300274.SZ", name: "阳光电源", market: "A_SHARE" },
  中芯国际: { symbol: "688981.SH", name: "中芯国际", market: "A_SHARE" },
  海康威视: { symbol: "002415.SZ", name: "海康威视", market: "A_SHARE" },
  美的集团: { symbol: "000333.SZ", name: "美的集团", market: "A_SHARE" },
  格力电器: { symbol: "000651.SZ", name: "格力电器", market: "A_SHARE" },
  万科A: { symbol: "000002.SZ", name: "万科A", market: "A_SHARE" },
  京东方A: { symbol: "000725.SZ", name: "京东方A", market: "A_SHARE" },
  中国中免: { symbol: "601888.SH", name: "中国中免", market: "A_SHARE" },
};

// 根据输入字符串推断股票代码与市场（A 股 / 港股 / 美股）
export function inferMarketByCode(code: string): { symbol: string; market: string } | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  // 必须是纯数字或纯字母，否则无法推断
  const isPureDigits = /^\d+$/.test(trimmed);
  const isPureLetters = /^[a-zA-Z]+$/.test(trimmed);
  if (!isPureDigits && !isPureLetters) return null;

  // A 股规则：6 位纯数字
  if (isPureDigits && trimmed.length === 6) {
    if (trimmed.startsWith("688")) {
      return { symbol: `${trimmed}.SH`, market: "A_SHARE" };
    }
    if (trimmed.startsWith("6")) {
      return { symbol: `${trimmed}.SH`, market: "A_SHARE" };
    }
    if (trimmed.startsWith("0")) {
      return { symbol: `${trimmed}.SZ`, market: "A_SHARE" };
    }
    if (trimmed.startsWith("3")) {
      return { symbol: `${trimmed}.SZ`, market: "A_SHARE" };
    }
    if (trimmed.startsWith("8")) {
      return { symbol: `${trimmed}.BJ`, market: "A_SHARE" };
    }
    if (trimmed.startsWith("4")) {
      return { symbol: `${trimmed}.BJ`, market: "A_SHARE" };
    }
    return null;
  }

  // 港股规则：5 位纯数字
  if (isPureDigits && trimmed.length === 5) {
    return { symbol: `${trimmed}.HK`, market: "HK" };
  }

  // 美股规则：纯字母 1-5 位
  if (isPureLetters && trimmed.length >= 1 && trimmed.length <= 5) {
    return { symbol: `${trimmed}.US`, market: "US" };
  }

  return null;
}

export function matchSymbolByName(name: string): { symbol: string; name: string; market: string } | null {
  if (!name) return null;
  // 1. 原硬编码匹配（保留不动）
  if (SYMBOL_MAP[name]) return SYMBOL_MAP[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(SYMBOL_MAP)) {
    if (key.includes(name) || name.includes(key) || key.toLowerCase().includes(lower)) {
      return SYMBOL_MAP[key];
    }
  }
  // 2. 新增：硬编码匹配失败，尝试当作股票代码处理
  const inferred = inferMarketByCode(name);
  if (inferred) {
    return { symbol: inferred.symbol, name: inferred.symbol, market: inferred.market };
  }
  return null;
}

export function searchSymbol(keyword: string): Array<{ symbol: string; name: string; market: string }> {
  if (!keyword) return [];
  const results: Array<{ symbol: string; name: string; market: string }> = [];
  for (const item of Object.values(SYMBOL_MAP)) {
    if (item.name.includes(keyword) || item.symbol.includes(keyword)) {
      results.push(item);
    }
  }
  return results.slice(0, 10);
}

// Rust 端 get_batch_quotes 返回的载荷
interface QuotePayload {
  symbol: string;
  name: string;
  current_price: number;
  prev_close: number;
  open: number;
  high: number;
  low: number;
  change_rate: number;
  volume: number;
  turnover: number;
  updated_at: string;
  // 基本面字段（腾讯财经补充）
  pe_ttm?: number;
  pe_static?: number;
  pb?: number;
  market_cap_yi?: number;
  float_market_cap_yi?: number;
  turnover_rate?: number;
  limit_up?: number;
  limit_down?: number;
  source?: string;
}

// Rust 端 get_kline 返回的载荷
interface KlineBarPayload {
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
}

function payloadToQuote(p: QuotePayload): Quote {
  return {
    symbol: p.symbol,
    name: p.name,
    currentPrice: p.current_price,
    prevClose: p.prev_close,
    open: p.open,
    high: p.high,
    low: p.low,
    changeRate: p.change_rate,
    volume: p.volume,
    turnover: p.turnover,
    updatedAt: p.updated_at,
    // 基本面字段（腾讯补充，可能为 undefined）
    pe: p.pe_ttm,
    peTtm: p.pe_ttm,
    peStatic: p.pe_static,
    pb: p.pb,
    turnoverRate: p.turnover_rate,
    marketCapYi: p.market_cap_yi,
    floatMarketCapYi: p.float_market_cap_yi,
    limitUp: p.limit_up,
    limitDown: p.limit_down,
    source: p.source,
  };
}

// 单只股票实时报价
export async function getQuote(symbol: string): Promise<Quote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_MS) {
    return cached.quote;
  }

  // Demo 模式：允许 mock 行情
  if (marketMode === "demo") {
    const mock = mockQuote(symbol);
    setCache(symbol, { quote: mock, ts: Date.now() });
    return mock;
  }

  // Real 模式：必须走真实接口，失败抛错
  if (isTauri()) {
    const quotes = await getBatchQuotesFromTauri([symbol]);
    const q = quotes[symbol];
    if (q) {
      setCache(symbol, { quote: q, ts: Date.now() });
      return q;
    }
    // 真实模式行情失败：不伪造价格，返回 null 由调用方提示
    return null;
  }

  // 浏览器开发环境 fallback：尝试新浪接口（可能 CORS 失败）
  try {
    const code = sinaCode(symbol);
    const url = `https://hq.sinajs.cn/list=${code}`;
    const res = await fetch(url, {
      headers: { Referer: "https://finance.sina.com.cn" },
    });
    if (res.ok) {
      const text = await res.text();
      const quote = parseSinaQuote(symbol, text);
      if (quote) {
        setCache(symbol, { quote, ts: Date.now() });
        return quote;
      }
    }
  } catch (e) {
    console.warn("[marketData] 浏览器行情请求失败", e);
  }
  return null;
}

// 批量报价
export async function getBatchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};

  // Demo 模式：返回 mock
  if (marketMode === "demo") {
    const result: Record<string, Quote> = {};
    for (const s of symbols) {
      result[s] = mockQuote(s);
    }
    return result;
  }

  // Real 模式：Tauri 命令
  if (isTauri()) {
    return getBatchQuotesFromTauri(symbols);
  }

  // 浏览器 fallback
  const result: Record<string, Quote> = {};
  for (const s of symbols) {
    const q = await getQuote(s);
    if (q) result[s] = q;
  }
  return result;
}

// 通过 Tauri command 调用 Rust 端行情接口
async function getBatchQuotesFromTauri(symbols: string[]): Promise<Record<string, Quote>> {
  try {
    // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
    const { invoke } = await import("@tauri-apps/api/tauri");
    const payloads = await invoke<QuotePayload[]>("get_batch_quotes", { symbols });
    const result: Record<string, Quote> = {};
    for (const p of payloads) {
      const q = payloadToQuote(p);
      result[p.symbol] = q;
      setCache(p.symbol, { quote: q, ts: Date.now() });
    }
    return result;
  } catch (e) {
    console.error("[marketData] Tauri 行情请求失败", e);
    throw e;
  }
}

// K 线数据
// - Demo 模式：返回 mock K 线（体验界面用）
// - Real 模式 + Tauri 环境：调用 Rust get_kline 命令（腾讯财经，前复权日 K + 本地算 MA）
// - 浏览器开发环境：返回空数组（避免 CORS）
export async function getKline(
  symbol: string,
  period: KlinePeriod = "1d",
  count: number = 60
): Promise<KlineBar[]> {
  // Demo 模式：返回 mock
  if (marketMode === "demo") {
    return mockKline(symbol, period);
  }

  // Real 模式：Tauri 命令
  if (isTauri()) {
    return getKlineFromTauri(symbol, period, count);
  }

  // 浏览器 fallback：无 HTTP 直连，避免 CORS
  console.warn("[marketData] 浏览器环境下 K 线接口不可用，请在 Tauri 应用中调用");
  return [];
}

// 通过 Tauri command 调用 Rust 端 get_kline
async function getKlineFromTauri(
  symbol: string,
  period: string,
  count: number
): Promise<KlineBar[]> {
  try {
    // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
    const { invoke } = await import("@tauri-apps/api/tauri");
    const payloads = await invoke<KlineBarPayload[]>("get_kline", { symbol, period, count });
    return payloads.map((p) => ({
      time: p.time,
      open: p.open,
      close: p.close,
      high: p.high,
      low: p.low,
      volume: p.volume,
      ma5: p.ma5,
      ma10: p.ma10,
      ma20: p.ma20,
    }));
  } catch (e) {
    console.error("[marketData] Tauri K 线请求失败", e);
    throw e;
  }
}

// 获取股票最新公告列表（东方财富公告接口，仅 Tauri 环境可用）
// 浏览器环境下不可用，降级为空数组。
export async function getAnnouncements(
  symbol: string,
  count: number = 5
): Promise<AnnouncementItem[]> {
  if (!isTauri()) {
    console.warn("[marketData] 浏览器环境下公告接口不可用");
    return [];
  }
  try {
    // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
    const { invoke } = await import("@tauri-apps/api/tauri");
    return await invoke<AnnouncementItem[]>("get_announcements", { symbol, count });
  } catch (e) {
    console.warn(`[marketData] 获取 ${symbol} 公告失败`, e);
    return []; // 降级为空数组
  }
}

// 研报（机构评级 / EPS 预测 / 摘要），仅 Tauri 环境可用。
// 浏览器环境下不可用，降级为空数组。
export interface ResearchReport {
  title: string;
  orgName: string;
  rating: string | null;
  publishDate: string;
  epsForecast: string | null;
  summary: string | null;
}

export async function getResearchReports(
  symbol: string,
  count: number = 10
): Promise<ResearchReport[]> {
  if (!isTauri()) {
    console.warn("[marketData] 浏览器环境下研报接口不可用");
    return [];
  }
  try {
    // @ts-ignore - Tauri v1 在浏览器环境下不存在该模块
    const { invoke } = await import("@tauri-apps/api/tauri");
    return await invoke<ResearchReport[]>("get_research_reports", { symbol, count });
  } catch (e) {
    console.warn("[marketData] 获取研报失败", e);
    return [];
  }
}

// 市场概况（mock，仅 Demo 模式使用）
export async function getMarketOverview(): Promise<{
  indices: Array<{ name: string; value: number; changeRate: number }>;
}> {
  return {
    indices: [
      { name: "上证指数", value: 3245.78, changeRate: 0.42 },
      { name: "深证成指", value: 10234.56, changeRate: -0.18 },
      { name: "创业板指", value: 2089.34, changeRate: -0.65 },
      { name: "科创50", value: 987.65, changeRate: 1.23 },
    ],
  };
}

// ====== 内部工具 ======

function sinaCode(symbol: string): string {
  if (symbol.endsWith(".SH")) return "sh" + symbol.replace(".SH", "");
  if (symbol.endsWith(".SZ")) return "sz" + symbol.replace(".SZ", "");
  return symbol.toLowerCase();
}

function parseSinaQuote(symbol: string, text: string): Quote | null {
  const match = text.match(/hq_str_\w+="([^"]+)"/);
  if (!match) return null;
  const parts = match[1].split(",");
  if (parts.length < 10) return null;
  const name = parts[0];
  const open = parseFloat(parts[1]);
  const prevClose = parseFloat(parts[2]);
  const currentPrice = parseFloat(parts[3]);
  const high = parseFloat(parts[4]);
  const low = parseFloat(parts[5]);
  const volume = parseFloat(parts[8]);
  const turnover = parseFloat(parts[9]);
  if (!Number.isFinite(currentPrice)) return null;
  const changeRate = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
  return {
    symbol,
    name,
    currentPrice,
    prevClose,
    open,
    high,
    low,
    changeRate,
    volume,
    turnover,
    updatedAt: new Date().toISOString(),
  };
}

function mockQuote(symbol: string): Quote {
  const info = Object.values(SYMBOL_MAP).find((v) => v.symbol === symbol);
  const name = info?.name || symbol;
  const seed = symbol
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = 50 + (seed % 1500);
  const prevClose = base + ((seed % 21) - 10);
  const currentPrice = prevClose + ((seed % 11) - 5);
  const changeRate = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
  return {
    symbol,
    name,
    currentPrice,
    prevClose,
    open: prevClose,
    high: Math.max(currentPrice, prevClose) + 2,
    low: Math.min(currentPrice, prevClose) - 2,
    changeRate,
    volume: 100000 + (seed % 900000),
    turnover: currentPrice * 100000,
    updatedAt: new Date().toISOString(),
  };
}

function mockKline(symbol: string, _period: KlinePeriod): KlineBar[] {
  const bars: KlineBar[] = [];
  let price = 100;
  const seed = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  for (let i = 60; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    const noise = ((seed + i * 7) % 100) / 100 - 0.5;
    const open = price;
    const close = price * (1 + noise * 0.05);
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    const volume = 100000 + ((seed + i) % 500000);
    bars.push({
      time: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      close: Number(close.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      volume,
    });
    price = close;
  }
  return bars;
}

// 设置数据源（第一版仅占位，后续扩展）
// 当前未读取，但保留 setter 以便后续接入多数据源时使用
export let _dataSource: MarketDataSource | null = null;
export function setDataSource(source: MarketDataSource | null) {
  _dataSource = source;
}
