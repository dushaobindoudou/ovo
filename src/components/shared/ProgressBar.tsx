interface ProgressBarProps {
  value: number;
  max?: number;
}

export function ProgressBar({ value, max = 100 }: ProgressBarProps) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div className="h-2 w-full rounded bg-white/10">
      <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
