import type { ComponentType } from "react";
import { Activity, BookOpen, Bot, Info, LayoutDashboard, Monitor, ScrollText, Settings } from "lucide-react";

export type ConsolePage = "status" | "window" | "memory" | "pipeline" | "settings" | "agent" | "about";

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
  { id: "about", label: "关于", icon: Info }
];

export function ConsoleSidebar({ page, onChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-[220px] flex-col border-r border-white/10 bg-[var(--bg-sidebar)]">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-[var(--border-active)] bg-[var(--accent-dim)] p-2">
            <Activity size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold">ovo</p>
            <p className="text-xs text-[var(--text-secondary)]">控制台界面</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {menus.map((menu) => {
          const Icon = menu.icon;
          const active = menu.id === page;
          return (
            <button
              key={menu.id}
              type="button"
              onClick={() => onChange(menu.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                active ? "bg-[var(--accent-dim)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5"
              }`}
            >
              <Icon size={16} />
              {menu.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3 text-xs text-[var(--text-secondary)]">v0.1.0</div>
    </aside>
  );
}
