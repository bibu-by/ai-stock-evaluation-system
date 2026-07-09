import { useEffect, useState } from "react";
import { useAppStore } from "@/store/appStore";
import { isWithinTradingHours } from "@/services/tradingCalendar";
import { AppShell } from "@/components/app-shell/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { PositionsPage } from "@/pages/PositionsPage";
import { TradesPage } from "@/pages/TradesPage";
import { AgentPage } from "@/pages/AgentPage";
import { DecisionNotesPage } from "@/pages/DecisionNotesPage";
import { ResearchReportsPage } from "@/pages/ResearchReportsPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { ModelSettingsPage } from "@/pages/ModelSettingsPage";
import { DataSourceSettingsPage } from "@/pages/DataSourceSettingsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { Onboarding } from "@/components/Onboarding";
import { LoadingState } from "@/components/common/EmptyState";

function App() {
  const { initialized, initApp, currentPage, config, refreshPrices } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initApp();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [initApp]);

  // 全局行情自动刷新定时器（仅交易时段生效）
  // 间隔由 config.autoRefreshIntervalSec 控制（0=关闭），全局唯一，跟随配置启停
  const intervalSec = config?.autoRefreshIntervalSec ?? 0;
  useEffect(() => {
    if (!initialized || intervalSec <= 0) return;
    const timer = setInterval(() => {
      if (isWithinTradingHours()) {
        void refreshPrices().catch((e) => console.warn("[App] 行情自动刷新失败", e));
      }
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [initialized, intervalSec, refreshPrices]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">初始化失败</div>
          <div className="mt-1 text-xs text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return <LoadingState text="正在加载本地数据..." />;
  }

  // 首次启动：进入引导流程，不显示主界面
  // firstRun=true 时由 Onboarding 引导：风险声明→选厂商→填Key→测试→设本金→是否导入Demo→进入主界面
  if (config?.firstRun) {
    return <Onboarding />;
  }

  return (
    <AppShell>
      {currentPage === "dashboard" && <DashboardPage />}
      {currentPage === "positions" && <PositionsPage />}
      {currentPage === "trades" && <TradesPage />}
      {currentPage === "agent" && <AgentPage />}
      {currentPage === "decision" && <DecisionNotesPage />}
      {currentPage === "research" && <ResearchReportsPage />}
      {currentPage === "memory" && <MemoryPage />}
      {currentPage === "model" && <ModelSettingsPage />}
      {currentPage === "data-source" && <DataSourceSettingsPage />}
      {currentPage === "settings" && <SettingsPage />}
    </AppShell>
  );
}

export default App;
