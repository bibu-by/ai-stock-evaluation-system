// Agent 状态条
import { Card } from "@/components/ui/card";
import { Bot, Clock, Activity } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { formatTime } from "@/lib/format";

export function AgentStatusBar() {
  const { agentJobs, agentRuns } = useAppStore();
  const enabledJobs = agentJobs.filter((j) => j.enabled);
  const nextJob = enabledJobs
    .filter((j) => j.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0];
  const lastRun = agentRuns[0];
  const today = new Date().toISOString().slice(0, 10);
  const todayRuns = agentRuns.filter(
    (r) => r.startedAt.slice(0, 10) === today
  ).length;

  return (
    <Card className="flex items-center gap-6 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 text-purple-400">
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">启用任务</div>
          <div className="text-sm font-semibold">{enabledJobs.length} 个</div>
        </div>
      </div>

      <div className="h-8 w-px bg-border" />

      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-emerald-400" />
        <div>
          <div className="text-xs text-muted-foreground">今日执行</div>
          <div className="text-sm font-semibold">{todayRuns} 次</div>
        </div>
      </div>

      <div className="h-8 w-px bg-border" />

      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-400" />
        <div>
          <div className="text-xs text-muted-foreground">下次巡检</div>
          <div className="text-sm font-semibold">
            {nextJob ? formatTime(nextJob.nextRunAt!) : "无"}
          </div>
        </div>
      </div>

      {nextJob && (
        <div className="ml-auto text-xs text-muted-foreground">
          {nextJob.name}
        </div>
      )}

      {lastRun && (
        <div className="ml-auto text-xs text-muted-foreground">
          上次：{new Date(lastRun.startedAt).toLocaleTimeString("zh-CN", { hour12: false })}
        </div>
      )}
    </Card>
  );
}
