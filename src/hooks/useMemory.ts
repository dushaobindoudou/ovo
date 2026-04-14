import { useCallback } from "react";

export function useMemory() {
  const getStats = useCallback(() => window.nudgeAPI.kg.getStats(), []);
  const getEvents = useCallback((limit = 100) => window.nudgeAPI.kg.getEvents(limit), []);
  const clear = useCallback(() => window.nudgeAPI.kg.clear(), []);
  const exportAll = useCallback(() => window.nudgeAPI.kg.export(), []);

  return { getStats, getEvents, clear, exportAll };
}
