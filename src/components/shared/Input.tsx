import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-white/10 bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] ${props.className ?? ""}`}
    />
  );
}
