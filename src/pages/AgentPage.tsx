// Agent 任务页
import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentTimeline } from "@/components/dashboard/AgentTimeline";
import { Bot, Plus, Play, Trash2, AlertTriangle, Check } from "lucide-react";
import {
  TRIGGER_TYPE_LABEL,
  AGENT_SCOPE_LABEL,
  ANALYSIS_STRATEGY_LABEL,
  ANALYSIS_STRATEGY_DESC,
  type AgentJob,
  type TriggerType,
  type AgentScope,
  type AnalysisStrategy,
} from "@/domain/agent";
import { formatDateTime } from "@/lib/format";
import { ALERT_LEVEL_LABEL, ALERT_LEVEL_COLOR, type AlertLevel } from "@/domain/agent";

export function AgentPage() {
  const {
    agentJobs,
    agentRuns,
    alerts,
    models,
    addAgentJob,
    updateAgentJob,
    removeAgentJob,
    runJobNow,
    addAlert,
    removeAlert,
    updateAlert,
  } = useAppStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("jobs");
  const [form, setForm] = useState({
    name: "",
    triggerType: "interval" as TriggerType,
    intervalMinutes: "60",
    fixedTimes: "09:35,14:50",
    scope: "all_positions" as AgentScope,
    symbol: "",
    tradingHoursOnly: true,
    analysisStrategy: "standard_patrol" as AnalysisStrategy,
    debateEnabled: false,
    debateModelIds: [] as string[],
  });
  const [alertForm, setAlertForm] = useState({
    name: "",
    symbol: "",
    metric: "price" as "price" | "change_rate" | "pnl_rate" | "total_drawdown" | "ma_cross_up" | "ma_cross_down",
    operator: "below" as "above" | "below",
    value: "",
    maWindow: "20",
    level: "warning" as AlertLevel,
  });

  const submitJob = async () => {
    if (!form.name) return;
    await addAgentJob({
      name: form.name,
      enabled: true,
      triggerType: form.triggerType,
      intervalMinutes: form.triggerType === "interval" ? Number(form.intervalMinutes) : undefined,
      fixedTimes: form.triggerType === "fixed_time" ? form.fixedTimes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      scope: form.scope,
      symbol: form.scope === "single_symbol" ? form.symbol : undefined,
      tradingHoursOnly: form.tradingHoursOnly,
      analysisStrategy: form.analysisStrategy,
      debateModelIds: form.debateEnabled && form.debateModelIds.length >= 2 ? form.debateModelIds : undefined,
    });
    setDialogOpen(false);
    setForm({ name: "", triggerType: "interval", intervalMinutes: "60", fixedTimes: "09:35,14:50", scope: "all_positions", symbol: "", tradingHoursOnly: true, analysisStrategy: "standard_patrol", debateEnabled: false, debateModelIds: [] });
  };

  const submitAlert = async () => {
    const isMaCross = alertForm.metric === "ma_cross_up" || alertForm.metric === "ma_cross_down";
    if (!alertForm.name || (!isMaCross && !alertForm.value)) return;
    await addAlert({
      name: alertForm.name,
      enabled: true,
      condition: {
        symbol: alertForm.symbol || undefined,
        metric: alertForm.metric,
        operator: isMaCross
          ? (alertForm.metric === "ma_cross_up" ? "cross_up" : "cross_down")
          : alertForm.operator,
        value: Number(alertForm.value) || 0,
        ...(isMaCross ? { maWindow: Number(alertForm.maWindow) || 20 } : {}),
      },
      level: alertForm.level,
    });
    setAlertDialogOpen(false);
    setAlertForm({ name: "", symbol: "", metric: "price", operator: "below", value: "", maWindow: "20", level: "warning" });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agent 定时任务</h1>
          <p className="text-xs text-muted-foreground">
            Agent 会按计划自动读取持仓、调用行情、生成分析并写入聊天框。
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          新建任务
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jobs">定时任务</TabsTrigger>
          <TabsTrigger value="runs">执行日志</TabsTrigger>
          <TabsTrigger value="alerts">风险提醒</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          {agentJobs.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-12 w-12" />}
              title="暂无 Agent 任务"
              description="新建一个任务，让 Agent 定时帮你巡检持仓。"
            />
          ) : (
            <div className="space-y-2">
              {agentJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onToggle={async (enabled) => await updateAgentJob(job.id, { enabled })}
                  onRun={() => void runJobNow(job.id)}
                  onRemove={() => void removeAgentJob(job.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs">
          <AgentTimeline runs={agentRuns} limit={50} />
        </TabsContent>

        <TabsContent value="alerts">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setAlertDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              新建提醒
            </Button>
          </div>
          {alerts.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-12 w-12" />}
              title="暂无风险提醒"
              description="新建一个提醒，Agent 巡检时会自动检查。"
            />
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <Card key={a.id} className="flex items-center gap-3 p-3">
                  <Badge className={`text-[10px] ${ALERT_LEVEL_COLOR[a.level]}`}>
                    {ALERT_LEVEL_LABEL[a.level]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      条件：
                      {a.condition.metric === "ma_cross_up" || a.condition.metric === "ma_cross_down"
                        ? `${a.condition.metric === "ma_cross_up" ? "MA 上穿" : "MA 下穿"} MA${a.condition.maWindow ?? 20}`
                        : `${a.condition.metric} ${a.condition.operator} ${a.condition.value}`}
                      {a.condition.symbol ? ` · ${a.condition.symbol}` : ""}
                    </div>
                  </div>
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={(enabled) => void updateAlert(a.id, { enabled })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => void removeAlert(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 新建任务弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>新建 Agent 定时任务</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>任务名称</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：每小时持仓巡检"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>触发类型</Label>
              <Select
                value={form.triggerType}
                onChange={(e) => setForm({ ...form, triggerType: e.target.value as TriggerType })}
              >
                <option value="interval">{TRIGGER_TYPE_LABEL.interval}</option>
                <option value="fixed_time">{TRIGGER_TYPE_LABEL.fixed_time}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>监控范围</Label>
              <Select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value as AgentScope })}
              >
                <option value="all_positions">{AGENT_SCOPE_LABEL.all_positions}</option>
                <option value="watchlist">{AGENT_SCOPE_LABEL.watchlist}</option>
                <option value="single_symbol">{AGENT_SCOPE_LABEL.single_symbol}</option>
              </Select>
            </div>
          </div>
          {form.triggerType === "interval" ? (
            <div className="space-y-1">
              <Label>间隔分钟</Label>
              <Input
                type="number"
                value={form.intervalMinutes}
                onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })}
                placeholder="如：60"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>固定时间（逗号分隔）</Label>
              <Input
                value={form.fixedTimes}
                onChange={(e) => setForm({ ...form, fixedTimes: e.target.value })}
                placeholder="如：09:35,14:50"
              />
            </div>
          )}
          {form.scope === "single_symbol" && (
            <div className="space-y-1">
              <Label>股票代码</Label>
              <Input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="如：600519.SH"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>分析策略</Label>
            <Select
              value={form.analysisStrategy}
              onChange={(e) => setForm({ ...form, analysisStrategy: e.target.value as AnalysisStrategy })}
            >
              {(Object.keys(ANALYSIS_STRATEGY_LABEL) as AnalysisStrategy[]).map((s) => (
                <option key={s} value={s}>
                  {ANALYSIS_STRATEGY_LABEL[s]} — {ANALYSIS_STRATEGY_DESC[s]}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={form.tradingHoursOnly}
              onCheckedChange={(v) => setForm({ ...form, tradingHoursOnly: v })}
            />
            <span className="text-muted-foreground">仅在交易时段执行</span>
          </label>
          <div className="space-y-2 rounded border border-border p-2">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={form.debateEnabled}
                onCheckedChange={(v) => setForm({ ...form, debateEnabled: v, debateModelIds: v ? form.debateModelIds : [] })}
              />
              <span className="text-muted-foreground">辩论模式（多模型独立分析后汇总共识/分歧）</span>
            </label>
            {form.debateEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>⚠️ 辩论模式调用次数翻倍 = 费用翻倍</span>
                </div>
                <Label>选择辩论模型（2-3 个）</Label>
                {models.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    尚未配置任何模型，请先在「模型设置」中添加。
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {models.map((m) => {
                      const selected = form.debateModelIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const next = selected
                              ? form.debateModelIds.filter((id) => id !== m.id)
                              : [...form.debateModelIds, m.id];
                            setForm({ ...form, debateModelIds: next });
                          }}
                          className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {m.displayName ?? m.modelName}
                            <span className="text-muted-foreground"> · {m.providerLabel}</span>
                          </span>
                          {!m.isEnabled && (
                            <Badge variant="outline" className="text-[9px]">
                              已禁用
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {form.debateModelIds.length > 0 && form.debateModelIds.length < 2 && (
                  <p className="text-[11px] text-amber-400">
                    至少选择 2 个模型才会启用辩论，否则按单模型执行。
                  </p>
                )}
                {form.debateModelIds.length > 3 && (
                  <p className="text-[11px] text-amber-400">
                    建议选择 2-3 个模型，过多会显著增加费用。
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={() => void submitJob()}>创建</Button>
        </DialogFooter>
      </Dialog>

      {/* 新建提醒弹窗 */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogHeader>
          <DialogTitle>新建风险提醒</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>提醒名称</Label>
            <Input
              value={alertForm.name}
              onChange={(e) => setAlertForm({ ...alertForm, name: e.target.value })}
              placeholder="如：茅台跌破 1600"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>监控指标</Label>
              <Select
                value={alertForm.metric}
                onChange={(e) => setAlertForm({ ...alertForm, metric: e.target.value as typeof alertForm.metric })}
              >
                <option value="price">股价</option>
                <option value="change_rate">今日涨跌幅(%)</option>
                <option value="pnl_rate">持仓收益率(%)</option>
                <option value="total_drawdown">总资产回撤(%)</option>
                <option value="ma_cross_up">MA 上穿</option>
                <option value="ma_cross_down">MA 下穿</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>条件</Label>
              <Select
                value={alertForm.operator}
                onChange={(e) => setAlertForm({ ...alertForm, operator: e.target.value as typeof alertForm.operator })}
              >
                <option value="above">高于</option>
                <option value="below">低于</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              {alertForm.metric === "ma_cross_up" || alertForm.metric === "ma_cross_down" ? (
                <>
                  <Label>MA 窗口</Label>
                  <Input
                    type="number"
                    value={alertForm.maWindow}
                    onChange={(e) => setAlertForm({ ...alertForm, maWindow: e.target.value })}
                    placeholder="如：20"
                  />
                </>
              ) : (
                <>
                  <Label>数值</Label>
                  <Input
                    type="number"
                    value={alertForm.value}
                    onChange={(e) => setAlertForm({ ...alertForm, value: e.target.value })}
                    placeholder="如：1600"
                  />
                </>
              )}
            </div>
            <div className="space-y-1">
              <Label>提醒等级</Label>
              <Select
                value={alertForm.level}
                onChange={(e) => setAlertForm({ ...alertForm, level: e.target.value as AlertLevel })}
              >
                <option value="info">信息</option>
                <option value="notice">注意</option>
                <option value="warning">警告</option>
                <option value="severe">严重</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>股票代码（可选，留空表示全部）</Label>
            <Input
              value={alertForm.symbol}
              onChange={(e) => setAlertForm({ ...alertForm, symbol: e.target.value })}
              placeholder="如：600519.SH"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAlertDialogOpen(false)}>取消</Button>
          <Button onClick={() => void submitAlert()}>创建</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function JobCard({
  job,
  onToggle,
  onRun,
  onRemove,
}: {
  job: AgentJob;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
  onRemove: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 text-purple-400">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{job.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {TRIGGER_TYPE_LABEL[job.triggerType]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {AGENT_SCOPE_LABEL[job.scope]}
          </Badge>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {job.triggerType === "interval" && `每 ${job.intervalMinutes} 分钟`}
          {job.triggerType === "fixed_time" && `每天 ${job.fixedTimes?.join(", ")}`}
          {job.triggerType === "condition" && "条件触发"}
          {job.tradingHoursOnly && " · 仅交易时段"}
          {job.nextRunAt && ` · 下次 ${formatDateTime(job.nextRunAt)}`}
        </div>
      </div>
      <Switch checked={job.enabled} onCheckedChange={onToggle} />
      <Button variant="outline" size="sm" onClick={onRun}>
        <Play className="h-3 w-3" />
        立即运行
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </Card>
  );
}
