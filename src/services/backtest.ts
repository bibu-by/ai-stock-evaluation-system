// 回测数据管道服务（Task 11：5-3 回测接口预留）
//
// 第一版只做"数据管道"：导出 OHLCV CSV 供 backtrader / qlib 等外部框架消费。
// 不实现完整回测引擎，仅预留接口与数据导出能力。

import { getKline } from "./marketData";
import { isTauri } from "@/lib/utils";
import type { OhlcvRow } from "@/domain/backtest";

// CSV 字段转义：含逗号、换行、双引号时按 RFC 4180 包裹并转义双引号
function escapeCsv(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 导出单只股票的 OHLCV CSV
export async function exportOhlcvCsv(
  symbol: string,
  count: number = 250
): Promise<string> {
  const bars = await getKline(symbol, "1d", count);
  const rows: OhlcvRow[] = bars.map(b => ({
    date: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  // CSV 表头 + 行
  const header = "date,open,high,low,close,volume";
  const lines = rows.map(r =>
    [r.date, r.open, r.high, r.low, r.close, r.volume].map(escapeCsv).join(",")
  );
  return [header, ...lines].join("\n");
}

// 导出多只股票的 OHLCV（打包为对象，key 为 symbol）
export async function exportMultiOhlcv(
  symbols: string[],
  count: number = 250
): Promise<Record<string, OhlcvRow[]>> {
  const result: Record<string, OhlcvRow[]> = {};
  for (const symbol of symbols) {
    try {
      const bars = await getKline(symbol, "1d", count);
      result[symbol] = bars.map(b => ({
        date: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
    } catch (e) {
      console.warn(`[backtest] 导出 ${symbol} OHLCV 失败`, e);
    }
  }
  return result;
}

// 保存 CSV 到文件（通过 Tauri save 对话框）
export async function saveOhlcvCsvFile(
  symbol: string,
  csvContent: string
): Promise<string | null> {
  // 浏览器环境降级（无 Tauri save 对话框）
  if (!isTauri()) {
    console.warn("[backtest] 浏览器环境不支持保存文件，请在 Tauri 应用中使用");
    return null;
  }
  try {
    // @ts-ignore - Tauri v1
    const { save } = await import("@tauri-apps/api/dialog");
    // @ts-ignore - Tauri v1
    const { writeTextFile } = await import("@tauri-apps/api/fs");
    const filePath = await save({
      defaultPath: `${symbol}_ohlcv.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!filePath) return null;
    await writeTextFile(filePath, csvContent);
    return filePath;
  } catch (e) {
    console.error("[backtest] 保存 CSV 文件失败", e);
    throw e;
  }
}
