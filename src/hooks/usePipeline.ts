import { useCallback, useEffect } from "react";
import { usePipelineStore } from "../stores/pipelineStore";

export function usePipeline() {
  const { items, setItems, upsertItem } = usePipelineStore();

  const refresh = useCallback(async () => {
    const latest = await window.nudgeAPI.pipeline.getRecent(50);
    setItems(latest ?? []);
  }, [setItems]);

  useEffect(() => {
    void refresh();
    const offNew = window.nudgeAPI.on("pipeline:new", (pipeline) => {
      if (pipeline) upsertItem(pipeline);
    });
    const offUpdate = window.nudgeAPI.on("pipeline:update", (pipeline) => {
      if (pipeline) upsertItem(pipeline);
    });
    return () => {
      offNew();
      offUpdate();
    };
  }, [refresh, upsertItem]);

  return { items, refresh };
}
