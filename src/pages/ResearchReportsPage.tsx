// 研报分析页
import { useState } from "react";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/common/EmptyState";
import { getResearchReports, type ResearchReport } from "@/services/marketData";

export function ResearchReportsPage() {
  const [symbol, setSymbol] = useState("");
  const [queriedSymbol, setQueriedSymbol] = useState("");
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);

  const handleQuery = async () => {
    const trimmed = symbol.trim();
    if (!trimmed) return;
    setLoading(true);
    setHasQueried(true);
    setQueriedSymbol(trimmed);
    try {
      const result = await getResearchReports(trimmed, 20);
      setReports(result);
    } catch (e) {
      console.warn("[ResearchReportsPage] 查询研报失败", e);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">研报分析</h1>
        <p className="text-xs text-muted-foreground">
          查询机构研究报告，含评级、EPS 预测与摘要
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleQuery();
          }}
          placeholder="600519 或 600519.SH"
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => void handleQuery()} disabled={loading}>
          <Search className="h-3.5 w-3.5" />
          {loading ? "查询中..." : "查询"}
        </Button>
      </div>

      {loading ? (
        <LoadingState text="正在加载研报..." />
      ) : hasQueried && reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="暂无研报"
          description={
            queriedSymbol
              ? `未找到 ${queriedSymbol} 的研报数据`
              : "输入股票代码后查询"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {reports.map((r, idx) => (
            <Card key={`${r.title}-${r.publishDate}-${idx}`}>
              <CardContent className="space-y-2 p-4">
                <div className="font-semibold text-sm leading-snug">{r.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{r.orgName}</span>
                  {r.rating && (
                    <Badge variant="outline" className="text-[10px]">
                      {r.rating}
                    </Badge>
                  )}
                  <span>· {r.publishDate}</span>
                </div>
                {r.epsForecast && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">EPS 预测：</span>
                    <span>{r.epsForecast}</span>
                  </div>
                )}
                {r.summary && (
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {r.summary}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
