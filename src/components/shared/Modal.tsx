import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * S4: 统一 Modal 组件
 * 替换 BootstrapWizard / PermissionGate / ConfirmDialog / ActionDetailDrawer 等
 * 各自手写的 fixed inset-0 + backdrop-blur + 自己处理 ESC 的实现。
 *
 * 设计原则：
 *   - 点 backdrop 默认关闭，可关闭（dismissOnBackdrop=false）
 *   - 自动 ESC 关闭
 *   - z-index 用 design token (z-modal = 400)
 *   - size: sm(280) / md(420) / lg(560) / xl(720)
 */
export interface ModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题（可选） */
  title?: ReactNode;
  /** 副标题 / 描述（可选） */
  description?: ReactNode;
  /** 内容 */
  children: ReactNode;
  /** 尺寸预设 — 默认 md */
  size?: "sm" | "md" | "lg" | "xl";
  /** 点 backdrop 是否关闭 — 默认 true */
  dismissOnBackdrop?: boolean;
  /** ESC 是否关闭 — 默认 true */
  dismissOnEsc?: boolean;
  /** 是否显示右上角关闭按钮 — 默认 true */
  showCloseButton?: boolean;
  /** 自定义内容容器类名 */
  className?: string;
  /** 危险态（标题红色） */
  danger?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[280px]",
  md: "max-w-md",      // 420ish
  lg: "max-w-lg",      // 512
  xl: "max-w-xl"       // 576
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  dismissOnBackdrop = true,
  dismissOnEsc = true,
  showCloseButton = true,
  className = "",
  danger = false
}: ModalProps) {
  useEffect(() => {
    if (!open || !dismissOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, dismissOnEsc, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      style={{ zIndex: 400 }}
      onClick={dismissOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full rounded-2xl border ${danger ? "border-[var(--danger)]/40" : "border-[var(--border)]"} bg-[var(--bg-card)] p-5 shadow-[var(--shadow-lg)] ${SIZE_CLASSES[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <header className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className={`text-[15px] font-semibold ${danger ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
