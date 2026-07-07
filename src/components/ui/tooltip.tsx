import * as React from "react";
import { cn } from "@/lib/utils";

// 简易 Tooltip：hover 显示
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const [show, setShow] = React.useState(false);
  const pos =
    side === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-1"
      : side === "bottom"
      ? "top-full left-1/2 -translate-x-1/2 mt-1"
      : side === "left"
      ? "right-full top-1/2 -translate-y-1/2 mr-1"
      : "left-full top-1/2 -translate-y-1/2 ml-1";
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className={cn(
            "absolute z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
            pos,
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
