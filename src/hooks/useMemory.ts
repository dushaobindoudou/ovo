import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useMemory() {
  const getStats = useCallback(() => {
    if (!isElectron) return Promise.resolve({ entities: 0, relationships: 0, events: 0, pipelines: 0 });
    return window.ovoAPI.kg.getStats();
  }, []);
  const getEvents = useCallback((limit = 100) => {
    if (!isElectron) return Promise.resolve([]);
    return window.ovoAPI.kg.getEvents(limit);
  }, []);
  const clear = useCallback(() => {
    if (!isElectron) return Promise.resolve({ ok: false });
    return window.ovoAPI.kg.clear();
  }, []);
  const exportAll = useCallback(() => {
    if (!isElectron) return Promise.resolve({ stats: {}, entities: [], relations: [] });
    return window.ovoAPI.kg.export();
  }, []);

  return { getStats, getEvents, clear, exportAll };
}
