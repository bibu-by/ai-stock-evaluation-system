// 账户汇总卡片
import { Card } from "@/components/ui/card";
import { Wallet, Coins, TrendingUp, TrendingDown, Banknote, Layers } from "lucide-react";
import type { AccountSummary } from "@/domain/account";
import { formatMoney, formatPercent, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AccountSummaryCard({ summary }: { summary: AccountSummary }) {
  const { account, positionMarketValue, totalAsset, totalPnl, totalPnlRate, positionCount } = summary;
  const cashBalance = account.cashBalance;
  const pnlColorClass = pnlColor(totalPnl);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{account.name}</span>
          <span className="text-xs text-muted-foreground">账户汇总</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          更新于 {new Date(account.updatedAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Item
          icon={<Banknote className="h-4 w-4 text-blue-400" />}
          label="总资产"
          value={
            <span className={cn("text-2xl font-semibold tabular-nums", pnlColorClass)}>
              {formatMoney(totalAsset, account.currency)}
            </span>
          }
        />
        <Item
          icon={<Coins className="h-4 w-4 text-amber-400" />}
          label="累计投入本金"
          value={
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(account.cumulativePrincipal, account.currency)}
            </span>
          }
        />
        <Item
          icon={<Wallet className="h-4 w-4 text-emerald-400" />}
          label="现金"
          value={
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(cashBalance, account.currency)}
            </span>
          }
        />
        <Item
          icon={
            totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-red-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-emerald-400" />
            )
          }
          label="总收益"
          value={
            <span className={cn("text-lg font-semibold tabular-nums", pnlColorClass)}>
              {totalPnl >= 0 ? "+" : ""}
              {formatMoney(totalPnl, account.currency)}
            </span>
          }
        />
        <Item
          icon={
            totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-red-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-emerald-400" />
            )
          }
          label="收益率"
          value={
            <span className={cn("text-lg font-semibold tabular-nums", pnlColorClass)}>
              {totalPnlRate === null ? "N/A" : formatPercent(totalPnlRate)}
            </span>
          }
        />
        <Item
          icon={<Layers className="h-4 w-4 text-purple-400" />}
          label="持仓市值 / 数量"
          value={
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {formatMoney(positionMarketValue, account.currency)}
              </div>
              <div className="text-xs text-muted-foreground">{positionCount} 只股票</div>
            </div>
          }
        />
      </div>
    </Card>
  );
}

function Item({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
