import * as React from "react";
import { cn } from "@/lib/utils";

// 通用空状态
interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "暂无数据",
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8 text-center",
        className
      )}
    >
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && (
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      {action}
    </div>
  );
}

// 通用加载状态
export function LoadingState({
  text = "加载中...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground",
        className
      )}
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {text}
    </div>
  );
}

// 状态点
export function StatusDot({
  color = "emerald",
  pulse,
  className,
}: {
  color?: "emerald" | "amber" | "red" | "blue" | "gray";
  pulse?: boolean;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    gray: "bg-muted-foreground",
  };
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colorMap[color]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          colorMap[color]
        )}
      />
    </span>
  );
}
