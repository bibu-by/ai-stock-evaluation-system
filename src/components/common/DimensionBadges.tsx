import type { AnalysisDimensions } from "@/domain/agent";
import { DIMENSION_LABELS } from "@/domain/agent";
import { cn } from "@/lib/utils";

interface Props {
  dimensions: AnalysisDimensions;
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (score >= 6) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
  if (score >= 4) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

export function DimensionBadges({ dimensions, className }: Props) {
  return (
    <div className={cn("grid grid-cols-5 gap-2", className)}>
      {(Object.keys(dimensions) as Array<keyof AnalysisDimensions>).map((key) => {
        const d = dimensions[key];
        return (
          <div
            key={key}
            className="flex flex-col items-center gap-1"
            title={d.rationale}
          >
            <div
              className={cn(
                "text-xs px-2 py-1 rounded border font-medium",
                scoreColor(d.score)
              )}
            >
              {d.score}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {DIMENSION_LABELS[key]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
