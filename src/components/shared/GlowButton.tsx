import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

type GlowButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function GlowButton({ children, className, ...props }: GlowButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-lg border border-[var(--border-active)] bg-[var(--accent-dim)] px-3 py-2 text-sm text-[var(--text-primary)] transition hover:shadow-[0_0_15px_var(--accent-glow)]",
        className
      )}
    >
      {children}
    </button>
  );
}
