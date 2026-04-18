import { useCallback, useEffect } from "react";
import { usePipelineStore } from "../stores/pipelineStore";

export function usePipeline() {
  const items = usePipelineStore((state) => state.items);
  const setItems = usePipelineStore((state) => state.setItems);
  const upsertItem = usePipelineStore((state) => state.upsertItem);
  const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

  const refresh = useCallback(async () => {
    if (!isElectron) return;
    try {
      const latest = await window.nudgeAPI.pipeline.getRecent(50);
      setItems(latest ?? []);
    } catch { /* ignore in dev */ }
  }, [isElectron, setItems]);

  useEffect(() => {
    if (!isElectron) return;
    void refresh();
    try {
      const offNew = window.nudgeAPI.on("pipeline:new", (pipeline) => {
        if (pipeline) upsertItem(pipeline);
      });
      const offUpdate = window.nudgeAPI.on("pipeline:update", (pipeline) => {
        if (pipeline) upsertItem(pipeline);
      });
      return () => { offNew(); offUpdate(); };
    } catch { /* ignore in dev */ }
  }, [refresh, upsertItem, isElectron]);

  return { items, refresh };
}
