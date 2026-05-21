import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * I4 / P2.1: 统一按钮组件 — 3 个变体 + 1 个 icon-only
 * 替换 GlowButton + 散落的 inline 边框/纯文字/icon 按钮。
 *
 * variant:
 *   primary    — 主操作，蓝底白字
 *   secondary  — 次操作，边框
 *   ghost      — 弱操作，纯文字
 *   danger     — 危险操作（删除 / 不可逆），红色
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 左侧图标 */
  leftIcon?: ReactNode;
  /** 右侧图标 */
  rightIcon?: ReactNode;
  /** 加载中状态 — 禁用并显示 spinner */
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50",
  secondary: "border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50",
  ghost: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50",
  danger: "border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3 py-1.5 text-[12px]",
  lg: "px-4 py-2 text-[13px]"
};

export function Button({
  variant = "secondary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </button>
  );
}
