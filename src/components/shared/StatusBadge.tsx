interface StatusBadgeProps {
  status: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}

const colorMap: Record<StatusBadgeProps["status"], string> = {
  success: "bg-emerald-500/20 text-emerald-300",
  warning: "bg-amber-500/20 text-amber-300",
  danger: "bg-rose-500/20 text-rose-300",
  info: "bg-blue-500/20 text-blue-300",
  neutral: "bg-white/10 text-[var(--text-secondary)]"
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`rounded px-2 py-1 text-xs ${colorMap[status]}`}>{label}</span>;
}
