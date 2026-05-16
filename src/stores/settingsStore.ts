import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

export interface SettingsState {
  theme: ThemeMode;
  captureInterval: number;
  agentInterval: number;
  monitoredWindows: string[];
  selectedBackend: "claude-code" | "openclaw" | "hermes" | "api";
  apiBaseUrl: string;
  apiKey: string;
  apiModel: string;
  ttsEnabled: boolean;
  /** 后台监控：true 时定时扫监控窗口列表；false（默认）时只截活动窗口 */
  backgroundMonitoring: boolean;
  /** Toast 激进度：silent 全部沉默 / alerts（默认）只弹高 risk + requireConfirm / all 全弹 */
  toastVerbosity: "silent" | "alerts" | "all";
  healthCheckEnabled: boolean;
  healthCheckInterval: number;
  /** R9: 开发者模式——关闭时藏起 流水线 tab + 系统/业务日志 + Prompt 自评，给非技术用户更干净 */
  developerMode: boolean;
  setTheme: (theme: ThemeMode) => void;
  setCaptureInterval: (seconds: number) => void;
  setAgentInterval: (seconds: number) => void;
  setMonitoredWindows: (keys: string[]) => void;
  setSelectedBackend: (backend: SettingsState["selectedBackend"]) => void;
  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setApiModel: (model: string) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setBackgroundMonitoring: (enabled: boolean) => void;
  setToastVerbosity: (v: "silent" | "alerts" | "all") => void;
  setHealthCheckEnabled: (enabled: boolean) => void;
  setHealthCheckInterval: (seconds: number) => void;
  setDeveloperMode: (enabled: boolean) => void;
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
      agentInterval: 5,
      monitoredWindows: [],
      selectedBackend: "hermes",
      apiBaseUrl: "https://api.anthropic.com",
      apiKey: "",
      apiModel: "claude-sonnet-4-20250514",
      ttsEnabled: true,
      backgroundMonitoring: false,
      toastVerbosity: "alerts",
      healthCheckEnabled: true,
      healthCheckInterval: 60,
      developerMode: false,
      setTheme: (theme) => set({ theme }),
      setCaptureInterval: (captureInterval) => set({ captureInterval }),
      setAgentInterval: (agentInterval) => set({ agentInterval }),
      setMonitoredWindows: (monitoredWindows) => set({ monitoredWindows }),
      setSelectedBackend: (selectedBackend) => set({ selectedBackend }),
      setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setApiModel: (apiModel) => set({ apiModel }),
      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setBackgroundMonitoring: (backgroundMonitoring) => set({ backgroundMonitoring }),
      setToastVerbosity: (toastVerbosity) => set({ toastVerbosity }),
      setHealthCheckEnabled: (healthCheckEnabled) => set({ healthCheckEnabled }),
      setHealthCheckInterval: (healthCheckInterval) => set({ healthCheckInterval }),
      setDeveloperMode: (developerMode) => set({ developerMode })
    }),
    {
      name: "ovo-settings",
      version: 3,
      // F1 (v2): 迁移老用户 verbosity="alerts" → "all"
      // F4-B (v3): 迁移 agentInterval 15s → 5s（pipeline 间隔对齐 capture）
      migrate: (persisted: unknown, fromVersion: number) => {
        if (persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          if (fromVersion < 2 && p.toastVerbosity === "alerts") {
            p.toastVerbosity = "all";
          }
          if (fromVersion < 3 && (p.agentInterval === 15 || p.agentInterval === undefined)) {
            p.agentInterval = 5;
          }
        }
        return persisted as SettingsState;
      }
    }
  )
);
