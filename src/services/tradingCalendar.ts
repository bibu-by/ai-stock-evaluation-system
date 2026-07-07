// A 股交易日历工具
// 仅判断周末 + 交易时段，不含节假日表（节假日当天行情接口返回上一交易日收盘价，影响有限）

import { TRADING_HOURS } from "@/domain/config";

// 判断是否为交易日（周一至周五）
export function isTradingDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0=周日, 6=周六
}

// 判断当前是否在 A 股交易时段（9:30-11:30, 13:00-15:00）
export function isWithinTradingHours(date: Date = new Date()): boolean {
  if (!isTradingDay(date)) return false;
  const hh = date.getHours();
  const mm = date.getMinutes();
  const minutes = hh * 60 + mm;
  return TRADING_HOURS.some((h) => {
    const [sh, sm] = h.start.split(":").map(Number);
    const [eh, em] = h.end.split(":").map(Number);
    return minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
  });
}

// 把任意时间对齐到"下一个交易时段开始"
// 用于 calculateNextRunAt：如果下次执行时间落在非交易时段，跳到下一个 9:30 或 13:00
export function alignToNextTradingSession(date: Date): Date {
  const d = new Date(date);
  // 循环最多 8 次，覆盖"周五 16:00 → 周一 9:30"等跨天场景，避免死循环
  for (let i = 0; i < 8; i++) {
    const day = d.getDay();
    // 周末：跳到下周一 9:30
    if (day === 6) {
      d.setDate(d.getDate() + 2);
      d.setHours(9, 30, 0, 0);
      continue;
    }
    if (day === 0) {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 30, 0, 0);
      continue;
    }
    const minutes = d.getHours() * 60 + d.getMinutes();
    // 早于 9:30 → 对齐到 9:30
    if (minutes < 9 * 60 + 30) {
      d.setHours(9, 30, 0, 0);
      return d;
    }
    // 11:30-13:00 → 对齐到 13:00
    if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) {
      d.setHours(13, 0, 0, 0);
      return d;
    }
    // 15:00 之后 → 跳到下一个交易日 9:30
    if (minutes >= 15 * 60) {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 30, 0, 0);
      continue; // 继续循环检查明天是否周末
    }
    // 在交易时段内
    return d;
  }
  return d;
}
