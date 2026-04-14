import { useMemo } from "react";
import { StatusAnimations } from "./StatusAnimations";
import { useRuntimeStore } from "../../stores/runtimeStore";

export function FloatingIcon() {
  const { isCapturing } = useRuntimeStore();
  const status = useMemo(() => {
    if (isCapturing) return "listen" as const;
    return "idle" as const;
  }, [isCapturing]);

  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = "#panel";
      }}
      className="m-2 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--accent-dim)] shadow-[0_0_20px_var(--accent-glow)]"
      title="展开建议面板"
    >
      <StatusAnimations status={status} />
    </button>
  );
}
