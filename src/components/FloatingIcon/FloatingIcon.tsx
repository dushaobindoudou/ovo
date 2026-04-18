import { useMemo } from "react";
import { AnimatedLogo } from "../shared/AnimatedLogo";
import { useRuntimeStore } from "../../stores/runtimeStore";

export function FloatingIcon() {
  const { isCapturing, agentState } = useRuntimeStore();

  // Map internal agentState to logo animation state
  const logoState = useMemo(() => {
    if (isCapturing) return "watching" as const;
    return agentState;
  }, [isCapturing, agentState]);

  return (
    <div className="m-1 flex h-10 w-10 items-center justify-center">
      <AnimatedLogo size={40} state={logoState} />
    </div>
  );
}
