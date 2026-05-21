import type { PropsWithChildren } from "react";
import clsx from "clsx";

interface CardProps extends PropsWithChildren {
  title?: string;
  className?: string;
  /** P1.22: 锚点 id — 让 SettingsPanel 等长页面可滚动跳转 */
  id?: string;
}

export function Card({ title, className, children, id }: CardProps) {
  return (
    <section
      id={id}
      className={clsx(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)]",
        className
      )}
    >
      {title ? <h3 className="mb-3 text-[14px] font-semibold leading-[1.5] text-[var(--text-primary)]">{title}</h3> : null}
      {children}
    </section>
  );
}
