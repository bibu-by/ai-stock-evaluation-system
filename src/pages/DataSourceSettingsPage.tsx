// 数据源设置页
import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DatabaseZap, Plus, Trash2 } from "lucide-react";
import type { MarketDataSource } from "@/domain/config";

export function DataSourceSettingsPage() {
  const { dataSources, addDataSource, updateDataSource, removeDataSource } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "sina" as MarketDataSource["type"],
    baseUrl: "",
    apiKey: "",
    isEnabled: true,
    isDefault: false,
    markets: "A_SHARE",
  });

  const submit = async () => {
    if (!form.name) return;
    await addDataSource({
      name: form.name,
      type: form.type,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey || undefined,
      isEnabled: form.isEnabled,
      isDefault: form.isDefault,
      markets: form.markets.split(",").map((s) => s.trim()),
    });
    setDialogOpen(false);
    setForm({ name: "", type: "sina", baseUrl: "", apiKey: "", isEnabled: true, isDefault: false, markets: "A_SHARE" });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">行情数据源</h1>
          <p className="text-xs text-muted-foreground">
            第一版默认使用新浪财经免费接口，无需 API Key。
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          添加数据源
        </Button>
      </div>

      <div className="space-y-2">
        {dataSources.map((s) => (
          <Card key={s.id} className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {s.type}
                </Badge>
                {s.isDefault && (
                  <Badge variant="success" className="text-[10px]">
                    默认
                  </Badge>
                )}
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {s.baseUrl || "（无 URL）"}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                支持市场：{s.markets.join(", ")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={s.isEnabled}
                onCheckedChange={(v) => void updateDataSource(s.id, { isEnabled: v })}
              />
              <span className="text-[10px] text-muted-foreground">启用</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive"
              onClick={() => void removeDataSource(s.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>添加数据源</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>名称</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：TuShare Pro"
            />
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as MarketDataSource["type"] })}
            >
              <option value="sina">新浪财经</option>
              <option value="akshare">AkShare 网关</option>
              <option value="tushare">TuShare</option>
              <option value="eastmoney">东方财富</option>
              <option value="alphavantage">Alpha Vantage</option>
              <option value="finnhub">Finnhub</option>
              <option value="yahoo">Yahoo Finance</option>
              <option value="custom">自定义</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1">
            <Label>API Key（可选）</Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="如需要"
            />
          </div>
          <div className="space-y-1">
            <Label>支持市场（逗号分隔）</Label>
            <Input
              value={form.markets}
              onChange={(e) => setForm({ ...form, markets: e.target.value })}
              placeholder="A_SHARE,HK,US"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => setForm({ ...form, isEnabled: v })}
              />
              启用
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm({ ...form, isDefault: v })}
              />
              设为默认
            </label>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={() => void submit()}>保存</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
