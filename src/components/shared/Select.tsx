import type { SelectHTMLAttributes } from "react";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-lg border border-white/10 bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] ${props.className ?? ""}`}
    />
  );
}
