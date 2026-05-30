import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useKnowledgeGraph() {
  const searchEntities = useCallback(async (query: string) => {
    if (!isElectron) return [];
    try { return await window.ovoAPI.kg.searchEntities(query); } catch { return []; }
  }, []);
  const getEntity = useCallback(async (id: string) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.kg.getEntity(id); } catch { return null; }
  }, []);
  const analyzePersonality = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.kg.analyzePersonality(); } catch { return null; }
  }, []);
  const getStats = useCallback(async () => {
    if (!isElectron) return { entities: 0, relationships: 0, events: 0, pipelines: 0 };
    try { return await window.ovoAPI.kg.getStats(); } catch { return { entities: 0, relationships: 0, events: 0, pipelines: 0 }; }
  }, []);
  const getGraph = useCallback(async (limit?: number) => {
    if (!isElectron) return { nodes: [], edges: [] };
    try { return await window.ovoAPI.kg.getGraph(limit); } catch { return { nodes: [], edges: [] }; }
  }, []);
  const getEvents = useCallback(async (payload?: number | { entityId?: string; limit?: number }) => {
    if (!isElectron) return [];
    try { return await window.ovoAPI.kg.getEvents(payload); } catch { return []; }
  }, []);
  const clear = useCallback(async () => {
    if (!isElectron) return { ok: false };
    try { return await window.ovoAPI.kg.clear(); } catch { return { ok: false }; }
  }, []);
  const exportGraph = useCallback(async () => {
    if (!isElectron) return null;
    try {
      // kg.export 经二次握手返回 { ok, data }；解包出 data，导出的 JSON 才干净
      const res = await window.ovoAPI.kg.export() as { ok?: boolean; data?: unknown } | null;
      if (res && typeof res === "object" && "data" in res) return res.data ?? null;
      return res;
    } catch { return null; }
  }, []);
  // KG-D: 用户主权
  const setPinned = useCallback(async (entityId: string, pinned: boolean) => {
    if (!isElectron) return { ok: false };
    try { return await window.ovoAPI.kg.setPinned({ entityId, pinned }); } catch { return { ok: false }; }
  }, []);
  const deleteEntity = useCallback(async (entityId: string) => {
    if (!isElectron) return { ok: false, relationsDeleted: 0 };
    try { return await window.ovoAPI.kg.deleteEntity(entityId); } catch { return { ok: false, relationsDeleted: 0 }; }
  }, []);
  const getEntityDetail = useCallback(async (entityId: string) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.kg.getEntityDetail(entityId); } catch { return null; }
  }, []);
  const renameEntity = useCallback(async (entityId: string, newName: string) => {
    if (!isElectron) return { ok: false };
    try { return await window.ovoAPI.kg.renameEntity({ entityId, newName }); } catch { return { ok: false }; }
  }, []);
  const runGC = useCallback(async () => {
    if (!isElectron) return { deleted: 0, rescored: 0 };
    try { return await window.ovoAPI.kg.runGC(); } catch { return { deleted: 0, rescored: 0 }; }
  }, []);

  return {
    searchEntities, getEntity, analyzePersonality, getStats, getGraph, getEvents,
    clear, exportGraph, setPinned, deleteEntity, getEntityDetail, renameEntity, runGC
  };
}
