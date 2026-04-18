import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors ${props.className ?? ""}`}
    />
  );
}
