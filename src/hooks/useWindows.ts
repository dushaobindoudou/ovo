import { useCallback } from "react";
import { useWindowStore } from "../stores/windowStore";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useWindows() {
  const { setWindows, setActive } = useWindowStore();

  const refresh = useCallback(async () => {
    if (!isElectron) {
      setWindows([]);
      setActive(null);
      return;
    }
    try {
      const [windows, active] = await Promise.all([window.ovoAPI.windows.getAll(), window.ovoAPI.windows.getActive()]);
      setWindows(windows ?? []);
      setActive(active ?? null);
    } catch {
      setWindows([]);
      setActive(null);
    }
  }, [setActive, setWindows]);

  const setMonitored = useCallback((keys: string[]) => {
    if (!isElectron) return Promise.resolve({ ok: false });
    return window.ovoAPI.windows.setMonitored(keys);
  }, []);
  const getMonitored = useCallback(async (): Promise<string[]> => {
    if (!isElectron) return [];
    try { return (await window.ovoAPI.windows.getMonitored()) ?? []; } catch { return []; }
  }, []);
  const getCaptureStats = useCallback(() => {
    if (!isElectron) return Promise.resolve([]);
    return window.ovoAPI.windows.getCaptureStats();
  }, []);

  return { refresh, setMonitored, getMonitored, getCaptureStats };
}
