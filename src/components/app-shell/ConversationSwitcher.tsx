// 会话切换器 - ChatPanel 头部的会话下拉 + 新对话按钮
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, Pencil, Trash2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConversationSwitcher() {
  // 使用 selector 订阅所需字段
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const messages = useAppStore((s) => s.messages);
  const createConversation = useAppStore((s) => s.createConversation);
  const switchConversation = useAppStore((s) => s.switchConversation);
  const renameConversation = useAppStore((s) => s.renameConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);

  const [open, setOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const startRename = (id: string, currentTitle: string) => {
    setRenameId(id);
    setRenameValue(currentTitle);
    setOpen(false);
  };

  const submitRename = async () => {
    if (renameId && renameValue.trim()) {
      await renameConversation(renameId, renameValue.trim());
    }
    setRenameId(null);
    setRenameValue("");
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteConversation(deleteId);
    }
    setDeleteId(null);
  };

  return (
    <div className="flex items-center gap-1">
      {/* 当前会话下拉 */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex max-w-[160px] items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-secondary"
        >
          <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeConv?.title || "无会话"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-[320px] w-64 overflow-auto rounded-md border border-border bg-card shadow-lg">
            {conversations.length === 0 && (
              <div className="p-3 text-center text-xs text-muted-foreground">暂无会话</div>
            )}
            {conversations.map((c) => {
              const count = messages.filter((m) => m.conversationId === c.id).length;
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60",
                    isActive && "bg-primary/10"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void switchConversation(c.id);
                      setOpen(false);
                    }}
                    className="flex flex-1 flex-col items-start gap-0.5 text-left"
                  >
                    <span className="truncate font-medium">{c.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelative(c.updatedAt)} · {count} 条消息
                    </span>
                  </button>
                  <div className="hidden shrink-0 gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => startRename(c.id, c.title)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="重命名"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteId(c.id);
                        setOpen(false);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新对话按钮 */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void createConversation()}
        title="新对话"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      {/* 重命名弹窗 */}
      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogHeader>
          <DialogTitle>重命名会话</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-2">
          <Label>会话标题</Label>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename();
            }}
            autoFocus
          />
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRenameId(null)}>取消</Button>
          <Button onClick={() => void submitRename()}>保存</Button>
        </DialogFooter>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogHeader>
          <DialogTitle>删除会话</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-muted-foreground">
            删除会话将同时删除该会话下的所有消息，且无法恢复。确定继续吗？
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>取消</Button>
          <Button variant="destructive" onClick={() => void confirmDelete()}>删除</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
