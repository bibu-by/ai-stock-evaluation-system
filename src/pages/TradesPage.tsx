// 交易记录页
import { useAppStore } from "@/store/appStore";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ReceiptText } from "lucide-react";
import { TRADE_TYPE_LABEL, TRADE_TYPE_COLOR } from "@/domain/trade";
import { formatMoney, formatDateTime, formatNumber } from "@/lib/format";

export function TradesPage() {
  const { trades } = useAppStore();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">交易记录</h1>
        <p className="text-xs text-muted-foreground">共 {trades.length} 笔交易</p>
      </div>

      {trades.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-12 w-12" />}
          title="暂无交易记录"
          description="在聊天框输入「我买了 300 股贵州茅台，成本 1680」即可记录。"
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">股票</th>
                <th className="px-3 py-2 text-right">数量</th>
                <th className="px-3 py-2 text-right">价格</th>
                <th className="px-3 py-2 text-right">金额</th>
                <th className="px-3 py-2 text-right">手续费</th>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">来源</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${TRADE_TYPE_COLOR[t.type]}`}
                    >
                      {TRADE_TYPE_LABEL[t.type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {t.symbol}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(t.quantity, 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(t.price)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatMoney(t.amount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatNumber(t.fee)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTime(t.tradedAt)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {t.source === "ai_parse" ? "AI 解析" : t.source === "import" ? "导入" : "手动"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
