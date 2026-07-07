import { describe, it, expect } from "vitest";
import {
  isTradingDay,
  isWithinTradingHours,
  alignToNextTradingSession,
} from "../tradingCalendar";

describe("isTradingDay", () => {
  it("周六返回 false", () => {
    const sat = new Date(2026, 6, 4); // 2026-07-04 周六
    expect(isTradingDay(sat)).toBe(false);
  });

  it("周日返回 false", () => {
    const sun = new Date(2026, 6, 5); // 2026-07-05 周日
    expect(isTradingDay(sun)).toBe(false);
  });

  it("周一返回 true", () => {
    const mon = new Date(2026, 6, 6); // 2026-07-06 周一
    expect(isTradingDay(mon)).toBe(true);
  });
});

describe("isWithinTradingHours", () => {
  it("周末 10:00 返回 false", () => {
    const sat = new Date(2026, 6, 4, 10, 0);
    expect(isWithinTradingHours(sat)).toBe(false);
  });

  it("交易日 9:30 返回 true", () => {
    const mon = new Date(2026, 6, 6, 9, 30);
    expect(isWithinTradingHours(mon)).toBe(true);
  });

  it("交易日 11:30 返回 true（边界包含）", () => {
    const mon = new Date(2026, 6, 6, 11, 30);
    expect(isWithinTradingHours(mon)).toBe(true);
  });

  it("交易日 12:00 返回 false（午间休市）", () => {
    const mon = new Date(2026, 6, 6, 12, 0);
    expect(isWithinTradingHours(mon)).toBe(false);
  });

  it("交易日 13:00 返回 true", () => {
    const mon = new Date(2026, 6, 6, 13, 0);
    expect(isWithinTradingHours(mon)).toBe(true);
  });

  it("交易日 15:00 返回 true（边界包含）", () => {
    const mon = new Date(2026, 6, 6, 15, 0);
    expect(isWithinTradingHours(mon)).toBe(true);
  });

  it("交易日 15:01 返回 false（已收盘）", () => {
    const mon = new Date(2026, 6, 6, 15, 1);
    expect(isWithinTradingHours(mon)).toBe(false);
  });
});

describe("alignToNextTradingSession", () => {
  it("早于 9:30 对齐到当日 9:30", () => {
    const mon = new Date(2026, 6, 6, 8, 0);
    const aligned = alignToNextTradingSession(mon);
    expect(aligned.getHours()).toBe(9);
    expect(aligned.getMinutes()).toBe(30);
    expect(aligned.getDay()).toBe(1);
  });

  it("11:30-13:00 对齐到当日 13:00", () => {
    const mon = new Date(2026, 6, 6, 12, 0);
    const aligned = alignToNextTradingSession(mon);
    expect(aligned.getHours()).toBe(13);
    expect(aligned.getMinutes()).toBe(0);
  });

  it("15:00 之后跳到下一个交易日 9:30", () => {
    const fri = new Date(2026, 6, 3, 16, 0); // 周五 16:00
    const aligned = alignToNextTradingSession(fri);
    expect(aligned.getDay()).toBe(1); // 周一
    expect(aligned.getHours()).toBe(9);
    expect(aligned.getMinutes()).toBe(30);
  });

  it("周六跳到下周一 9:30", () => {
    const sat = new Date(2026, 6, 4, 10, 0);
    const aligned = alignToNextTradingSession(sat);
    expect(aligned.getDay()).toBe(1);
    expect(aligned.getHours()).toBe(9);
    expect(aligned.getMinutes()).toBe(30);
  });
});
