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
        "rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]",
        className
      )}
    >
      {title ? <h3 className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</h3> : null}
      {children}
    </section>
  );
}
