// 应用整体三栏布局
import { useState, useEffect, useRef, useCallback } from "react";
import { PanelRightOpen } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ChatPanel } from "./ChatPanel";
import { AgentScheduler } from "@/services/scheduler";
import type { AgentJob } from "@/domain/agent";

const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH_RATIO = 0.6;

const scheduler = new AgentScheduler(async (job: AgentJob) => {
  // 触发定时任务
  await useAppStore.getState().runJobNow(job.id);
});

export function AppShell({ children }: { children: React.ReactNode }) {
  // 使用 selector 订阅，避免无关状态变更触发重渲染
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const agentJobs = useAppStore((s) => s.agentJobs);
  const [schedulerStarted, setSchedulerStarted] = useState(false);

  // 启动 Agent 调度器
  useEffect(() => {
    scheduler.setJobs(agentJobs);
    if (!schedulerStarted && agentJobs.length > 0) {
      scheduler.start();
      setSchedulerStarted(true);
    }
    return () => {
      // 永不停止，直到应用卸载
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentJobs]);

  // 风险提醒定时检查：每 60 秒刷新行情并评估提醒条件
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await useAppStore.getState().refreshPrices();
        await useAppStore.getState().checkAlerts();
      } catch (e) {
        console.warn("[AppShell] 风险提醒检查失败", e);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => scheduler.stop();
  }, []);

  const showChat = chatMode === "open" || chatMode === "collapsed";

  // 右侧聊天面板宽度：open 时可拖拽调整，collapsed 时固定 60px
  const [chatWidth, setChatWidth] = useState(420);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const { startX, startWidth } = dragState.current;
    const delta = startX - e.clientX;
    const maxWidth = Math.max(MIN_CHAT_WIDTH, window.innerWidth * MAX_CHAT_WIDTH_RATIO);
    const nextWidth = Math.min(maxWidth, Math.max(MIN_CHAT_WIDTH, startWidth + delta));
    setChatWidth(nextWidth);
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.body.classList.remove("select-none");
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = { startX: e.clientX, startWidth: chatWidth };
      document.body.classList.add("select-none");
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [chatWidth, handlePointerMove, handlePointerUp]
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* 左侧导航 */}
      <Sidebar />

      {/* 中间主工作区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* 右侧聊天面板 */}
      {showChat ? (
        <>
          {/* 可拖拽分隔线：仅在聊天面板展开时显示 */}
          {chatMode === "open" && (
            <div
              className="group relative z-10 w-1 shrink-0 bg-border hover:bg-primary/50 active:bg-primary/70"
              style={{ cursor: "col-resize" }}
              onPointerDown={handlePointerDown}
              title="拖动调整宽度"
            >
              <div className="absolute inset-y-0 left-1/2 h-full w-2 -translate-x-1/2 group-hover:bg-primary/10" />
            </div>
          )}
          <aside
            className={cn(
              "shrink-0 bg-card",
              chatMode === "open" ? "" : "w-[60px] border-l border-border"
            )}
            style={chatMode === "open" ? { width: chatWidth } : undefined}
          >
            {chatMode === "open" ? (
              <ChatPanel />
            ) : (
            <div className="flex h-full flex-col items-center justify-start gap-2 pt-3">
              <button
                onClick={() => setChatMode("open")}
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="展开聊天"
              >
                <PanelRightOpen className="h-5 w-5" />
              </button>
            </div>
          )}
        </aside>
      </>
      ) : (
        <aside className="flex w-[60px] shrink-0 flex-col items-center justify-start gap-2 border-l border-border bg-card/50 pt-3">
          <button
            onClick={() => setChatMode("open")}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="展开聊天"
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        </aside>
      )}
    </div>
  );
}
