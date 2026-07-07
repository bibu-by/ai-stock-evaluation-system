// 左侧功能导航栏
import {
  LayoutDashboard,
  BriefcaseBusiness,
  ReceiptText,
  Bot,
  Lightbulb,
  Brain,
  Cpu,
  DatabaseZap,
  Settings,
} from "lucide-react";
import { useAppStore, type PageKey } from "@/store/appStore";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "总览", icon: LayoutDashboard },
  { key: "positions", label: "持仓", icon: BriefcaseBusiness },
  { key: "trades", label: "交易", icon: ReceiptText },
  { key: "agent", label: "Agent", icon: Bot },
  { key: "decision", label: "决策说明", icon: Lightbulb },
  { key: "memory", label: "记忆", icon: Brain },
  { key: "model", label: "模型", icon: Cpu },
  { key: "data-source", label: "数据源", icon: DatabaseZap },
  { key: "settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const { currentPage, setCurrentPage, setChatMode } = useAppStore();

  const handleClick = (item: NavItem) => {
    setCurrentPage(item.key);
    // 不同页面聊天面板默认状态
    if (item.key === "model" || item.key === "data-source") {
      setChatMode("hidden");
    } else if (item.key === "agent" || item.key === "memory" || item.key === "decision") {
      setChatMode("collapsed");
    } else {
      setChatMode("open");
    }
  };

  return (
    <aside className="flex h-full w-[60px] shrink-0 flex-col items-center border-r border-border bg-card/50 py-3">
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.key;
          return (
            <Tooltip key={item.key} content={item.label} side="right">
              <button
                onClick={() => handleClick(item)}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                )}
                <Icon className="h-5 w-5" />
              </button>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
