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
  { id: "agent", label: "Agent", icon: Bot },
  { id: "screenshot", label: "截图测试", icon: Camera },
  { id: "about", label: "关于", icon: Info }
];

export function ConsoleSidebar({ page, onChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-[220px] flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] shadow-[var(--shadow-sm)]">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text-primary)]">ovo</p>
            <p className="text-xs text-[var(--text-secondary)]">智能助手</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {menus.map((menu) => {
          const Icon = menu.icon;
          const active = menu.id === page;
          return (
            <button
              key={menu.id}
              type="button"
              onClick={() => onChange(menu.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                active
                  ? "bg-[var(--accent-dim)] text-[var(--accent)] font-medium"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
              }`}
            >
              <Icon size={18} />
              {menu.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] p-3 text-center text-xs text-[var(--text-muted)]">v0.1.0</div>
    </aside>
  );
}
