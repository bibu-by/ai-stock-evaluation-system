// 决策卡片 - 三段式展示 AI 思考过程
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/common/Markdown";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentRun, SuggestionType } from "@/domain/agent";
import { SUGGESTION_TYPE_TO_DECISION } from "@/domain/agent";
import type { AgentAnalysisOutput } from "@/services/aiGateway";
import { Lightbulb, TrendingUp, AlertTriangle, Target } from "lucide-react";

interface Props {
  run: AgentRun;
}

export function DecisionNoteCard({ run }: Props) {
  const output = run.outputJson as unknown as AgentAnalysisOutput | undefined;
  if (!output) return null;

  const suggestionType = (output.suggestionType || "continue_watch") as SuggestionType;
  const decision = SUGGESTION_TYPE_TO_DECISION[suggestionType] || SUGGESTION_TYPE_TO_DECISION.continue_watch;
  const time = run.finishedAt || run.startedAt;
  const confidence = typeof output.confidence === "number" ? output.confidence : 0.5;
  const essayText = [output.marketOverview, output.positionChanges].filter(Boolean).join("\n\n");

  return (
    <Card className="overflow-hidden p-0">
      {/* 顶部：决策方向 + 时间 + 置信度 */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <Lightbulb className="h-3.5 w-3.5" />
          </div>
          <Badge className={cn("text-[10px]", decision.color)}>
            {decision.label}
          </Badge>
          <span className="text-xs font-medium text-foreground">{run.jobName}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          总结时间：{formatDateTime(time)}
        </div>
      </div>

      {/* 中部：决策说明（AI 小作文） */}
      {essayText && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            决策说明
          </div>
          <Markdown content={essayText} className="text-xs text-muted-foreground" />
        </div>
      )}

      {/* 底部：理由 */}
      <div className="space-y-2 px-4 py-3">
        {output.opportunities && output.opportunities.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
              <Target className="h-3 w-3" />
              机会
            </div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {output.opportunities.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        {output.risks && output.risks.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              风险
            </div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {output.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {output.suggestion && (
          <div>
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">结论</div>
            <p className="text-xs text-foreground">{output.suggestion}</p>
          </div>
        )}
        {/* 置信度条 */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground">置信度</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full",
                confidence >= 0.7 ? "bg-emerald-500" : confidence >= 0.4 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{Math.round(confidence * 100)}%</span>
        </div>
      </div>
    </Card>
  );
}
