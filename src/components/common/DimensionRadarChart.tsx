import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { AnalysisDimensions } from "@/domain/agent";
import { DIMENSION_LABELS } from "@/domain/agent";
import { cn } from "@/lib/utils";

interface Props {
  dimensions: AnalysisDimensions;
  className?: string;
}

export function DimensionRadarChart({ dimensions, className }: Props) {
  const data = (Object.keys(dimensions) as Array<keyof AnalysisDimensions>).map(
    (key) => ({
      dimension: DIMENSION_LABELS[key],
      score: dimensions[key].score,
    })
  );
  return (
    <div className={cn("w-full h-48", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
          <Radar
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
