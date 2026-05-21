import type { ComponentType } from "react";
import { Zap, BookOpen, Settings, History, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OvoLogo } from "../shared/OvoLogo";

// UI-S1: 终态 5 tab——现在 / 产出 / 记忆 / 回放 / 设置
// 用户反馈："Ovo 帮我做的提醒/草稿/笔记我在哪看？" → 加"产出"独立 tab
export type ConsolePage = "overview" | "outputs" | "process" | "knowledge" | "settings";

interface SidebarProps {
  page: ConsolePage;
  onChange: (page: ConsolePage) => void;
}

// P1.5: tooltip 解释每个 tab。i18n：label/tooltip 走 nav.<id> / navTip.<id> 翻译键
interface Menu {
  id: ConsolePage;
  icon: ComponentType<{ size?: number }>;
}

const allMenus: Menu[] = [
  { id: "overview", icon: Zap },
  { id: "outputs", icon: Inbox },
  { id: "knowledge", icon: BookOpen },
  { id: "process", icon: History },
];

const toolMenus: Menu[] = [
  { id: "settings", icon: Settings },
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
  const { t } = useTranslation();
  const label = t(`nav.${menu.id}`);
  const tooltip = t(`navTip.${menu.id}`);
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={`${label} — ${tooltip}`}
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
        {label}
      </span>
    </button>
  );
}
