// 通用设置页：账户本金、现金、主题、数据导出
import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Download, FileDown, Moon, Sun, Wallet } from "lucide-react";
import { exportAllData, clearAllData } from "@/services/localStore";
import { exportOhlcvCsv, saveOhlcvCsvFile } from "@/services/backtest";
import { formatMoney } from "@/lib/format";

export function SettingsPage() {
  const {
    account,
    deposit,
    withdraw,
    config,
    setConfig,
    theme,
    toggleTheme,
    initApp,
    resetAssets,
  } = useAppStore();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // 回测数据导出
  const [btSymbols, setBtSymbols] = useState("");
  const [btCount, setBtCount] = useState("250");
  const [btExporting, setBtExporting] = useState(false);

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    try {
      await deposit(amount);
      setDepositOpen(false);
      setDepositAmount("");
    } catch (e) {
      alert((e as Error).message || "入金失败");
    }
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) return;
    try {
      await withdraw(amount);
      setWithdrawOpen(false);
      setWithdrawAmount("");
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("现金余额不足") || msg.includes("现金不足")) {
        alert("现金余额不足，无法出金");
      } else {
        alert(msg || "出金失败");
      }
    }
  };

  const handleExport = async () => {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-stock-agent-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setClearOpen(true);
  };

  // 导出回测 OHLCV CSV：取第一个 symbol 拉数据 → 弹 Tauri save 对话框保存
  const handleExportOhlcv = async () => {
    const symbols = btSymbols
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (symbols.length === 0) {
      alert("请输入至少一个股票代码（逗号分隔）");
      return;
    }
    const count = Number(btCount);
    if (!Number.isFinite(count) || count <= 0) {
      alert("数据条数需为正整数");
      return;
    }
    const symbol = symbols[0];
    setBtExporting(true);
    try {
      const csv = await exportOhlcvCsv(symbol, count);
      if (!csv) {
        alert("未获取到 K 线数据（浏览器环境不可用，请在 Tauri 应用中导出）");
        return;
      }
      const filePath = await saveOhlcvCsvFile(symbol, csv);
      if (filePath) {
        alert(`已导出 ${symbol} OHLCV CSV：\n${filePath}`);
      } else {
        // 用户取消 或 浏览器环境降级
        console.warn("[SettingsPage] saveOhlcvCsvFile 返回 null（已取消或环境不支持）");
      }
    } catch (e) {
      console.error("[SettingsPage] 导出回测 CSV 失败", e);
      alert((e as Error).message || "导出失败");
    } finally {
      setBtExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-xs text-muted-foreground">账户、外观、数据管理</p>
      </div>

      {/* 账户设置 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">账户设置</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">当前累计投入本金</span>
            <span className="font-semibold tabular-nums">
              {account ? formatMoney(account.cumulativePrincipal, account.currency) : "¥0.00"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">当前现金余额</span>
            <span className="font-semibold tabular-nums">
              {account ? formatMoney(account.cashBalance, account.currency) : "¥0.00"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDepositOpen(true)}>
            入金
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWithdrawOpen(true)}>
            出金
          </Button>
        </div>
      </Card>

      {/* 入金 Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogHeader>
          <DialogTitle>入金</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>入金金额（元）</Label>
            <Input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="如：10000"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDepositOpen(false)}>
            取消
          </Button>
          <Button onClick={() => void handleDeposit()}>确认入金</Button>
        </DialogFooter>
      </Dialog>

      {/* 出金 Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogHeader>
          <DialogTitle>出金</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>出金金额（元）</Label>
            <Input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="如：10000"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>
            取消
          </Button>
          <Button onClick={() => void handleWithdraw()}>确认出金</Button>
        </DialogFooter>
      </Dialog>

      {/* 清空数据确认 Dialog */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogHeader>
          <DialogTitle>清空全部数据</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-muted-foreground">
            确定要清空所有数据吗？此操作不可恢复，建议先导出备份。
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setClearOpen(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await clearAllData();
              location.reload();
            }}
          >
            确认清空
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 重置资产确认 Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogHeader>
          <DialogTitle>重置所有资产</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            将清空以下资产相关数据，<span className="text-foreground font-medium">此操作不可恢复</span>：
          </p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground space-y-1">
            <li>累计投入本金 → 0</li>
            <li>现金余额 → 0</li>
            <li>所有持仓 → 清空</li>
            <li>所有交易记录 → 清空</li>
            <li>收益曲线快照 → 清空</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            保留：聊天记录、Agent 任务/运行历史、提醒规则、记忆、模型配置、数据源。
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setResetOpen(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              try {
                await resetAssets();
                setResetOpen(false);
              } catch (e) {
                alert((e as Error).message || "重置失败");
              }
            }}
          >
            确认重置
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 外观设置 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          {theme === "dark" ? (
            <Moon className="h-4 w-4 text-primary" />
          ) : (
            <Sun className="h-4 w-4 text-primary" />
          )}
          <h2 className="text-sm font-semibold">外观</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">深色模式</div>
            <div className="text-xs text-muted-foreground">参考 Codex 工具界面风格</div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={() => void toggleTheme()} />
        </div>
        {config && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>主题</Label>
              <Select
                value={config.theme}
                onChange={(e) => void setConfig({ theme: e.target.value as "light" | "dark" | "system" })}
              >
                <option value="dark">深色</option>
                <option value="light">浅色</option>
                <option value="system">跟随系统</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>主要市场</Label>
              <Select
                value={config.primaryMarket}
                onChange={(e) => void setConfig({ primaryMarket: e.target.value as "A_SHARE" | "HK" | "US" })}
              >
                <option value="A_SHARE">A 股</option>
                <option value="HK">港股</option>
                <option value="US">美股</option>
              </Select>
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm">Agent 仅在交易时段运行</div>
            <div className="text-xs text-muted-foreground">A 股交易时段：9:30-11:30, 13:00-15:00</div>
          </div>
          <Switch
            checked={config?.tradingHoursOnlyByDefault ?? true}
            onCheckedChange={(v) => void setConfig({ tradingHoursOnlyByDefault: v })}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm">关闭窗口时隐藏到托盘</div>
            <div className="text-xs text-muted-foreground">隐藏后 Agent 保持后台运行，可从托盘恢复窗口</div>
          </div>
          <Switch
            checked={config?.closeToTray ?? true}
            onCheckedChange={(v) => void setConfig({ closeToTray: v })}
          />
        </div>
      </Card>

      {/* 数据管理 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">数据管理</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">导出全部数据</div>
              <div className="text-xs text-muted-foreground">导出为 JSON 文件，可作备份</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="h-3.5 w-3.5" />
              导出
            </Button>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-destructive">清空全部数据</div>
              <div className="text-xs text-muted-foreground">删除所有账户、持仓、聊天、Agent 任务</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => void handleClear()}>
              清空
            </Button>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-amber-400">重置所有资产</div>
              <div className="text-xs text-muted-foreground">
                清空本金、现金、持仓、交易记录、收益曲线；保留聊天、Agent、记忆、模型配置
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
              重置
            </Button>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">重新加载</div>
              <div className="text-xs text-muted-foreground">从本地存储重新加载数据</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void initApp();
              }}
            >
              重新加载
            </Button>
          </div>
        </div>
      </Card>

      {/* 回测数据导出 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileDown className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">回测数据导出</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>股票代码（多个用逗号分隔）</Label>
            <Input
              value={btSymbols}
              onChange={(e) => setBtSymbols(e.target.value)}
              placeholder="如：600519.SH,000858.SZ"
            />
            <p className="text-xs text-muted-foreground">
              导出标准 OHLCV CSV（date,open,high,low,close,volume），供 backtrader / qlib 消费
            </p>
          </div>
          <div className="space-y-1">
            <Label>数据条数（日 K，默认 250）</Label>
            <Input
              type="number"
              value={btCount}
              onChange={(e) => setBtCount(e.target.value)}
              placeholder="250"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={btExporting}
              onClick={() => void handleExportOhlcv()}
            >
              <Download className="h-3.5 w-3.5" />
              {btExporting ? "导出中..." : "导出 CSV"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            说明：第一版只做数据管道，不包含完整回测引擎；多股票导出请逐个执行。
          </p>
        </div>
      </Card>

      {/* 关于 */}
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">关于</h2>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>AI 炒股评估系统 v0.1.0</div>
          <div>定位：个人投资记录 + AI 投研助手 + 定时 Agent 监控</div>
          <div className="mt-2 text-[10px]">
            本系统为辅助分析与记录工具，不承诺收益，不直接替用户自动交易，所有买卖决策必须由用户确认。
          </div>
        </div>
      </Card>
    </div>
  );
}
