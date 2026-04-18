import type { ComponentType } from "react";
import { Activity, BookOpen, Bot, Camera, Info, LayoutDashboard, Monitor, ScrollText, Settings } from "lucide-react";

export type ConsolePage = "status" | "window" | "memory" | "pipeline" | "settings" | "agent" | "screenshot" | "about";

interface SidebarProps {
  page: ConsolePage;
  onChange: (page: ConsolePage) => void;
}

const menus: Array<{ id: ConsolePage; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: "status", label: "状态", icon: LayoutDashboard },
  { id: "window", label: "窗口", icon: Monitor },
  { id: "memory", label: "记忆", icon: BookOpen },
  { id: "pipeline", label: "日志", icon: ScrollText },
  { id: "settings", label: "设置", icon: Settings },
];

const toolMenus: Array<{ id: ConsolePage; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: "agent", label: "Agent", icon: Bot },
  { id: "screenshot", label: "截图", icon: Camera },
  { id: "about", label: "关于", icon: Info },
];

export function ConsoleSidebar({ page, onChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-[64px] flex-col items-center bg-[var(--bg-sidebar)] pt-3">
      {/* Logo */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]">
        <Activity size={18} className="text-white" />
      </div>

      {/* 主导航 */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {menus.map((menu) => {
          const Icon = menu.icon;
          const active = menu.id === page;
          return (
            <button
              key={menu.id}
              type="button"
              title={menu.label}
              onClick={() => onChange(menu.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-2 h-px w-8 bg-[var(--border)]" />

      {/* 工具导航 */}
      <nav className="mb-3 flex flex-col items-center gap-1">
        {toolMenus.map((menu) => {
          const Icon = menu.icon;
          const active = menu.id === page;
          return (
            <button
              key={menu.id}
              type="button"
              title={menu.label}
              onClick={() => onChange(menu.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
