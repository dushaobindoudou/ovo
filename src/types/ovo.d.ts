export type NudgeInvokeChannel =
  | "windows:get-all"
  | "windows:get-active"
  | "windows:set-monitored"
  | "windows:get-monitored"
  | "windows:get-capture-stats"
  | "capture:start"
  | "capture:stop"
  | "capture:set-interval"
  | "capture:get-buffers"
  | "capture:take-screenshot"
  | "health:get-latest"
  | "health:get-config"
  | "health:set-config"
  | "ocr:initialize"
  | "ocr:recognize"
  | "agent:detect-backends"
  | "agent:set-backend"
  | "agent:set-api-config"
  | "agent:status"
  | "agent:test-scenario"
  | "kg:search-entities"
  | "kg:get-entity"
  | "kg:get-events"
  | "kg:get-stats"
  | "kg:analyze-personality"
  | "kg:clear"
  | "kg:export"
  | "suggestion:feedback"
  | "action:confirm"
  | "action:cancel"
  | "pipeline:get-recent"
  | "pipeline:get-detail"
  | "pipeline:rate-stage"
  | "pipeline:rate-overall"
  | "pipeline:clear"
  | "system-log:list"
  | "business-log:list"
  | "business-log:create"
  | "business-log:update"
  | "tts:speak"
  | "app:get-version"
  | "app:open-console"
  | "error-log:get-recent"
  | "error-log:get-count";

export type NudgeEventChannel =
  | "capture:result"
  | "health:update"
  | "pipeline:new"
  | "pipeline:update"
  | "suggestion:new"
  | "action:pending"
  | "action:result";

export interface HealthPayload {
  ok: boolean;
  timestamp: number;
  mode: "real";
  confidence?: number;
  textLength?: number;
  sinceLastCaptureMs: number;
  error?: string;
}

export interface AgentApiConfig {
  baseUrl: string;
  key: string;
  model: string;
}

export interface AgentAction {
  id: string;
  description: string;
  params: Record<string, unknown>;
  requireConfirm: boolean;
  priority: number;
}

export interface ActionResultPayload {
  actionId: string;
  status: string;
  output: string;
  duration: number;
  error?: string;
}

export interface NudgeEventPayloadMap {
  "capture:result": any;
  "health:update": HealthPayload;
  "pipeline:new": any;
  "pipeline:update": any;
  "suggestion:new": any[];
  "action:pending": { pipelineId: string; actions: AgentAction[] };
  "action:result": { pipelineId: string; results: ActionResultPayload[] };
}

export interface NudgeInvokePayloadMap {
  "windows:get-all": undefined;
  "windows:get-active": undefined;
  "windows:set-monitored": string[];
  "windows:get-monitored": undefined;
  "windows:get-capture-stats": undefined;
  "capture:start": { intervalSeconds?: number } | undefined;
  "capture:stop": undefined;
  "capture:set-interval": number;
  "capture:get-buffers": undefined;
  "capture:take-screenshot": undefined;
  "health:get-latest": undefined;
  "health:get-config": undefined;
  "health:set-config": { enabled?: boolean; intervalSeconds?: number };
  "ocr:initialize": undefined;
  "ocr:recognize": { base64?: string } | undefined;
  "agent:detect-backends": undefined;
  "agent:set-backend": string;
  "agent:set-api-config": AgentApiConfig;
  "agent:status": undefined;
  "agent:test-scenario": { scenarioId: string; customPrompt?: string };
  "kg:search-entities": string;
  "kg:get-entity": string;
  "kg:get-events": number | undefined;
  "kg:get-stats": undefined;
  "kg:analyze-personality": undefined;
  "kg:clear": undefined;
  "kg:export": undefined;
  "suggestion:feedback": any;
  "action:confirm": { action: AgentAction; pipelineId?: string };
  "action:cancel": { actionId: string; pipelineId?: string };
  "pipeline:get-recent": number | undefined;
  "pipeline:get-detail": string;
  "pipeline:rate-stage": { pipelineId: string; stage: string; rating: "good" | "bad" };
  "pipeline:rate-overall": { pipelineId: string; rating: "good" | "neutral" | "bad" };
  "pipeline:clear": undefined;
  "system-log:list": number | undefined;
  "business-log:list": { limit?: number; pipelineId?: string } | undefined;
  "business-log:create": {
    pipelineId?: string;
    node: string;
    status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
    input?: unknown;
    output?: unknown;
    error?: string;
    meta?: Record<string, unknown>;
  };
  "business-log:update": {
    id: string;
    status?: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
    output?: unknown;
    error?: string;
    meta?: Record<string, unknown>;
  };
  "tts:speak": { text: string; voice?: string };
  "app:get-version": undefined;
  "app:open-console": undefined;
  "error-log:get-recent": number | undefined;
  "error-log:get-count": undefined;
}

export type NudgeInvokeResultMap = Record<NudgeInvokeChannel, any>;

export interface NudgeAPI {
  on: <TChannel extends NudgeEventChannel>(
    channel: TChannel,
    listener: (payload: NudgeEventPayloadMap[TChannel]) => void
  ) => () => void;
  invoke: <TChannel extends NudgeInvokeChannel>(
    channel: TChannel,
    payload?: NudgeInvokePayloadMap[TChannel]
  ) => Promise<NudgeInvokeResultMap[TChannel]>;
  windows: {
    getAll: () => Promise<any[]>;
    getActive: () => Promise<any>;
    setMonitored: (windowKeys: string[]) => Promise<any>;
    getMonitored: () => Promise<string[]>;
    getCaptureStats: () => Promise<
      Array<{
        windowId: string;
        appName: string;
        windowTitle: string;
        lastSuccessAt: number;
        attempts: number;
        failures: number;
        failureRate: number;
      }>
    >;
  };
  capture: {
    start: (payload?: { intervalSeconds?: number }) => Promise<any>;
    stop: () => Promise<any>;
    setInterval: (seconds: number) => Promise<any>;
    getBuffers: () => Promise<any[]>;
    takeScreenshot: () => Promise<{
      dataUrl: string;
      mimeType: string;
      byteLength: number;
      capturedAt: number;
    }>;
  };
  health: {
    getLatest: () => Promise<any>;
    getConfig: () => Promise<{ enabled: boolean; intervalSeconds: number }>;
    setConfig: (payload: { enabled?: boolean; intervalSeconds?: number }) => Promise<any>;
  };
  ocr: {
    initialize: () => Promise<any>;
    recognize: (payload?: { base64?: string }) => Promise<any>;
  };
  agent: {
    status: () => Promise<any>;
    detectBackends: () => Promise<string[]>;
    setBackend: (backend: string) => Promise<any>;
    setApiConfig: (config: AgentApiConfig) => Promise<{ ok: boolean }>;
    testScenario: (payload: { scenarioId: string; customPrompt?: string }) => Promise<any>;
  };
  kg: {
    searchEntities: (query: string) => Promise<any[]>;
    getEntity: (id: string) => Promise<any>;
    getEvents: (limit?: number) => Promise<any[]>;
    getStats: () => Promise<any>;
    analyzePersonality: () => Promise<any>;
    clear: () => Promise<any>;
    export: () => Promise<any>;
  };
  suggestion: {
    feedback: (payload: any) => Promise<any>;
  };
  action: {
    confirm: (payload: { action: any; pipelineId?: string }) => Promise<any>;
    cancel: (payload: { actionId: string; pipelineId?: string }) => Promise<any>;
  };
  pipeline: {
    getRecent: (limit?: number) => Promise<any[]>;
    getDetail: (id: string) => Promise<any>;
    rateStage: (payload: { pipelineId: string; stage: string; rating: "good" | "bad" }) => Promise<any>;
    rateOverall: (payload: { pipelineId: string; rating: "good" | "neutral" | "bad" }) => Promise<any>;
    clear: () => Promise<any>;
  };
  logs: {
    getSystem: (limit?: number) => Promise<any[]>;
    getBusiness: (payload?: { limit?: number; pipelineId?: string }) => Promise<any[]>;
    createBusiness: (payload: {
      pipelineId?: string;
      node: string;
      status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
      input?: unknown;
      output?: unknown;
      error?: string;
      meta?: Record<string, unknown>;
    }) => Promise<{ id: string }>;
    updateBusiness: (payload: {
      id: string;
      status?: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
      output?: unknown;
      error?: string;
      meta?: Record<string, unknown>;
    }) => Promise<{ ok: boolean }>;
  };
  tts: {
    speak: (payload: { text: string; voice?: string }) => Promise<any>;
  };
  app: {
    getVersion: () => Promise<string>;
    openConsole: () => Promise<any>;
  };
  errorLog: {
    getRecent: (limit?: number) => Promise<Array<{ level: string; timestamp: string; source: string; message: string }>>;
    getCount: () => Promise<number>;
  };
}

declare global {
  interface Window {
    nudgeAPI: NudgeAPI;
  }
}

export {};
