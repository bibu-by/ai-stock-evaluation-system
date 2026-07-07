// 行情刷新按钮：主按钮（手动刷新）+ 下拉箭头（选择自动刷新间隔）
// 自动刷新间隔全局共享，存入 AppConfig.autoRefreshIntervalSec
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";

// 可选间隔（秒）：0=关闭，>0=自动刷新间隔
const INTERVAL_OPTIONS: number[] = [0, 1, 5, 10, 30, 60, 300, 900, 1800, 3600];

function formatIntervalLabel(sec: number): string {
  if (sec === 0) return "关闭自动刷新";
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${sec / 60} 分钟`;
  return `${sec / 3600} 小时`;
}

// 短徽章文字（按钮上显示）
function formatBadge(sec: number): string {
  if (sec === 0) return "";
  if (sec < 60) return `· 自动 ${sec}s`;
  if (sec < 3600) return `· 自动 ${sec / 60}m`;
  return `· 自动 ${sec / 3600}h`;
}

interface RefreshButtonProps {
  size?: "sm" | "default";
  className?: string;
}

export function RefreshButton({ size = "sm", className }: RefreshButtonProps) {
  const { refreshPrices, config, setConfig } = useAppStore();
  const interval = config?.autoRefreshIntervalSec ?? 0;
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Escape 关闭菜单
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshPrices();
    } catch (e) {
      console.warn("[RefreshButton] 手动刷新行情失败", e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelect = (sec: number) => {
    void setConfig({ autoRefreshIntervalSec: sec });
    setOpen(false);
  };

  const sizeClass = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div ref={wrapperRef} className={cn("relative inline-flex", className)}>
      {/* 主按钮：手动刷新 */}
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={refreshing}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-transparent font-medium transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          "px-3",
          sizeClass
        )}
        title="手动刷新行情（任何时段）"
      >
        <RefreshCw className={cn(iconSize, refreshing && "animate-spin")} />
        <span>刷新行情</span>
        {interval > 0 && (
          <span className="text-[10px] text-emerald-500">{formatBadge(interval)}</span>
        )}
      </button>

      {/* 下拉箭头：切换菜单 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-center rounded-r-md border border-border bg-transparent transition-colors hover:bg-secondary hover:text-secondary-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          "px-2",
          sizeClass
        )}
        title="选择自动刷新间隔"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ChevronDown className={cn(iconSize, open && "rotate-180 transition-transform")} />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover p-1 text-xs shadow-md"
        >
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            自动刷新间隔
          </div>
          {INTERVAL_OPTIONS.map((sec) => {
            const selected = sec === interval;
            return (
              <button
                key={sec}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => handleSelect(sec)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-secondary",
                  selected && "bg-secondary/60"
                )}
              >
                <span className={cn(selected && "font-medium")}>
                  {formatIntervalLabel(sec)}
                </span>
                {selected && <Check className="h-3 w-3 text-emerald-500" />}
              </button>
            );
          })}
          <div className="mt-1 border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
            仅在 A 股交易时段自动刷新
          </div>
        </div>
      )}
    </div>
  );
}
