// Agent 域 Slice
// 管理 agentJobs / agentRuns 及其增删改 / 立即运行。
// runJobNow 跨域依赖 account/positions/memories/defaultModel/addMessage/updateAgentRun，
// 通过 get() 访问完整 AppState。

import type { StateCreator } from "zustand";
import type { AppState, AgentsSlice } from "../types";
import type { AgentJob } from "@/domain/agent";
import { saveAgentJobs, saveAgentRuns } from "@/services/localStore";
import { uid, nowIso } from "@/lib/utils";
import { runAgentJob, calculateNextRunAt } from "@/services/agentRunner";

export const createAgentsSlice: StateCreator<AppState, [], [], AgentsSlice> = (set, get) => ({
  agentJobs: [],
  agentRuns: [],

  async addAgentJob(job) {
    const list = get().agentJobs.slice();
    const newJob: AgentJob = {
      ...job,
      id: uid("job"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      nextRunAt: job.enabled ? calculateNextRunAt(job as AgentJob) : undefined,
    };
    list.push(newJob);
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async updateAgentJob(id, patch) {
    const list = get().agentJobs.map((j) => {
      if (j.id !== id) return j;
      const next: AgentJob = { ...j, ...patch, updatedAt: nowIso() };
      // 重新计算下次运行时间
      if (patch.enabled !== undefined || patch.triggerType || patch.intervalMinutes || patch.fixedTimes) {
        next.nextRunAt = next.enabled ? calculateNextRunAt(next) : undefined;
      }
      return next;
    });
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async removeAgentJob(id) {
    const list = get().agentJobs.filter((j) => j.id !== id);
    await saveAgentJobs(list);
    set({ agentJobs: list });
  },

  async runJobNow(jobId) {
    const job = get().agentJobs.find((j) => j.id === jobId);
    if (!job) return;
    const model = get().defaultModel();
    await runAgentJob(job, {
      account: get().account,
      positions: get().positions,
      memories: get().memories,
      model,
      models: get().models,
      onMessage: (msg) => {
        void get().addMessage(msg);
      },
      onRunUpdate: (run) => {
        void get().updateAgentRun(run);
      },
    });
    // 更新 job 的 nextRunAt
    await get().updateAgentJob(jobId, {
      lastRunAt: nowIso(),
      nextRunAt: job.enabled ? calculateNextRunAt(job) : undefined,
    });
  },

  async addAgentRun(run) {
    const list = get().agentRuns.slice();
    list.unshift(run);
    await saveAgentRuns(list);
    set({ agentRuns: list });
  },

  async updateAgentRun(run) {
    let list = get().agentRuns.slice();
    const idx = list.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      list[idx] = run;
    } else {
      list.unshift(run);
    }
    await saveAgentRuns(list);
    set({ agentRuns: list });
  },
});
