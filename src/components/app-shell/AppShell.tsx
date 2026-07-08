// 应用整体三栏布局
import { useState, useEffect } from "react";
import { PanelRightOpen } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ChatPanel } from "./ChatPanel";
import { AgentScheduler } from "@/services/scheduler";
import type { AgentJob } from "@/domain/agent";

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
        <aside
          className={cn(
            "shrink-0 border-l border-border bg-card",
            chatMode === "open" ? "w-[420px]" : "w-[60px]"
          )}
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
