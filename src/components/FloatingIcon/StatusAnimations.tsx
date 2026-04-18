import { AnimatedLogo } from "../shared/AnimatedLogo";
import type { LogoState } from "../shared/AnimatedLogo";

interface StatusAnimationsProps {
  status: "idle" | "listen" | "think" | "suggest" | "error";
}

// Map old status names to new LogoState
const statusMap: Record<StatusAnimationsProps["status"], LogoState> = {
  idle: "idle",
  listen: "watching",
  think: "thinking",
  suggest: "executing",
  error: "idle",
};

export function StatusAnimations({ status }: StatusAnimationsProps) {
  return <AnimatedLogo size={24} state={statusMap[status]} />;
}
