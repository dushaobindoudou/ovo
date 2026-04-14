import type { PropsWithChildren } from "react";
import clsx from "clsx";

interface CardProps extends PropsWithChildren {
  title?: string;
  className?: string;
}

export function Card({ title, className, children }: CardProps) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-white/10 bg-[var(--bg-card)] p-4 shadow-[0_0_20px_rgba(0,212,170,0.08)]",
        className
      )}
    >
      {title ? <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3> : null}
      {children}
    </section>
  );
}
