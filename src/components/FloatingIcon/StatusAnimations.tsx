interface StatusAnimationsProps {
  status: "idle" | "listen" | "think" | "suggest" | "error";
}

const colorMap: Record<StatusAnimationsProps["status"], string> = {
  idle: "bg-white",
  listen: "bg-white animate-pulse",
  think: "bg-white animate-pulse",
  suggest: "bg-white",
  error: "bg-white"
};

export function StatusAnimations({ status }: StatusAnimationsProps) {
  return <div className={`h-5 w-5 rounded-full ${colorMap[status]}`} />;
}
