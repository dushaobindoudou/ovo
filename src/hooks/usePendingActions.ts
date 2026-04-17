import { useCallback, useEffect, useState } from "react";
import type { ActionResultPayload, AgentAction } from "../types/ovo";

export interface PendingActionItem {
  pipelineId: string;
  action: AgentAction;
}

export function usePendingActions() {
  const [pending, setPending] = useState<PendingActionItem[]>([]);

  useEffect(() => {
    const offPending = window.nudgeAPI.on("action:pending", (payload) => {
      setPending((prev) => {
        const rest = prev.filter((item) => item.pipelineId !== payload.pipelineId);
        return [...rest, ...payload.actions.map((action) => ({ pipelineId: payload.pipelineId, action }))];
      });
    });
    const offResult = window.nudgeAPI.on("action:result", (payload) => {
      const settled = new Set(payload.results.filter((row) => row.status !== "pending").map((row) => row.actionId));
      setPending((prev) =>
        prev.filter((item) => !(item.pipelineId === payload.pipelineId && settled.has(item.action.id)))
      );
    });
    return () => {
      offPending();
      offResult();
    };
  }, []);

  const removePending = useCallback((actionId: string) => {
    setPending((prev) => prev.filter((item) => item.action.id !== actionId));
  }, []);

  const confirmAction = useCallback(async (payload: { action: AgentAction; pipelineId?: string }) => {
    return window.nudgeAPI.action.confirm(payload);
  }, []);

  const cancelAction = useCallback(async (payload: { actionId: string; pipelineId?: string }) => {
    return window.nudgeAPI.action.cancel(payload);
  }, []);

  return {
    pending,
    setPending,
    removePending,
    confirmAction,
    cancelAction
  };
}

export type PendingActionResult = ActionResultPayload;
