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
        "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)]",
        className
      )}
    >
      {title ? <h3 className="mb-3 text-[14px] font-semibold leading-[1.5] text-[var(--text-primary)]">{title}</h3> : null}
      {children}
    </section>
  );
}
