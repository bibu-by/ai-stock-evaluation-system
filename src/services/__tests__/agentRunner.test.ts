import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup";

// 拦截 aiGateway.runAgentAnalysis（agentRunner 唯一的 AI 依赖）
vi.mock("@/services/aiGateway", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/aiGateway")>();
  return {
    ...actual,
    runAgentAnalysis: vi.fn(),
  };
});

// 拦截 marketData.getBatchQuotes / getKline（行情接口）
vi.mock("@/services/marketData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/marketData")>();
  return {
    ...actual,
    getBatchQuotes: vi.fn(),
    getKline: vi.fn(),
  };
});

import { runAgentJob, type AgentRunContext } from "../agentRunner";
import { runAgentAnalysis, type AgentAnalysisOutput } from "../aiGateway";
import { getBatchQuotes, getKline } from "../marketData";
import type { AgentJob } from "@/domain/agent";
import type { Account } from "@/domain/account";
import type { Position, Quote } from "@/domain/position";
import type { AiModelConfig } from "@/domain/ai";
import type { ChatMessage } from "@/domain/chat";

function makeJob(over: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "job_1",
    name: "持仓巡检",
    enabled: true,
    triggerType: "interval",
    intervalMinutes: 30,
    scope: "all_positions",
    tradingHoursOnly: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: "acc_1",
    name: "默认账户",
    cumulativePrincipal: 100000,
    cashBalance: 50000,
    currency: "CNY",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makePosition(over: Partial<Position> = {}): Position {
  return {
    id: "pos_1",
    symbol: "600519.SH",
    name: "贵州茅台",
    market: "A_SHARE",
    quantity: 100,
    avgCost: 1500,
    currentPrice: 1500,
    marketValue: 150000,
    unrealizedPnl: 0,
    unrealizedPnlRate: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeModel(over: Partial<AiModelConfig> = {}): AiModelConfig {
  return {
    id: "m1",
    provider: "openai",
    providerLabel: "OpenAI",
    modelName: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    isEnabled: true,
    isDefault: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

function makeCtx(over: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    account: makeAccount(),
    positions: [makePosition()],
    memories: [],
    model: makeModel(),
    onMessage: vi.fn(),
    onRunUpdate: vi.fn(),
    ...over,
  };
}

function makeAnalysisOutput(
  over: Partial<AgentAnalysisOutput> = {}
): AgentAnalysisOutput {
  return {
    marketOverview: "市场震荡",
    positionChanges: "无变化",
    risks: ["注意流动性"],
    opportunities: [],
    suggestionType: "continue_watch",
    suggestion: "建议继续观察",
    confidence: 0.6,
    needUserConfirm: false,
    rawMarkdown: "# 巡检报告\n市场震荡，建议继续观察。",
    ...over,
  };
}

describe("runAgentJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ctx.model 为 null 时返回 failed run，并写入错误消息", async () => {
    const ctx = makeCtx({ model: null });
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("failed");
    expect(run.errorMessage).toContain("未配置 AI 模型");
    expect(run.finishedAt).toBeTruthy();
    // onRunUpdate 至少调用两次：running + failed
    expect(ctx.onRunUpdate).toHaveBeenCalledTimes(2);
    // onMessage 收到 system error 消息
    expect(ctx.onMessage).toHaveBeenCalledTimes(1);
    const msg = (ctx.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as ChatMessage;
    expect(msg.role).toBe("system");
    expect(msg.type).toBe("error");
    expect(msg.content).toContain("持仓巡检");
    // 不应调用 AI / 行情
    expect(runAgentAnalysis).not.toHaveBeenCalled();
    expect(getBatchQuotes).not.toHaveBeenCalled();
  });

  it("positions 为空时降级上下文，不调用 getBatchQuotes，仍调用 AI", async () => {
    vi.mocked(runAgentAnalysis).mockResolvedValue(makeAnalysisOutput());
    const ctx = makeCtx({ positions: [] });
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("success");
    expect(getBatchQuotes).not.toHaveBeenCalled();
    expect(runAgentAnalysis).toHaveBeenCalledTimes(1);
    // 传入 AI 的 positions 文本应是 "无持仓"
    const callArgs = vi.mocked(runAgentAnalysis).mock.calls[0][1];
    expect(callArgs.positions).toBe("无持仓");
  });

  it("positions 有数据时调用 getBatchQuotes 刷新行情，AI 收到刷新后的价格", async () => {
    const quote: Quote = {
      symbol: "600519.SH",
      name: "贵州茅台",
      currentPrice: 1600,
      prevClose: 1550,
      open: 1560,
      high: 1610,
      low: 1555,
      changeRate: 3.23,
      volume: 1000000,
      turnover: 1600000000,
      updatedAt: "2026-07-09T00:00:00.000Z",
    };
    vi.mocked(getBatchQuotes).mockResolvedValue({ "600519.SH": quote });
    vi.mocked(getKline).mockResolvedValue([]);
    vi.mocked(runAgentAnalysis).mockResolvedValue(makeAnalysisOutput());
    const ctx = makeCtx({
      positions: [makePosition({ currentPrice: 1500 })],
    });
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("success");
    expect(getBatchQuotes).toHaveBeenCalledWith(["600519.SH"]);
    const callArgs = vi.mocked(runAgentAnalysis).mock.calls[0][1];
    // positions 文本应包含刷新后的现价 1600
    expect(callArgs.positions).toContain("1600");
  });

  it("runAgentAnalysis 抛错时 run 标记为 failed，不崩", async () => {
    vi.mocked(getBatchQuotes).mockResolvedValue({});
    vi.mocked(getKline).mockResolvedValue([]);
    vi.mocked(runAgentAnalysis).mockRejectedValue(new Error("AI 接口超时"));
    const ctx = makeCtx();
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("failed");
    expect(run.errorMessage).toContain("AI 接口超时");
    // 错误也应写入聊天
    expect(ctx.onMessage).toHaveBeenCalledTimes(1);
    const msg = (ctx.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as ChatMessage;
    expect(msg.type).toBe("error");
  });

  it("getKline 抛错时降级为空 K 线上下文，主流程仍成功", async () => {
    vi.mocked(getBatchQuotes).mockResolvedValue({});
    vi.mocked(getKline).mockRejectedValue(new Error("kline 接口不可用"));
    vi.mocked(runAgentAnalysis).mockResolvedValue(makeAnalysisOutput());
    const ctx = makeCtx();
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("success");
    const callArgs = vi.mocked(runAgentAnalysis).mock.calls[0][1];
    // K 线摘要应降级为占位文本
    expect(callArgs.klineSummary).toContain("K 线");
  });

  it("成功路径：写入 agent 聊天消息，run.outputSummary = suggestion", async () => {
    vi.mocked(getBatchQuotes).mockResolvedValue({});
    vi.mocked(getKline).mockResolvedValue([]);
    const output = makeAnalysisOutput({ suggestion: "建议减仓" });
    vi.mocked(runAgentAnalysis).mockResolvedValue(output);
    const ctx = makeCtx();
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("success");
    expect(run.outputSummary).toBe("建议减仓");
    expect(run.outputJson).toBeDefined();
    // onMessage 被调用一次（agent 巡检消息）
    expect(ctx.onMessage).toHaveBeenCalledTimes(1);
    const msg = (ctx.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as ChatMessage;
    expect(msg.role).toBe("agent");
    expect(msg.type).toBe("agent_run");
    expect(msg.content).toContain("巡检报告");
    expect(msg.metadata?.agentRunId).toBe(run.id);
  });

  it("account 为 null 时降级为 '未设置账户' 上下文，不崩", async () => {
    vi.mocked(getBatchQuotes).mockResolvedValue({});
    vi.mocked(getKline).mockResolvedValue([]);
    vi.mocked(runAgentAnalysis).mockResolvedValue(makeAnalysisOutput());
    const ctx = makeCtx({ account: null, positions: [] });
    const run = await runAgentJob(makeJob(), ctx);
    expect(run.status).toBe("success");
    const callArgs = vi.mocked(runAgentAnalysis).mock.calls[0][1];
    expect(callArgs.accountSummary).toBe("未设置账户");
  });
});

describe("calculateNextRunAt", () => {
  it("can be imported and is a function", async () => {
    const { calculateNextRunAt } = await import("../agentRunner");
    expect(typeof calculateNextRunAt).toBe("function");
  });
});
