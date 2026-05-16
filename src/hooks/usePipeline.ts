import { useCallback, useEffect } from "react";
import { usePipelineStore } from "../stores/pipelineStore";

export function usePipeline() {
  const items = usePipelineStore((state) => state.items);
  const setItems = usePipelineStore((state) => state.setItems);
  const upsertItem = usePipelineStore((state) => state.upsertItem);
  const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

  const refresh = useCallback(async () => {
    if (!isElectron) return;
    try {
      const latest = await window.ovoAPI.pipeline.getRecent(50);
      setItems(latest ?? []);
    } catch { /* ignore in dev */ }
  }, [isElectron, setItems]);

  useEffect(() => {
    if (!isElectron) return;
    void refresh();
    try {
      const offNew = window.ovoAPI.on("pipeline:new", (pipeline) => {
        if (pipeline) upsertItem(pipeline);
      });
      const offUpdate = window.ovoAPI.on("pipeline:update", (pipeline) => {
        if (pipeline) upsertItem(pipeline);
      });
      return () => { offNew(); offUpdate(); };
    } catch { /* ignore in dev */ }
  }, [refresh, upsertItem, isElectron]);

  const clear = useCallback(async () => {
    if (!isElectron) return;
    try { await window.ovoAPI.pipeline.clear(); setItems([]); } catch { /* ignore in dev */ }
  }, [isElectron, setItems]);

  const getDetail = useCallback(async (id: string) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.pipeline.getDetail(id); } catch { return null; }
  }, [isElectron]);

  return { items, refresh, clear, getDetail };
}
