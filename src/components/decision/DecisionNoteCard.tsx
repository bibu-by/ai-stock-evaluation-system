// 决策卡片 - 展示 Agent 巡检完整报告（决策方向 + 报告正文 + 五维图 + K线 + 机会/风险 + 结论）
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/common/Markdown";
import { MiniKlineChartWrapper } from "@/components/common/MiniKlineChart";
import { DimensionBadges } from "@/components/common/DimensionBadges";
import { DimensionRadarChart } from "@/components/common/DimensionRadarChart";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentRun, SuggestionType, AnalysisDimensions } from "@/domain/agent";
import { SUGGESTION_TYPE_TO_DECISION } from "@/domain/agent";
import type { AgentAnalysisOutput } from "@/services/aiGateway";
import { Lightbulb, TrendingUp, AlertTriangle, Target } from "lucide-react";

interface Props {
  run: AgentRun;
}

// 股票代码匹配（如 600519.SH / 000001.SZ / 830799.BJ），用于从报告中提取代码渲染 K 线图
const STOCK_CODE_REGEX = /\b(\d{6}\.(?:SH|SZ|BJ))\b/g;

// AI 可能返回 string[] 或对象数组（含 {opportunityType/riskType, description}），
// 这里统一归一化为可渲染字符串，避免把对象直接作为 React 子节点导致黑屏。
function normalizeTextItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    const desc = typeof obj.description === "string" ? obj.description : "";
    const type =
      typeof obj.opportunityType === "string"
        ? obj.opportunityType
        : typeof obj.riskType === "string"
          ? obj.riskType
          : "";
    if (type && desc) return `${type}：${desc}`;
    if (desc) return desc;
    if (type) return type;
  }
  return String(item ?? "");
}

export function DecisionNoteCard({ run }: Props) {
  const output = run.outputJson as unknown as AgentAnalysisOutput | undefined;
  if (!output) return null;

  const suggestionType = (output.suggestionType || "continue_watch") as SuggestionType;
  const decision = SUGGESTION_TYPE_TO_DECISION[suggestionType] || SUGGESTION_TYPE_TO_DECISION.continue_watch;
  const time = run.finishedAt || run.startedAt;
  const confidence = typeof output.confidence === "number" ? output.confidence : 0.5;
  const essayText = [output.marketOverview, output.positionChanges].filter(Boolean).join("\n\n");
  // 优先展示 AI 完整报告（rawMarkdown），缺失时回退到 marketOverview + positionChanges 摘要
  const reportText = output.rawMarkdown || essayText;
  // 从报告中提取股票代码，用于渲染 K 线图（最多 3 个）
  const stockCodes = reportText
    ? Array.from(reportText.matchAll(STOCK_CODE_REGEX)).map((m) => m[1])
    : [];
  const uniqueCodes = [...new Set(stockCodes)].slice(0, 3);
  const dimensions = output.dimensions as AnalysisDimensions | undefined;

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

      {/* 中部：巡检报告正文（rawMarkdown 完整报告，含表格/列表/标题） */}
      {reportText && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            巡检报告
          </div>
          <Markdown content={reportText} className="text-xs text-muted-foreground" />
        </div>
      )}

      {/* 五维评分：badge + 雷达图 */}
      {dimensions && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 text-[10px] font-medium text-muted-foreground">五维评分</div>
          <DimensionBadges dimensions={dimensions} />
          <DimensionRadarChart dimensions={dimensions} className="mt-2" />
        </div>
      )}

      {/* K 线图：从报告中提取的持仓代码 */}
      {uniqueCodes.length > 0 && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 text-[10px] font-medium text-muted-foreground">相关持仓 K 线</div>
          <div className="space-y-2">
            {uniqueCodes.map((code) => (
              <MiniKlineChartWrapper key={code} symbol={code} />
            ))}
          </div>
        </div>
      )}

      {/* 底部：机会 / 风险 / 结论 / 置信度 */}
      <div className="space-y-2 px-4 py-3">
        {output.opportunities && output.opportunities.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
              <Target className="h-3 w-3" />
              机会
            </div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {output.opportunities.map((o, i) => (
                <li key={i}>{normalizeTextItem(o)}</li>
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
                <li key={i}>{normalizeTextItem(r)}</li>
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
