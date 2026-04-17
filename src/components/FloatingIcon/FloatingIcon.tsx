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
      className="m-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] shadow-[var(--shadow-md)] transition-transform hover:scale-110 active:scale-95"
      title="展开建议面板"
    >
      <StatusAnimations status={status} />
    </button>
  );
}
