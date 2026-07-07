// 收益折线图卡片 - 直观展示账户总资产 / 收益率随时间变化
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, LineChart as LineIcon } from "lucide-react";
import type { AccountSnapshot } from "@/domain/account";
import { formatMoney, formatPercent, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

type Metric = "totalAsset" | "totalPnl" | "totalPnlRate";

const METRICS: Array<{ key: Metric; label: string; mode: "area" | "line" }> = [
  { key: "totalAsset", label: "总资产", mode: "area" },
  { key: "totalPnl", label: "总收益", mode: "line" },
  { key: "totalPnlRate", label: "收益率", mode: "line" },
];

interface Props {
  snapshots: AccountSnapshot[];
  currency: "CNY" | "USD" | "HKD";
  cumulativePrincipal: number;
}

export function EquityCurveCard({ snapshots, currency, cumulativePrincipal }: Props) {
  const [metric, setMetric] = useState<Metric>("totalAsset");

  const data = useMemo(() => {
    return snapshots
      .slice()
      .sort((a, b) => a.snapshotTime.localeCompare(b.snapshotTime))
      .map((s) => ({
        time: s.snapshotTime.slice(0, 10),
        label: s.snapshotTime.slice(5, 10), // MM-DD
        totalAsset: Number(s.totalAsset.toFixed(2)),
        totalPnl: Number(s.totalPnl.toFixed(2)),
        totalPnlRate: s.totalPnlRate == null ? null : Number(s.totalPnlRate.toFixed(2)),
      }));
  }, [snapshots]);

  const current = data[data.length - 1];
  const first = data[0];
  const delta =
    current && first
      ? metric === "totalPnlRate"
        ? (current.totalPnlRate ?? 0) - (first.totalPnlRate ?? 0)
        : metric === "totalPnl"
        ? current.totalPnl - first.totalPnl
        : current.totalAsset - first.totalAsset
      : 0;
  const deltaColor = pnlColor(metric === "totalPnlRate" ? delta : 0);

  const active = METRICS.find((m) => m.key === metric)!;
  const isRate = metric === "totalPnlRate";

  // Y 轴范围：以 0 为参考线，让正负一眼可见
  const values = data.map((d) => d[metric] ?? 0);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const pad = (maxV - minV) * 0.1 || Math.abs(maxV) * 0.1 || 1;
  const yDomain: [number | "auto", number | "auto"] = [
    Math.floor(minV - pad),
    Math.ceil(maxV + pad),
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">收益曲线</span>
          <span className="text-[10px] text-muted-foreground">
            共 {data.length} 个数据点
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {METRICS.map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={metric === m.key ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground">
          <LineIcon className="h-8 w-8 opacity-50" />
          暂无快照数据
          <span>刷新行情或在聊天框录入持仓后会自动生成收益曲线</span>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-[11px] text-muted-foreground">最新 {active.label}</span>
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                isRate ? pnlColor(current?.totalPnlRate ?? 0) : pnlColor(current?.totalPnl ?? 0)
              )}
            >
              {isRate
                ? formatPercent(current?.totalPnlRate ?? 0)
                : formatMoney(current?.[metric] ?? 0, currency)}
            </span>
            <span className={cn("text-[11px] tabular-nums", deltaColor)}>
              区间 {delta >= 0 ? "+" : ""}
              {isRate ? `${delta.toFixed(2)}%` : formatMoney(delta, currency)}
            </span>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {active.mode === "area" ? (
                <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    minTickGap={20}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      isRate ? `${v.toFixed(1)}%` : formatMoney(v, currency)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    formatter={(value: number) => [
                      isRate ? formatPercent(value) : formatMoney(value, currency),
                      active.label,
                    ]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </AreaChart>
              ) : (
                <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    minTickGap={20}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      isRate ? `${v.toFixed(1)}%` : formatMoney(v, currency)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    formatter={(value: number) => [
                      isRate ? formatPercent(value) : formatMoney(value, currency),
                      active.label,
                    ]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke={metric === "totalPnl" ? "#ef4444" : "#22c55e"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>起始 {formatMoney(cumulativePrincipal, currency)}</span>
            <span>每天自动记录一个数据点（最近 90 天）</span>
          </div>
        </>
      )}
    </Card>
  );
}
