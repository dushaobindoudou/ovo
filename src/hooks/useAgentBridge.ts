import { useCallback } from "react";
import { useRuntimeStore } from "../stores/runtimeStore";
import type { AgentApiConfig } from "../types/ovo";

export function useAgentBridge() {
  const { setBackendStatus } = useRuntimeStore();

  const detectBackends = useCallback(async () => {
    const available = await window.nudgeAPI.agent.detectBackends();
    setBackendStatus(available.length > 0 ? `可用: ${available.join(", ")}` : "无可用后端");
    return available;
  }, [setBackendStatus]);

  const getStatus = useCallback(() => window.nudgeAPI.agent.status(), []);
  const setBackend = useCallback((backend: string) => window.nudgeAPI.agent.setBackend(backend), []);
  const setApiConfig = useCallback((config: AgentApiConfig) => window.nudgeAPI.agent.setApiConfig(config), []);
  const testScenario = useCallback((scenarioId: string, customPrompt?: string) => {
    return window.nudgeAPI.agent.testScenario({ scenarioId, customPrompt });
  }, []);

  return { detectBackends, getStatus, setBackend, setApiConfig, testScenario };
}
