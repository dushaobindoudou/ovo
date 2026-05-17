import type { ComponentType } from "react";
import { Zap, BookOpen, Settings, History } from "lucide-react";
import { OvoLogo } from "../shared/OvoLogo";

// UI-S1: 终态 4 tab——现在 / 记忆 / 回放 / 设置
// 4 个场景：ovo 现在干啥 / ovo 知道我啥 / ovo 历史做了啥 / 调 ovo
export type ConsolePage = "overview" | "process" | "knowledge" | "settings";

interface SidebarProps {
  page: ConsolePage;
  onChange: (page: ConsolePage) => void;
}

// P1.5: 加 tooltip 解释每个 tab 是什么
interface Menu {
  id: ConsolePage;
  label: string;
  tooltip: string;
  icon: ComponentType<{ size?: number }>;
}

const allMenus: Menu[] = [
  { id: "overview", label: "现在", tooltip: "Ovo 此刻在看什么、想什么、有什么待办", icon: Zap },
  { id: "knowledge", label: "记忆", tooltip: "Ovo 关于你形成的世界模型（实体 + 关系 + 画像）", icon: BookOpen },
  { id: "process", label: "回放", tooltip: "Ovo 过去做过的事 + 每条推理的完整因果链", icon: History },
];

const toolMenus: Menu[] = [
  { id: "settings", label: "设置", tooltip: "信任分级 / 隐私 / AI 后端 / 外观", icon: Settings },
];

export function ConsoleSidebar({ page, onChange }: SidebarProps) {
  const menus = allMenus;
  return (
    <aside className="flex h-full w-[72px] flex-col items-center bg-[var(--bg-sidebar)] pt-3">
      {/* Logo */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]">
        <OvoLogo size={20} />
      </div>

      {/* 主导航 —— 图标 + 文字双锚点，普通用户秒识别 */}
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {menus.map((menu) => (
          <SidebarItem key={menu.id} menu={menu} active={menu.id === page} onClick={() => onChange(menu.id)} />
        ))}
      </nav>

      {/* 分隔线 */}
      <div className="mx-4 my-2 h-px w-8 bg-[var(--border)]" />

      {/* 工具导航 */}
      <nav className="mb-3 flex flex-col items-center gap-1.5">
        {toolMenus.map((menu) => (
          <SidebarItem key={menu.id} menu={menu} active={menu.id === page} onClick={() => onChange(menu.id)} />
        ))}
      </nav>
    </aside>
  );
}

interface SidebarItemProps {
  menu: Menu;
  active: boolean;
  onClick: () => void;
}

function SidebarItem({ menu, active, onClick }: SidebarItemProps) {
  const Icon = menu.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={menu.tooltip}
      aria-label={`${menu.label} — ${menu.tooltip}`}
      className="group flex w-[60px] flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors"
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--text-secondary)] group-hover:bg-[var(--bg-card-hover)] group-hover:text-[var(--text-primary)]"
        }`}
      >
        <Icon size={20} />
      </span>
      <span
        className={`text-[10.5px] leading-tight transition-colors ${
          active
            ? "font-medium text-[var(--text-primary)]"
            : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
        }`}
      >
        {menu.label}
      </span>
    </button>
  );
}
