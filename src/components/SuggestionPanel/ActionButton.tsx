import type { MouseEventHandler, PropsWithChildren } from "react";
import clsx from "clsx";

interface ActionButtonProps extends PropsWithChildren {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: "primary" | "secondary";
}

export function ActionButton({ children, onClick, variant = "secondary" }: ActionButtonProps) {
  const baseClass = "rounded-md px-3 py-1.5 text-xs font-medium transition-all";
  const primaryClass = "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]";
  const secondaryClass = "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]";

  return (
    <button className={clsx(baseClass, variant === "primary" ? primaryClass : secondaryClass)} onClick={onClick}>
      {children}
    </button>
  );
}
