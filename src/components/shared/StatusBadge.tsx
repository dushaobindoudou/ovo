interface StatusBadgeProps {
  status: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}

const colorMap: Record<StatusBadgeProps["status"], string> = {
  success: "bg-[var(--accent-dim)] text-[var(--accent)]",
  warning: "bg-[var(--warning)]/10 text-[var(--warning)]",
  danger: "bg-[var(--danger)]/10 text-[var(--danger)]",
  info: "bg-[var(--info)]/10 text-[var(--info)]",
  neutral: "bg-[var(--text-muted)]/10 text-[var(--text-secondary)]"
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status]}`}>{label}</span>;
}
