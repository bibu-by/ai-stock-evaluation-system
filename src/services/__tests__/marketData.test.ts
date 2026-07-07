import { describe, it, expect } from "vitest";
import { inferMarketByCode, matchSymbolByName } from "../marketData";

describe("inferMarketByCode", () => {
  it("空字符串返回 null", () => {
    expect(inferMarketByCode("")).toBeNull();
  });

  it("6 开头 → SH（沪市）", () => {
    expect(inferMarketByCode("600519")).toEqual({ symbol: "600519.SH", market: "A_SHARE" });
  });

  it("688 开头 → SH（科创板）", () => {
    expect(inferMarketByCode("688981")).toEqual({ symbol: "688981.SH", market: "A_SHARE" });
  });

  it("0 开头 → SZ（深市主板）", () => {
    expect(inferMarketByCode("000001")).toEqual({ symbol: "000001.SZ", market: "A_SHARE" });
  });

  it("3 开头 → SZ（创业板）", () => {
    expect(inferMarketByCode("300750")).toEqual({ symbol: "300750.SZ", market: "A_SHARE" });
  });

  it("8 开头 → BJ（北交所）", () => {
    expect(inferMarketByCode("830799")).toEqual({ symbol: "830799.BJ", market: "A_SHARE" });
  });

  it("4 开头 → BJ（北交所/老三板）", () => {
    expect(inferMarketByCode("430047")).toEqual({ symbol: "430047.BJ", market: "A_SHARE" });
  });

  it("5 位纯数字 → HK（港股）", () => {
    expect(inferMarketByCode("00700")).toEqual({ symbol: "00700.HK", market: "HK" });
  });

  it("纯字母 1-5 位 → US（美股）", () => {
    expect(inferMarketByCode("AAPL")).toEqual({ symbol: "AAPL.US", market: "US" });
  });

  it("6 位但非 A 股前缀（如 5 开头）返回 null", () => {
    expect(inferMarketByCode("500000")).toBeNull();
  });

  it("混合字符返回 null", () => {
    expect(inferMarketByCode("600519.SH")).toBeNull();
  });
});

describe("matchSymbolByName", () => {
  it("硬编码名称命中（贵州茅台）", () => {
    const r = matchSymbolByName("贵州茅台");
    expect(r).not.toBeNull();
    expect(r?.symbol).toBe("600519.SH");
  });

  it("硬编码失败时按代码推断（工商银行 601398）", () => {
    const r = matchSymbolByName("601398");
    expect(r).toEqual({ symbol: "601398.SH", name: "601398.SH", market: "A_SHARE" });
  });

  it("空字符串返回 null", () => {
    expect(matchSymbolByName("")).toBeNull();
  });
});
