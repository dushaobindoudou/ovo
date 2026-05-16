import { useCallback, useEffect, useState } from "react";
import type { ActionResultPayload, AgentAction } from "../types/ovo";

export interface PendingActionItem {
  pipelineId: string;
  action: AgentAction;
}

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function usePendingActions() {
  const [pending, setPending] = useState<PendingActionItem[]>([]);

  useEffect(() => {
    if (!isElectron) return;
    try {
      const offPending = window.ovoAPI.on("action:pending", (payload) => {
        setPending((prev) => {
          const rest = prev.filter((item) => item.pipelineId !== payload.pipelineId);
          return [...rest, ...payload.actions.map((action) => ({ pipelineId: payload.pipelineId, action }))];
        });
      });
      const offResult = window.ovoAPI.on("action:result", (payload) => {
        const settled = new Set(payload.results.filter((row) => row.status !== "pending").map((row) => row.actionId));
        setPending((prev) =>
          prev.filter((item) => !(item.pipelineId === payload.pipelineId && settled.has(item.action.id)))
        );
      });
      return () => {
        offPending();
        offResult();
      };
    } catch {
      return;
    }
  }, []);

  const removePending = useCallback((actionId: string) => {
    setPending((prev) => prev.filter((item) => item.action.id !== actionId));
  }, []);

  const confirmAction = useCallback(async (payload: { action: AgentAction; pipelineId?: string }) => {
    if (!isElectron) return null;
    // SEC-11: 主进程持有 pending action 真值，renderer 只需要传 actionId
    return window.ovoAPI.action.confirm({
      actionId: payload.action.id,
      pipelineId: payload.pipelineId
    });
  }, []);

  const cancelAction = useCallback(async (payload: { actionId: string; pipelineId?: string }) => {
    if (!isElectron) return null;
    return window.ovoAPI.action.cancel(payload);
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
