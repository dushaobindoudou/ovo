import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsState {
  captureInterval: number;
  agentInterval: number;
  monitoredWindows: string[];
  selectedBackend: "claude-code" | "openclaw" | "hermes" | "api";
  ttsEnabled: boolean;
  simulationMode: boolean;
  setCaptureInterval: (seconds: number) => void;
  setAgentInterval: (seconds: number) => void;
  setMonitoredWindows: (keys: string[]) => void;
  setSelectedBackend: (backend: SettingsState["selectedBackend"]) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setSimulationMode: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      captureInterval: 5,
      agentInterval: 15,
      monitoredWindows: [],
      selectedBackend: "claude-code",
      ttsEnabled: true,
      simulationMode: false,
      setCaptureInterval: (captureInterval) => set({ captureInterval }),
      setAgentInterval: (agentInterval) => set({ agentInterval }),
      setMonitoredWindows: (monitoredWindows) => set({ monitoredWindows }),
      setSelectedBackend: (selectedBackend) => set({ selectedBackend }),
      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setSimulationMode: (simulationMode) => set({ simulationMode })
    }),
    {
      name: "ovo-settings"
    }
  )
);
