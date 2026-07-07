// 首页工作台
import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";
import { AccountSummaryCard } from "@/components/dashboard/AccountSummary";
import { PositionCard } from "@/components/dashboard/PositionCard";
import { AgentStatusBar } from "@/components/dashboard/AgentStatusBar";
import { AgentTimeline } from "@/components/dashboard/AgentTimeline";
import { EquityCurveCard } from "@/components/dashboard/EquityCurveCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, Sparkles, AlertTriangle, Bot } from "lucide-react";
import { formatMoney, formatPercent, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RefreshButton } from "@/components/common/RefreshButton";

export function DashboardPage() {
  // 使用 selector 订阅所需字段，避免无关状态变更触发重渲染
  const account = useAppStore((s) => s.account);
  const positions = useAppStore((s) => s.positions);
  const agentRuns = useAppStore((s) => s.agentRuns);
  const alerts = useAppStore((s) => s.alerts);
  const messages = useAppStore((s) => s.messages);
  const accountSnapshots = useAppStore((s) => s.accountSnapshots);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const getAccountSummary = useAppStore((s) => s.getAccountSummary);

  // 用 useMemo 避免每次渲染返回新对象导致 useSyncExternalStore 无限循环
  const summary = useMemo(
    () => getAccountSummary(),
    [getAccountSummary, account, positions, alerts, messages]
  );

  if (!account) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<BriefcaseBusiness className="h-12 w-12" />}
          title="还没有账户数据"
          description="在聊天框告诉 AI 你的本金和现金，或手动添加。"
          action={
            <div className="flex gap-2">
              <Button onClick={() => setCurrentPage("settings")}>设置本金</Button>
              <Button variant="outline" disabled>
                <Sparkles className="h-4 w-4" />
                让 AI 帮我录入
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const pnlColorClass = pnlColor(summary.totalPnl);
  const todayAlerts = alerts.filter(
    (a) => a.lastTriggeredAt && a.lastTriggeredAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
  );

  return (
    <div className="space-y-4 p-4">
      {/* 总览指标 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="总资产"
          value={formatMoney(summary.totalAsset, account.currency)}
          sub={<span className={pnlColorClass}>收益 {formatPercent(summary.totalPnlRate)}</span>}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
        <MetricCard
          label="累计投入本金"
          value={formatMoney(account.cumulativePrincipal, account.currency)}
          sub={`现金 ${formatMoney(account.cashBalance, account.currency)}`}
        />
        <MetricCard
          label="总收益"
          value={
            <span className={pnlColorClass}>
              {summary.totalPnl >= 0 ? "+" : ""}
              {formatMoney(summary.totalPnl, account.currency)}
            </span>
          }
          sub={<span className={pnlColorClass}>{summary.totalPnlRate === null ? "N/A" : formatPercent(summary.totalPnlRate)}</span>}
          tone={summary.totalPnl >= 0 ? "success" : "destructive"}
        />
        <MetricCard
          label="持仓数量"
          value={`${summary.positionCount} 只`}
          sub={`市值 ${formatMoney(summary.positionMarketValue, account.currency)}`}
        />
      </div>

      {/* 账户汇总卡片 */}
      <AccountSummaryCard summary={summary} />

      {/* 收益折线图 */}
      <EquityCurveCard
        snapshots={accountSnapshots}
        currency={account.currency}
        cumulativePrincipal={account.cumulativePrincipal}
      />

      {/* Agent 状态条 */}
      <AgentStatusBar />

      {/* 持仓卡片 + Agent 时间线 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 持仓 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">持仓卡片</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage("positions")}>
                查看全部
              </Button>
              <RefreshButton size="sm" />
            </div>
          </div>
          {positions.length === 0 ? (
            <EmptyState
              icon={<BriefcaseBusiness className="h-10 w-10" />}
              title="暂无持仓"
              description="在右侧聊天框告诉 AI 你买了什么股票。"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {positions.map((p) => (
                <PositionCard key={p.id} position={p} />
              ))}
            </div>
          )}
        </div>

        {/* Agent 时间线 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Bot className="h-4 w-4 text-purple-400" />
              Agent 时间线
            </h2>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage("agent")}>
              查看全部
            </Button>
          </div>
          <AgentTimeline runs={agentRuns} limit={6} />
        </div>
      </div>

      {/* 今日提醒 + AI 观点统计 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            今日提醒
          </h2>
          {todayAlerts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              今日暂无触发的提醒
            </div>
          ) : (
            <div className="space-y-2">
              {todayAlerts.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-md border p-3 text-xs",
                    "border-amber-500/30 bg-amber-500/5 text-foreground"
                  )}
                >
                  <div className="font-medium">{a.name}</div>
                  <div className="mt-1 text-muted-foreground">
                    触发于 {new Date(a.lastTriggeredAt!).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 观点
          </h2>
          <div className="rounded-md border border-border p-4">
            <div className="text-xs text-muted-foreground">今日 AI 观点数量</div>
            <div className="mt-1 text-2xl font-semibold">{summary.aiOpinionCount}</div>
            <div className="mt-3 text-xs text-muted-foreground">
              最近一条：
            </div>
            {messages.filter((m) => m.role === "agent").slice(-1)[0] ? (
              <div className="mt-1 line-clamp-3 text-xs text-foreground">
                {messages.filter((m) => m.role === "agent").slice(-1)[0].content}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">暂无 AI 观点</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
