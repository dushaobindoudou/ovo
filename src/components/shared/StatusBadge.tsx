interface StatusBadgeProps {
  status: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}

const colorMap: Record<StatusBadgeProps["status"], string> = {
  success: "bg-[var(--accent-dim)] text-[var(--accent)]",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-blue-50 text-blue-600",
  neutral: "bg-gray-50 text-[var(--text-secondary)]"
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status]}`}>{label}</span>;
}
