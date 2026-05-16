import { useCallback } from "react";
import { useRuntimeStore } from "../stores/runtimeStore";
import type { AgentApiConfig } from "../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useAgentBridge() {
  const { setBackendStatus } = useRuntimeStore();

  const detectBackends = useCallback(async () => {
    if (!isElectron) return [];
    try {
      const available = await window.ovoAPI.agent.detectBackends();
      setBackendStatus(available.length > 0 ? `可用: ${available.join(", ")}` : "无可用后端");
      return available;
    } catch { return []; }
  }, [setBackendStatus]);

  const getStatus = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.agent.status(); } catch { return null; }
  }, []);
  const setBackend = useCallback(async (backend: string) => {
    if (!isElectron) return;
    try { await window.ovoAPI.agent.setBackend(backend); } catch { /* ignore */ }
  }, []);
  const setApiConfig = useCallback(async (config: AgentApiConfig) => {
    if (!isElectron) return { ok: false };
    try { return await window.ovoAPI.agent.setApiConfig(config); } catch { return { ok: false }; }
  }, []);
  const testScenario = useCallback(async (scenarioId: string, customPrompt?: string) => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.agent.testScenario({ scenarioId, customPrompt }); } catch { return null; }
  }, []);

  return { detectBackends, getStatus, setBackend, setApiConfig, testScenario };
}
