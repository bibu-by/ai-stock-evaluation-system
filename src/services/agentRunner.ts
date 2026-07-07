// Agent Runner - 定时任务执行引擎
// 在前端运行（应用打开时），按 AgentJob 配置触发分析。

import type { AgentJob, AgentRun } from "@/domain/agent";
import type { Account } from "@/domain/account";
import type { Position } from "@/domain/position";
import type { Memory } from "@/domain/memory";
import type { ChatMessage } from "@/domain/chat";
import type { AiModelConfig } from "@/domain/ai";
import { uid, nowIso } from "@/lib/utils";
import { runAgentAnalysis, type AgentAnalysisOutput } from "./aiGateway";
import { getBatchQuotes } from "./marketData";
import { isWithinTradingHours, alignToNextTradingSession } from "./tradingCalendar";

export interface AgentRunContext {
  account: Account | null;
  positions: Position[];
  memories: Memory[];
  model: AiModelConfig | null;
  onMessage: (msg: ChatMessage) => void;
  onRunUpdate: (run: AgentRun) => void;
}

// 执行单个 Agent 任务
export async function runAgentJob(
  job: AgentJob,
  ctx: AgentRunContext
): Promise<AgentRun> {
  const run: AgentRun = {
    id: uid("run"),
    jobId: job.id,
    jobName: job.name,
    status: "running",
    startedAt: nowIso(),
    createdAt: nowIso(),
  };
  ctx.onRunUpdate({ ...run });

  try {
    if (!ctx.model) {
      throw new Error("未配置 AI 模型，请先在模型设置中添加 API Key。");
    }

    // 1. 刷新持仓行情
    let positions = ctx.positions;
    if (positions.length > 0) {
      const quotes = await getBatchQuotes(positions.map((p) => p.symbol));
      positions = positions.map((p) => {
        const q = quotes[p.symbol];
        if (!q) return p;
        const marketValue = q.currentPrice * p.quantity;
        const unrealizedPnl = (q.currentPrice - p.avgCost) * p.quantity;
        const unrealizedPnlRate =
          p.avgCost > 0 ? ((q.currentPrice - p.avgCost) / p.avgCost) * 100 : 0;
        return {
          ...p,
          currentPrice: q.currentPrice,
          todayChangeRate: q.changeRate,
          marketValue,
          unrealizedPnl,
          unrealizedPnlRate,
          updatedAt: nowIso(),
        };
      });
    }

    // 2. 拼装上下文
    const accountSummary = ctx.account
      ? `累计投入本金：${ctx.account.cumulativePrincipal}，现金：${ctx.account.cashBalance}`
      : "未设置账户";
    const positionsText =
      positions
        .map(
          (p) =>
            `${p.name}(${p.symbol}) 持仓${p.quantity}股 成本${p.avgCost} 现价${p.currentPrice} 浮盈${p.unrealizedPnl.toFixed(2)} 收益率${p.unrealizedPnlRate.toFixed(2)}%`
        )
        .join("\n") || "无持仓";
    const marketData = positions
      .map((p) => `${p.name}: 现价${p.currentPrice} 今日${p.todayChangeRate?.toFixed(2) || 0}%`)
      .join("\n");
    const prefs = ctx.memories
      .filter((m) => m.type === "preference" || m.type === "rule")
      .map((m) => `${m.title}: ${m.content}`)
      .join("\n");
    const recentAgentNotes = ctx.memories
      .filter((m) => m.type === "agent_note")
      .slice(-5)
      .map((m) => `${m.title}: ${m.content}`)
      .join("\n");

    // 3. 调用 AI 分析
    const output: AgentAnalysisOutput = await runAgentAnalysis(ctx.model, {
      accountSummary,
      positions: positionsText,
      marketData,
      userPreferences: prefs,
      recentAgentMemories: recentAgentNotes,
    });

    // 4. 写入聊天消息
    const agentMessage: ChatMessage = {
      id: uid("msg"),
      role: "agent",
      type: "agent_run",
      content: output.rawMarkdown,
      createdAt: nowIso(),
      metadata: {
        agentRunId: run.id,
      },
    };
    ctx.onMessage(agentMessage);

    // 5. 更新 run
    run.status = "success";
    run.finishedAt = nowIso();
    run.outputSummary = output.suggestion;
    run.outputJson = output as unknown as Record<string, unknown>;
    ctx.onRunUpdate({ ...run });
    return run;
  } catch (e) {
    run.status = "failed";
    run.finishedAt = nowIso();
    run.errorMessage = (e as Error).message;
    ctx.onRunUpdate({ ...run });

    // 错误消息也写入聊天
    ctx.onMessage({
      id: uid("msg"),
      role: "system",
      type: "error",
      content: `Agent 任务「${job.name}」执行失败：${(e as Error).message}`,
      createdAt: nowIso(),
      metadata: {
        agentJobId: job.id,
      },
    });
    return run;
  }
}

// 计算下次执行时间
export function calculateNextRunAt(job: AgentJob): string | undefined {
  const now = new Date();
  if (!job.enabled) return undefined;

  if (job.triggerType === "interval" && job.intervalMinutes) {
    let next = new Date(now.getTime() + job.intervalMinutes * 60_000);
    // 仅交易时段任务：如果下次时间落在非交易时段，对齐到下一个交易时段开始
    if (job.tradingHoursOnly) {
      next = alignToNextTradingSession(next);
    }
    return next.toISOString();
  }
  if (job.triggerType === "fixed_time" && job.fixedTimes?.length) {
    // 找到下一个最近的固定时间
    const candidates = job.fixedTimes
      .map((t) => {
        const [h, m] = t.split(":").map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
        // 仅交易时段任务：如果该时间落在周末/非交易时段，跳到下一个交易日同一时间
        if (job.tradingHoursOnly) {
          return alignToNextTradingSession(d);
        }
        return d;
      })
      .sort((a, b) => a.getTime() - b.getTime());
    return candidates[0]?.toISOString();
  }
  return undefined;
}

// 判断是否到期
export function isJobDue(job: AgentJob, now = new Date()): boolean {
  if (!job.enabled || !job.nextRunAt) return false;
  // 时间未到
  if (new Date(job.nextRunAt).getTime() > now.getTime()) return false;
  // 已到期，但如果 tradingHoursOnly=true，还要求当前在交易时段（周末/非交易时段不触发）
  if (job.tradingHoursOnly && !isWithinTradingHours(now)) {
    return false;
  }
  return true;
}
