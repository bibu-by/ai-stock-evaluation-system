// 数值与时间格式化工具

/**
 * 格式化金额（默认人民币）
 */
export function formatMoney(value: number, currency = "CNY"): string {
  if (!Number.isFinite(value)) return "--";
  const symbol = currency === "USD" ? "$" : currency === "HKD" ? "HK$" : "¥";
  return `${symbol}${formatNumber(Math.abs(value), 2)}${value < 0 ? "" : ""}`;
}

/**
 * 数字格式化（千分位 + 指定小数位）
 */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 百分比格式化
 */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * 涨跌幅颜色
 */
export function pnlColor(value: number): string {
  if (value > 0) return "text-red-400"; // A股：红涨
  if (value < 0) return "text-emerald-400"; // A股：绿跌
  return "text-muted-foreground";
}

/**
 * 时间格式化
 */
export function formatTime(iso: string, withSeconds = false): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (withSeconds) {
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

/**
 * 日期格式化
 */
export function formatDate(iso: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 日期时间格式化
 */
export function formatDateTime(iso: string): string {
  if (!iso) return "--";
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/**
 * 相对时间（"3分钟前"）
 */
export function formatRelative(iso: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}天前`;
  return formatDate(iso);
}

/**
 * 股票代码格式化展示
 */
export function formatSymbol(symbol: string): string {
  if (!symbol) return "--";
  return symbol;
}

/**
 * 掩码 API Key，只显示后 4 位
 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "*".repeat(key.length);
  return "*".repeat(key.length - 4) + key.slice(-4);
}
