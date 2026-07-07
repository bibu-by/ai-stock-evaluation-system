// 持仓管理页
import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { PositionCard } from "@/components/dashboard/PositionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { RefreshButton } from "@/components/common/RefreshButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { matchSymbolByName, searchSymbol, inferMarketByCode } from "@/services/marketData";
import type { Market } from "@/domain/position";

export function PositionsPage() {
  const { positions, addPosition, removePosition, sellPosition, refreshPrices } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    quantity: "",
    avgCost: "",
    totalCost: "",
    market: "A_SHARE" as Market,
    note: "",
    inputMode: "A" as "A" | "B",
  });

  // 卖出 Dialog 状态
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [sellTargetId, setSellTargetId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");

  // 删除确认 Dialog 状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const submit = async () => {
    if (!form.name || !form.quantity) return;
    const matched = matchSymbolByName(form.name);
    // 确保最终 symbol 带市场后缀（如 600519.SH），否则 Rust 端 sina_code 无法转换为 sh600519，导致行情接口拿不到数据
    let symbol = form.symbol || matched?.symbol || form.name;
    if (form.symbol && !form.symbol.includes(".")) {
      const inferred = inferMarketByCode(form.symbol);
      if (inferred) symbol = inferred.symbol;
    }
    const name = matched?.name || form.name;
    const market = (matched?.market as Market) || form.market;
    const qty = Number(form.quantity);

    try {
      if (form.inputMode === "A") {
        if (!form.avgCost) return;
        const cost = Number(form.avgCost);
        await addPosition({
          symbol,
          name,
          market,
          quantity: qty,
          avgCost: cost,
          currentPrice: cost,
          aiStatusText: "等待刷新",
          note: form.note,
        });
      } else {
        if (!form.totalCost) return;
        const total = Number(form.totalCost);
        await addPosition({
          symbol,
          name,
          market,
          quantity: qty,
          totalCost: total,
          aiStatusText: "等待刷新",
          note: form.note,
        });
      }
      setDialogOpen(false);
      setForm({ name: "", symbol: "", quantity: "", avgCost: "", totalCost: "", market: "A_SHARE", note: "", inputMode: "A" });
      // 导入后自动刷新一次行情，拉取最新价（非交易时段也会拿到上一交易日收盘价）
      void refreshPrices().catch((e) => console.warn("[PositionsPage] 导入后行情刷新失败", e));
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("现金不足") || msg.includes("现金余额不足")) {
        alert("现金不足，无法添加持仓");
      } else {
        alert(msg || "添加持仓失败");
      }
    }
  };

  const openSellDialog = (id: string, currentPrice: number) => {
    setSellTargetId(id);
    setSellPrice(currentPrice.toString());
    setSellDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeleteTargetId(id);
    setDeleteDialogOpen(true);
  };

  const handleSell = async () => {
    if (!sellTargetId) return;
    const price = Number(sellPrice);
    if (!price || price <= 0) return;
    try {
      await sellPosition(sellTargetId, price);
      setSellDialogOpen(false);
      setSellTargetId(null);
      setSellPrice("");
    } catch (e) {
      alert((e as Error).message || "卖出失败");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    try {
      await removePosition(deleteTargetId);
    } catch (e) {
      alert((e as Error).message || "删除失败");
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
    }
  };

  // 定时自动刷新已由全局 RefreshButton + App.tsx 顶层 useEffect 统一接管

  // 实时计算另一边数值
  const qtyNum = Number(form.quantity) || 0;
  const computedText =
    form.inputMode === "A"
      ? (() => {
          const cost = Number(form.avgCost) || 0;
          const total = cost * qtyNum;
          return `总成本 = 单价 × 数量 = ${total.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        })()
      : (() => {
          const total = Number(form.totalCost) || 0;
          const unit = qtyNum > 0 ? total / qtyNum : 0;
          return `单价 = 总花费 ÷ 数量 = ${unit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        })();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">持仓管理</h1>
          <p className="text-xs text-muted-foreground">
            共 {positions.length} 只股票 · 总市值 ¥
            {positions.reduce((s, p) => s + p.marketValue, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton size="sm" />
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            手动添加
          </Button>
        </div>
      </div>

      {positions.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness className="h-12 w-12" />}
          title="暂无持仓"
          description="点击右上角手动添加，或在聊天框告诉 AI。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {positions.map((p) => (
            <div key={p.id} className="space-y-2">
              <PositionCard position={p} />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => openSellDialog(p.id, p.currentPrice)}
                >
                  卖出
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openDeleteDialog(p.id)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>手动添加持仓</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>股票名称</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：贵州茅台"
              list="symbol-suggestions"
            />
            <datalist id="symbol-suggestions">
              {searchSymbol(form.name).map((s) => (
                <option key={s.symbol} value={s.name}>
                  {s.symbol}
                </option>
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>股票代码（可选）</Label>
              <Input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="自动匹配"
              />
            </div>
            <div className="space-y-1">
              <Label>市场</Label>
              <Select
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value as Market })}
              >
                <option value="A_SHARE">A 股</option>
                <option value="HK">港股</option>
                <option value="US">美股</option>
                <option value="ETF">ETF</option>
                <option value="FUND">基金</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>输入方式</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="inputMode"
                  checked={form.inputMode === "A"}
                  onChange={() => setForm({ ...form, inputMode: "A" })}
                />
                方式 A：单价 + 数量
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="inputMode"
                  checked={form.inputMode === "B"}
                  onChange={() => setForm({ ...form, inputMode: "B" })}
                />
                方式 B：总花费 + 数量
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>持仓数量</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="如：300"
              />
            </div>
            {form.inputMode === "A" ? (
              <div className="space-y-1">
                <Label>买入单价</Label>
                <Input
                  type="number"
                  value={form.avgCost}
                  onChange={(e) => setForm({ ...form, avgCost: e.target.value })}
                  placeholder="如：1680"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>总花费</Label>
                <Input
                  type="number"
                  value={form.totalCost}
                  onChange={(e) => setForm({ ...form, totalCost: e.target.value })}
                  placeholder="如：504000"
                />
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
            {computedText}
          </div>
          <div className="space-y-1">
            <Label>备注</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="买入理由或其他备注"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()}>确认添加</Button>
        </DialogFooter>
      </Dialog>

      {/* 卖出 Dialog */}
      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogHeader>
          <DialogTitle>卖出持仓</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>卖出价（元）</Label>
            <Input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="如：1800"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setSellDialogOpen(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSell()}>确认卖出</Button>
        </DialogFooter>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>删除持仓</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-muted-foreground">
            确定要删除该持仓吗？将按成本价回笼现金，此操作不可恢复。
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={() => void handleDeleteConfirm()}>
            确认删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
