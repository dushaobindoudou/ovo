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
      // SEC-4: apiKey 不再走 zustand persist——明文进 localStorage 是 XSS 风险。
      // 配置时通过 ovoAPI.agent.setApiConfig() 发到主进程 safeStorage 加密落盘；
      // 这里保留字段是为了用户在 SettingsPanel 输入时的临时 state，
      // 但 partialize 会过滤掉，不写 localStorage（见下方）。
      apiKey: "",
      apiModel: "claude-sonnet-4-20250514",
      // SEC-12: TTS 默认关——开启时文本会发送给 Microsoft Edge TTS WebSocket，
      // 用户必须显式同意才打开。
      ttsEnabled: false,
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
      version: 4,
      // F1 (v2): 迁移老用户 verbosity="alerts" → "all"
      // F4-B (v3): 迁移 agentInterval 15s → 5s（pipeline 间隔对齐 capture）
      // SEC-4 (v4): 老用户 apiKey 从 localStorage 迁出——不再持久化
      migrate: (persisted: unknown, fromVersion: number) => {
        if (persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          if (fromVersion < 2 && p.toastVerbosity === "alerts") {
            p.toastVerbosity = "all";
          }
          if (fromVersion < 3 && (p.agentInterval === 15 || p.agentInterval === undefined)) {
            p.agentInterval = 5;
          }
          if (fromVersion < 4) {
            // 把残留的 apiKey 抹掉。提示用户在设置里重新输入一次（会走 safeStorage）。
            delete p.apiKey;
          }
        }
        return persisted as SettingsState;
      },
      // SEC-4: 不要把 apiKey 写进 localStorage——key 应该走主进程 safeStorage。
      // partialize 在写盘前过滤字段；只保留非敏感字段。
      partialize: (state) => {
        const { apiKey: _omit, ...rest } = state as SettingsState & { apiKey?: string };
        void _omit;
        return rest;
      }
    }
  )
);
