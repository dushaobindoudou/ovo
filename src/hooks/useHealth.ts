import { useCallback } from "react";
import type { HealthPayload } from "../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

export function useHealth() {
  const getLatest = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.health.getLatest(); } catch { return null; }
  }, []);
  const getConfig = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.health.getConfig(); } catch { return null; }
  }, []);
  const setConfig = useCallback(async (payload: { enabled?: boolean; intervalSeconds?: number }) => {
    if (!isElectron) return;
    try { await window.nudgeAPI.health.setConfig(payload); } catch { /* ignore */ }
  }, []);
  const onUpdate = useCallback((listener: (payload: HealthPayload) => void) => {
    if (!isElectron) return () => {};
    try { return window.nudgeAPI.on("health:update", listener); } catch { return () => {}; }
  }, []);

  return { getLatest, getConfig, setConfig, onUpdate };
}
