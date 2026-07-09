// 持仓卡片 - 横向布局：左侧持仓信息 + 右侧 K 线图，一行一个
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MoreHorizontal } from "lucide-react";
import type { Position } from "@/domain/position";
import { AI_STATUS_LABEL } from "@/domain/position";
import { MiniKlineChartWrapper } from "@/components/common/MiniKlineChart";
import {
  formatNumber,
  formatPercent,
  pnlColor,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface PositionCardProps {
  position: Position;
  onClick?: () => void;
}

export function PositionCard({ position: p, onClick }: PositionCardProps) {
  const pnlColorClass = pnlColor(p.unrealizedPnl);
  const todayColorClass = pnlColor(p.todayChangeRate || 0);

  return (
    <Card className="flex flex-col gap-4 p-4 transition-colors hover:border-primary/40">
      {/* 左侧：持仓信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {p.watchlist && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            )}
            <div>
              <div className="text-lg font-semibold">{p.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {p.symbol}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {p.aiStatusText && (
              <Badge variant="outline" className="text-xs">
                AI：{p.aiStatusText}
              </Badge>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClick}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label="股数" value={`${formatNumber(p.quantity, 0)} 股`} />
          <Field label="本金" value={formatNumber(p.avgCost * p.quantity)} />
          <Field label="买入股价" value={formatNumber(p.avgCost)} />
          <Field
            label="当前股价"
            value={formatNumber(p.currentPrice)}
            sub={
              p.todayChangeRate !== undefined && (
                <span className={todayColorClass}>
                  今日 {formatPercent(p.todayChangeRate)}
                </span>
              )
            }
          />
          <Field label="持仓" value={formatNumber(p.marketValue)} />
          <Field
            label="浮动盈亏"
            value={
              <span className={pnlColorClass}>
                {p.unrealizedPnl >= 0 ? "+" : ""}
                {formatNumber(p.unrealizedPnl)}
              </span>
            }
          />
          <Field
            label="收益率"
            value={
              <span className={pnlColorClass}>{formatPercent(p.unrealizedPnlRate)}</span>
            }
          />
        </div>

        {p.note && (
          <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
            备注：{p.note}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {AI_STATUS_LABEL[p.aiStatus || "watch"]}
          </span>
          <span className="text-[10px] text-muted-foreground">
            更新于 {new Date(p.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
      </div>

      {/* 右侧：K 线图常驻展示，宽度固定 */}
      <div className="border-t border-border pt-3">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          K 线（MA5/MA10/MA20）
        </div>
        <MiniKlineChartWrapper symbol={p.symbol} />
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm tabular-nums text-foreground")}>{value}</div>
      {sub && <div className="text-[11px] font-mono tabular-nums">{sub}</div>}
    </div>
  );
}
