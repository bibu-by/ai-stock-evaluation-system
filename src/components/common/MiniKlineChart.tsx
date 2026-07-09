import { useState, useEffect } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { KlineBar, KlinePeriod } from "@/domain/position";
import { getKline } from "@/services/marketData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PERIOD_LABEL: Record<KlinePeriod, string> = {
  "1m": "1分K",
  "5m": "5分K",
  "15m": "15分K",
  "30m": "30分K",
  "60m": "60分K",
  "1d": "日 K 线",
  "1w": "周 K 线",
  "1M": "月 K 线",
};

interface Props {
  symbol: string;
  bars: KlineBar[];
  period?: KlinePeriod;
  className?: string;
}

// 小型 K 线图：用 recharts ComposedChart 渲染收盘价走势 + MA5/MA10/MA20 叠加
// recharts 不原生支持蜡烛图，简化为收盘价 Line + 均线叠加
export function MiniKlineChart({ symbol, bars, period = "1d", className }: Props) {
  if (bars.length === 0) return null;

  const data = bars.map((b) => ({
    time: b.time.slice(5), // MM-DD 简化显示
    close: b.close,
    ma5: b.ma5,
    ma10: b.ma10,
    ma20: b.ma20,
  }));

  const periodLabel = PERIOD_LABEL[period];

  return (
    <div className={cn("w-full border rounded-md p-2 bg-card/50", className)}>
      <div className="text-xs text-muted-foreground mb-1">
        {symbol} {periodLabel} 近 {bars.length} 根
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              fontSize: 11,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          {/* 收盘价走势 */}
          <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
          {/* MA 叠加 */}
          <Line type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1} dot={false} opacity={0.7} />
          <Line type="monotone" dataKey="ma10" stroke="#3b82f6" strokeWidth={1} dot={false} opacity={0.7} />
          <Line type="monotone" dataKey="ma20" stroke="#ef4444" strokeWidth={1} dot={false} opacity={0.7} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
        <span className="text-primary">收盘价</span>
        <span style={{ color: "#f59e0b" }}>MA5</span>
        <span style={{ color: "#3b82f6" }}>MA10</span>
        <span style={{ color: "#ef4444" }}>MA20</span>
      </div>
    </div>
  );
}

// 异步加载 K 线的包装器：处理加载态与失败静默降级
export function MiniKlineChartWrapper({ symbol }: { symbol: string }) {
  const [bars, setBars] = useState<KlineBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<KlinePeriod>("1d");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await getKline(symbol, period, 60);
        if (!cancelled) setBars(data);
      } catch (e) {
        console.warn(`[ChatPanel] 加载 ${symbol} K 线失败`, e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, period]);

  const periodOptions: Array<{ key: KlinePeriod; label: string }> = [
    { key: "1d", label: "日K" },
    { key: "1w", label: "周K" },
    { key: "1M", label: "月K" },
  ];

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        {periodOptions.map((opt) => (
          <Button
            key={opt.key}
            variant={period === opt.key ? "default" : "secondary"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setPeriod(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground">加载 {symbol} K 线...</div>
      ) : bars.length === 0 ? null : (
        <MiniKlineChart symbol={symbol} bars={bars} period={period} />
      )}
    </div>
  );
}
