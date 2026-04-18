import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

type GlowButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function GlowButton({ children, className, ...props }: GlowButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}
