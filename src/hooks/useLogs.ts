import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export interface SystemLogRow {
  id: string;
  timestamp: number;
  level: string;
  source: string;
  message: string;
  context?: string;
}

export interface BusinessLogRow {
  id: string;
  pipeline_id: string | null;
  node: string;
  status: string;
  input: string | null;
  output: string | null;
  error: string | null;
  meta: string | null;
  start_time: number;
  end_time: number | null;
}

export function useLogs() {
  const getSystemLogs = useCallback(async (limit?: number): Promise<SystemLogRow[]> => {
    if (!isElectron) return [];
    try {
      const list = (await window.ovoAPI.logs.getSystem(limit)) as unknown as SystemLogRow[];
      return list ?? [];
    } catch {
      return [];
    }
  }, []);

  const getBusinessLogs = useCallback(async (payload?: { limit?: number; pipelineId?: string }): Promise<BusinessLogRow[]> => {
    if (!isElectron) return [];
    try {
      const list = (await window.ovoAPI.logs.getBusiness(payload)) as unknown as BusinessLogRow[];
      return list ?? [];
    } catch {
      return [];
    }
  }, []);

  const createBusinessLog = useCallback(async (payload: Parameters<NonNullable<Window["ovoAPI"]>["logs"]["createBusiness"]>[0]) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.logs.createBusiness(payload); } catch { return null; }
  }, []);

  const updateBusinessLog = useCallback(async (payload: Parameters<NonNullable<Window["ovoAPI"]>["logs"]["updateBusiness"]>[0]) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.logs.updateBusiness(payload); } catch { return null; }
  }, []);

  return { getSystemLogs, getBusinessLogs, createBusinessLog, updateBusinessLog };
}
