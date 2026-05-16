import { useCallback } from "react";
import type { HealthPayload } from "../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useHealth() {
  const getLatest = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.health.getLatest(); } catch { return null; }
  }, []);
  const getConfig = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.health.getConfig(); } catch { return null; }
  }, []);
  const setConfig = useCallback(async (payload: { enabled?: boolean; intervalSeconds?: number }) => {
    if (!isElectron) return;
    try { await window.ovoAPI.health.setConfig(payload); } catch { /* ignore */ }
  }, []);
  const onUpdate = useCallback((listener: (payload: HealthPayload) => void) => {
    if (!isElectron) return () => {};
    try { return window.ovoAPI.on("health:update", listener); } catch { return () => {}; }
  }, []);

  return { getLatest, getConfig, setConfig, onUpdate };
}
