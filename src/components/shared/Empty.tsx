import type { ComponentType, ReactNode } from "react";
import { Sparkles } from "lucide-react";

/**
 * S4 / S8 / P3.2: 统一空状态组件
 * 替换散落 24+ 个"暂无..."/"(空)"/"（空）"等半角全角混用文案。
 *
 * 用法：
 *   <Empty title="还没有建议" hint="Ovo 通常 1-3 分钟内会有第一条" />
 *   <Empty icon={History} title="还没有动作记录" />
 */
export interface EmptyProps {
  /** 标题（一行） */
  title: string;
  /** 副标题 / 引导（可多行） */
  hint?: ReactNode;
  /** 图标组件（lucide-react），默认 Sparkles */
  icon?: ComponentType<{ size?: number }>;
  /** 调用动作（可选） */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** 紧凑模式 — 列表内联用（不留 padding） */
  compact?: boolean;
  /** 自定义类名 */
  className?: string;
}

export function Empty({ title, hint, icon: Icon = Sparkles, action, compact = false, className = "" }: EmptyProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-4" : "py-8"
      } ${className}`}
    >
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
        <Icon size={16} />
      </div>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
      {hint && (
        <div className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
