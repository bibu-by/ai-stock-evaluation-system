// 模型设置页
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
import { Cpu, Plus, Trash2, Check, Loader2, AlertCircle, Pencil } from "lucide-react";
import { PROVIDER_PRESETS, PROVIDER_LABEL, type AiProvider } from "@/domain/ai";
import { defaultAiGateway } from "@/services/aiGateway";
import { maskApiKey } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ModelSettingsPage() {
  const { models, addModel, updateModel, removeModel } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const emptyForm = {
    provider: "deepseek" as AiProvider,
    modelName: "",
    displayName: "",
    baseUrl: "",
    apiKey: "",
    isEnabled: true,
    isDefault: false,
  };
  const [form, setForm] = useState(emptyForm);

  const preset = PROVIDER_PRESETS.find((p) => p.provider === form.provider);

  const onProviderChange = (provider: AiProvider) => {
    const p = PROVIDER_PRESETS.find((x) => x.provider === provider)!;
    setForm({
      ...form,
      provider,
      baseUrl: p.baseUrl,
      modelName: p.defaultModel,
    });
  };

  // 关闭 Dialog 时重置表单和 editingId
  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  // 用已有模型填充表单，进入编辑模式
  const startEdit = (model: typeof models[number]) => {
    setEditingId(model.id);
    setForm({
      provider: model.provider,
      modelName: model.modelName,
      displayName: model.displayName || "",
      baseUrl: model.baseUrl,
      // 编辑时 apiKey 留空：用户不重新填则保持原 Key 不变
      apiKey: "",
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.modelName) return;
    // 编辑模式下，未填 apiKey 时不覆盖原值
    if (!editingId && !form.apiKey) return;

    if (editingId) {
      const patch: Parameters<typeof updateModel>[1] = {
        provider: form.provider,
        providerLabel: PROVIDER_LABEL[form.provider],
        modelName: form.modelName,
        displayName: form.displayName || form.modelName,
        baseUrl: form.baseUrl,
        isEnabled: form.isEnabled,
        isDefault: form.isDefault,
      };
      if (form.apiKey) patch.apiKey = form.apiKey;
      await updateModel(editingId, patch);
    } else {
      await addModel({
        provider: form.provider,
        providerLabel: PROVIDER_LABEL[form.provider],
        modelName: form.modelName,
        displayName: form.displayName || form.modelName,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        isEnabled: form.isEnabled,
        isDefault: form.isDefault,
      });
    }
    closeDialog();
  };

  const test = async (id: string) => {
    const model = models.find((m) => m.id === id);
    if (!model) return;
    setTestingId(id);
    try {
      const res = await defaultAiGateway.testConnection(model);
      setTestResult({ ...testResult, [id]: res });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">AI 模型配置</h1>
          <p className="text-xs text-muted-foreground">
            API Key 仅保存在本地，不会上传到任何服务器。
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />
          添加模型
        </Button>
      </div>

      {models.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Cpu className="mx-auto mb-2 h-12 w-12 opacity-40" />
          暂未配置模型，点击右上角添加。
        </Card>
      ) : (
        <div className="space-y-2">
          {models.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Cpu className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.displayName || m.modelName}</span>
                    {m.isDefault && (
                      <Badge variant="success" className="text-[10px]">
                        默认
                      </Badge>
                    )}
                    {m.isEnabled ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-400">
                        已启用
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        未启用
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {m.providerLabel} · {m.modelName}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {m.baseUrl}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    API Key: {maskApiKey(m.apiKey || "") || (m.apiKeyRef ? "已存入系统凭据" : "（未设置）")}
                  </div>
                  {testResult[m.id] && (
                    <div
                      className={cn(
                        "mt-2 flex items-center gap-1 text-xs",
                        testResult[m.id].ok ? "text-emerald-400" : "text-destructive"
                      )}
                    >
                      {testResult[m.id].ok ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {testResult[m.id].message}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.isEnabled}
                      onCheckedChange={(v) => void updateModel(m.id, { isEnabled: v })}
                    />
                    <span className="text-[10px] text-muted-foreground">启用</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.isDefault}
                      onCheckedChange={(v) => v && void updateModel(m.id, { isDefault: true })}
                    />
                    <span className="text-[10px] text-muted-foreground">默认</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void test(m.id)}
                      disabled={testingId === m.id}
                    >
                      {testingId === m.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      测试
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(m)}
                    >
                      <Pencil className="h-3 w-3" />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => void removeModel(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogHeader>
          <DialogTitle>{editingId ? "编辑 AI 模型" : "添加 AI 模型"}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <Label>AI 厂商</Label>
            <Select
              value={form.provider}
              onChange={(e) => onProviderChange(e.target.value as AiProvider)}
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>模型名称</Label>
              <Select
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              >
                {preset?.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>显示名（可选）</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder={form.modelName}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="space-y-1">
            <Label>API Key</Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={editingId ? "留空则保持原 Key 不变" : "sk-..."}
            />
            <p className="text-[10px] text-muted-foreground">
              {editingId ? "如需修改 API Key 请重新填写，否则留空即可。" : "仅保存在本地，不会上传到任何服务器。"}
            </p>
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
          <Button variant="ghost" onClick={closeDialog}>取消</Button>
          <Button onClick={() => void submit()}>{editingId ? "保存修改" : "保存"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
