// 指标卡片
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const TONE_TEXT: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <div className="text-muted-foreground/70">{icon}</div>}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
