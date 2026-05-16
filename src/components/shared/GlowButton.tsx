import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

type GlowButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function GlowButton({ children, className, ...props }: GlowButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-lg bg-[var(--accent)] px-4 py-2 text-[14px] font-medium text-white shadow-[var(--shadow-sm)] transition-colors duration-150 hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}
