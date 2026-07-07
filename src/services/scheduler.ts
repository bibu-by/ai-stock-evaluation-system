// 调度器 - 前端定时轮询 AgentJob
// 第一阶段（v0.1）：应用窗口打开时由 React setInterval 轮询 AgentJob。
// 正式桌面方案（v0.2+）：Tauri 主进程启动 Scheduler，到点执行后通过事件推送给 React UI。

import type { AgentJob } from "@/domain/agent";
import { isJobDue, calculateNextRunAt } from "./agentRunner";
import { AGENT_SCHEDULER_INTERVAL_MS } from "@/domain/constants";

type RunCallback = (job: AgentJob) => Promise<void> | void;

export class AgentScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private jobs: AgentJob[] = [];
  private onRun: RunCallback;
  private intervalMs = AGENT_SCHEDULER_INTERVAL_MS;
  // 正在执行的 jobId 集合，防止同一 job 并发触发
  private runningJobIds = new Set<string>();

  constructor(onRun: RunCallback) {
    this.onRun = onRun;
  }

  setJobs(jobs: AgentJob[]) {
    this.jobs = jobs;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // 启动时立即 tick 一次
    this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    const now = new Date();
    for (const job of this.jobs) {
      if (!isJobDue(job, now)) continue;
      // 防止同一 job 并发执行
      if (this.runningJobIds.has(job.id)) continue;
      this.runningJobIds.add(job.id);
      // 异步执行，完成后移除标记（不阻塞 tick）
      try {
        Promise.resolve(this.onRun(job)).finally(() => {
          this.runningJobIds.delete(job.id);
        });
      } catch {
        // onRun 同步抛出时也需清理
        this.runningJobIds.delete(job.id);
      }
    }
  }
}

export { calculateNextRunAt };
