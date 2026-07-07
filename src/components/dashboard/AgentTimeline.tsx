// Agent 时间线
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, ChevronRight } from "lucide-react";
import type { AgentRun } from "@/domain/agent";
import { AGENT_RUN_STATUS_LABEL, AGENT_RUN_STATUS_COLOR } from "@/domain/agent";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AgentTimelineProps {
  runs: AgentRun[];
  limit?: number;
  onSelect?: (run: AgentRun) => void;
}

export function AgentTimeline({ runs, limit = 8, onSelect }: AgentTimelineProps) {
  const items = runs.slice(0, limit);
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center text-xs text-muted-foreground">
        暂无 Agent 执行记录
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((run) => (
        <Card
          key={run.id}
          className="cursor-pointer p-3 transition-colors hover:border-primary/40"
          onClick={() => onSelect?.(run)}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-400">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{run.jobName}</span>
                <Badge
                  className={cn("text-[10px]", AGENT_RUN_STATUS_COLOR[run.status])}
                >
                  {AGENT_RUN_STATUS_LABEL[run.status]}
                </Badge>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {formatRelative(run.startedAt)}
              </div>
              {run.outputSummary && (
                <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {run.outputSummary}
                </div>
              )}
              {run.errorMessage && (
                <div className="mt-2 text-xs text-destructive">
                  {run.errorMessage}
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Card>
      ))}
    </div>
  );
}
