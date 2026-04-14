import { useCallback } from "react";
import { useWindowStore } from "../stores/windowStore";

export function useWindows() {
  const { setWindows, setActive } = useWindowStore();

  const refresh = useCallback(async () => {
    const [windows, active] = await Promise.all([window.nudgeAPI.windows.getAll(), window.nudgeAPI.windows.getActive()]);
    setWindows(windows ?? []);
    setActive(active ?? null);
  }, [setActive, setWindows]);

  const setMonitored = useCallback((keys: string[]) => window.nudgeAPI.windows.setMonitored(keys), []);

  return { refresh, setMonitored };
}
