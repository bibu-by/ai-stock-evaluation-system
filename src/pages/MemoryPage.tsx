// 记忆库页
import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Brain, Plus, Trash2 } from "lucide-react";
import {
  MEMORY_TYPE_LABEL,
  MEMORY_TYPE_COLOR,
  type MemoryType,
} from "@/domain/memory";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MemoryPage() {
  const { memories, addMemory, removeMemory } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<MemoryType | "all">("all");
  const [form, setForm] = useState({
    type: "preference" as MemoryType,
    title: "",
    content: "",
    importance: "3",
    symbol: "",
    tags: "",
  });

  const filtered = memories.filter((m) => filter === "all" || m.type === filter);

  const submit = async () => {
    if (!form.title || !form.content) return;
    await addMemory({
      type: form.type,
      title: form.title,
      content: form.content,
      importance: Number(form.importance),
      symbol: form.symbol || undefined,
      tags: form.tags ? form.tags.split(",").map((s) => s.trim()) : [],
    });
    setDialogOpen(false);
    setForm({ type: "preference", title: "", content: "", importance: "3", symbol: "", tags: "" });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">记忆库</h1>
          <p className="text-xs text-muted-foreground">
            Agent 会读取这些记忆来理解你的投资偏好和历史观点。
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          新增记忆
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          全部
        </Button>
        {(Object.keys(MEMORY_TYPE_LABEL) as MemoryType[]).map((t) => (
          <Button
            key={t}
            variant={filter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(t)}
          >
            {MEMORY_TYPE_LABEL[t]}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Brain className="h-12 w-12" />}
          title="暂无记忆"
          description="告诉 AI「记住，我不喜欢追高」，系统会自动写入记忆库。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", MEMORY_TYPE_COLOR[m.type])}>
                      {MEMORY_TYPE_LABEL[m.type]}
                    </Badge>
                    <span className="text-sm font-medium">{m.title}</span>
                  </div>
                  <p className="mt-2 text-xs text-foreground">{m.content}</p>
                  {m.tags && m.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          #{t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>重要度 {"★".repeat(m.importance)}</span>
                    <span>{formatRelative(m.createdAt)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => void removeMemory(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>新增记忆</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>类型</Label>
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as MemoryType })}
              >
                {(Object.keys(MEMORY_TYPE_LABEL) as MemoryType[]).map((t) => (
                  <option key={t} value={t}>
                    {MEMORY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>重要度（1-5）</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.importance}
                onChange={(e) => setForm({ ...form, importance: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>标题</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="如：风险偏好"
            />
          </div>
          <div className="space-y-1">
            <Label>内容</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="详细描述"
              className="min-h-[80px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>关联股票（可选）</Label>
              <Input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="如：600519.SH"
              />
            </div>
            <div className="space-y-1">
              <Label>标签（逗号分隔）</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="如：风险偏好,仓位"
              />
            </div>
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
