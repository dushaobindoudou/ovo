import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

export function useKnowledgeGraph() {
  const searchEntities = useCallback(async (query: string) => {
    if (!isElectron) return [];
    try { return await window.nudgeAPI.kg.searchEntities(query); } catch { return []; }
  }, []);
  const getEntity = useCallback(async (id: string) => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.kg.getEntity(id); } catch { return null; }
  }, []);
  const analyzePersonality = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.kg.analyzePersonality(); } catch { return null; }
  }, []);
  const getStats = useCallback(async () => {
    if (!isElectron) return { entities: 0, relationships: 0, events: 0, pipelines: 0 };
    try { return await window.nudgeAPI.kg.getStats(); } catch { return { entities: 0, relationships: 0, events: 0, pipelines: 0 }; }
  }, []);

  return { searchEntities, getEntity, analyzePersonality, getStats };
}
