// 顶部模型状态栏
import { Activity, Bot, Clock } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { StatusDot } from "@/components/common/EmptyState";
import { RefreshButton } from "@/components/common/RefreshButton";
import { formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { models, agentJobs, agentRuns } = useAppStore();
  const defaultModel = useAppStore((s) => s.defaultModel());
  const nextJob = agentJobs
    .filter((j) => j.enabled && j.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0];
  const lastRun = agentRuns[0];
  const todayRuns = agentRuns.filter(
    (r) => r.startedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length;

  return (
    <header className="flex h-12 items-center gap-4 border-b border-border bg-card/30 px-4">
      {/* 模型状态 */}
      <div className="flex items-center gap-2">
        <StatusDot color={defaultModel ? "emerald" : "gray"} pulse={!!defaultModel} />
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {defaultModel?.displayName || defaultModel?.modelName || "未配置模型"}
        </span>
        <span className="text-xs text-muted-foreground">
          {defaultModel?.providerLabel}
        </span>
      </div>

      <span className="text-xs text-muted-foreground">|</span>

      {/* 行情 API 状态 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        <span>行情 API 在线</span>
      </div>

      <span className="text-xs text-muted-foreground">|</span>

      {/* Agent 状态 */}
      <div className="flex items-center gap-2 text-xs">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">今日执行</span>
        <span className="font-medium">{todayRuns}</span>
        <span className="text-muted-foreground">次</span>
      </div>

      <span className="text-xs text-muted-foreground">|</span>

      {/* 下次运行 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>下次巡检</span>
        <span className={cn("font-medium", nextJob ? "text-foreground" : "text-muted-foreground")}>
          {nextJob ? formatTime(nextJob.nextRunAt!) : "无任务"}
        </span>
        {nextJob && (
          <span className="text-muted-foreground">（{nextJob.name}）</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {lastRun && (
          <span className="text-xs text-muted-foreground">
            上次执行 {formatRelative(lastRun.startedAt)}
          </span>
        )}
        <RefreshButton size="sm" />
      </div>

      <span className="sr-only">{models.length}</span>
    </header>
  );
}
