import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

export interface SettingsState {
  theme: ThemeMode;
  captureInterval: number;
  agentInterval: number;
  monitoredWindows: string[];
  selectedBackend: "claude-code" | "openclaw" | "hermes" | "api";
  ttsEnabled: boolean;
  healthCheckEnabled: boolean;
  healthCheckInterval: number;
  setTheme: (theme: ThemeMode) => void;
  setCaptureInterval: (seconds: number) => void;
  setAgentInterval: (seconds: number) => void;
  setMonitoredWindows: (keys: string[]) => void;
  setSelectedBackend: (backend: SettingsState["selectedBackend"]) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setHealthCheckEnabled: (enabled: boolean) => void;
  setHealthCheckInterval: (seconds: number) => void;
}

/** 获取实际应用的主题 (处理 system 选项) */
export function getResolvedTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      captureInterval: 5,
      agentInterval: 15,
      monitoredWindows: [],
      selectedBackend: "claude-code",
      ttsEnabled: true,
      healthCheckEnabled: true,
      healthCheckInterval: 60,
      setTheme: (theme) => set({ theme }),
      setCaptureInterval: (captureInterval) => set({ captureInterval }),
      setAgentInterval: (agentInterval) => set({ agentInterval }),
      setMonitoredWindows: (monitoredWindows) => set({ monitoredWindows }),
      setSelectedBackend: (selectedBackend) => set({ selectedBackend }),
      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setHealthCheckEnabled: (healthCheckEnabled) => set({ healthCheckEnabled }),
      setHealthCheckInterval: (healthCheckInterval) => set({ healthCheckInterval })
    }),
    {
      name: "ovo-settings"
    }
  )
);
