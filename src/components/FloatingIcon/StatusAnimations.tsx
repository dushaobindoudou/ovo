interface StatusAnimationsProps {
  status: "idle" | "listen" | "think" | "suggest" | "error";
}

const colorMap: Record<StatusAnimationsProps["status"], string> = {
  idle: "bg-emerald-400",
  listen: "bg-cyan-400",
  think: "bg-indigo-400",
  suggest: "bg-amber-400",
  error: "bg-rose-400"
};

export function StatusAnimations({ status }: StatusAnimationsProps) {
  return <div className={`h-4 w-4 rounded-full ${colorMap[status]} animate-pulse`} />;
}
