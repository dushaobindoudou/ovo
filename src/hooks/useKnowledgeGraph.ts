import { useCallback } from "react";

export function useKnowledgeGraph() {
  const searchEntities = useCallback((query: string) => window.nudgeAPI.kg.searchEntities(query), []);
  const getEntity = useCallback((id: string) => window.nudgeAPI.kg.getEntity(id), []);
  const analyzePersonality = useCallback(() => window.nudgeAPI.kg.analyzePersonality(), []);
  const getStats = useCallback(() => window.nudgeAPI.kg.getStats(), []);

  return { searchEntities, getEntity, analyzePersonality, getStats };
}
