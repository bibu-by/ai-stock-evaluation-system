// 决策说明页 - 以决策为中心展示 Agent 历史分析
import { useAppStore } from "@/store/appStore";
import { EmptyState } from "@/components/common/EmptyState";
import { DecisionNoteCard } from "@/components/decision/DecisionNoteCard";
import { Lightbulb } from "lucide-react";

export function DecisionNotesPage() {
  const agentRuns = useAppStore((s) => s.agentRuns);

  const decisionRuns = agentRuns
    .filter((r) => r.status === "success" && r.outputJson)
    .sort((a, b) => {
      const ta = new Date(a.finishedAt || a.startedAt).getTime();
      const tb = new Date(b.finishedAt || b.startedAt).getTime();
      return tb - ta;
    });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">决策说明</h1>
        <p className="text-xs text-muted-foreground">
          AI 根据行情变化给出的买卖建议与思考过程
        </p>
      </div>

      {decisionRuns.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-12 w-12" />}
          title="暂无决策记录"
          description="运行 Agent 任务后，AI 的分析会以决策卡片形式出现在这里。"
        />
      ) : (
        <div className="space-y-3">
          {decisionRuns.map((run) => (
            <DecisionNoteCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
