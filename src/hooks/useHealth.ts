import { useCallback } from "react";
import type { HealthPayload } from "../types/ovo";

export function useHealth() {
  const getLatest = useCallback(() => window.nudgeAPI.health.getLatest(), []);
  const getConfig = useCallback(() => window.nudgeAPI.health.getConfig(), []);
  const setConfig = useCallback(
    (payload: { enabled?: boolean; intervalSeconds?: number }) => window.nudgeAPI.health.setConfig(payload),
    []
  );
  const onUpdate = useCallback((listener: (payload: HealthPayload) => void) => {
    return window.nudgeAPI.on("health:update", listener);
  }, []);

  return { getLatest, getConfig, setConfig, onUpdate };
}
