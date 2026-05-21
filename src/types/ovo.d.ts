/**
 * Action 类型 — 与 electron/types.ts ActionType 必须保持同步。
 * 用于 prefs:set-trust-level 等需要类型收窄的 IPC。
 */
export type ActionType =
  | "log_note"
  | "create_todo"
  | "send_email"
  | "send_imessage"
  | "copy_to_clipboard"
  | "search"
  | "search_web"
  | "open_url"
  | "open_app"
  | "summarize"
  | "set_reminder"
  | "add_calendar"
  | "index_path"
  | "other";

export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export type OvoInvokeChannel =
  | "windows:get-all"
  | "windows:get-active"
  | "windows:set-monitored"
  | "windows:get-monitored"
  | "windows:get-capture-stats"
  | "windows:get-thumbnails"
  | "capture:start"
  | "capture:stop"
  | "capture:set-interval"
  | "capture:set-bg-monitoring"
  | "capture:get-bg-monitoring"
  | "capture:set-agent-interval"
  | "capture:get-agent-interval"
  | "capture:get-buffers"
  | "capture:take-screenshot"
  | "capture:clear-cache"
  | "health:get-latest"
  | "health:get-config"
  | "health:set-config"
  | "ocr:initialize"
  | "ocr:recognize"
  | "agent:detect-backends"
  | "agent:set-backend"
  | "agent:set-api-config"
  | "agent:get-api-config-status"
  | "agent:clear-api-config"
  | "agent:status"
  | "agent:test-scenario"
  | "kg:search-entities"
  | "kg:get-entity"
  | "kg:get-events"
  | "kg:get-recent-events"
  | "kg:get-stats"
  | "kg:get-graph"
  | "kg:trigger-summarize"
  | "kg:analyze-personality"
  | "kg:clear"
  | "kg:export"
  | "kg:set-pinned"
  | "kg:delete-entity"
  | "kg:get-entity-detail"
  | "kg:run-gc"
  | "prompt-eval:list"
  | "prompt-eval:set-status"
  | "prompt-eval:run-now"
  | "kg:weekly-acceptance"
  | "process:timeline"
  | "process:pipelines"
  | "history:list-actions"
  | "history:list-notifications"
  | "action:get-detail"
  | "privacy:get-blacklist"
  | "privacy:set-blacklist"
  | "privacy:pause"
  | "privacy:resume"
  | "privacy:get-pause-state"
  | "suggestion:feedback"
  | "action:confirm"
  | "action:cancel"
  | "drafts:list"
  | "drafts:promote"
  | "drafts:dismiss"
  | "outputs:list-past"
  | "outputs:list-future"
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
  | "tts:set-enabled"
  | "app:get-version"
  | "app:runtime-check"
  | "app:open-console"
  | "app:toggle-console"
  | "error-log:get-recent"
  | "error-log:get-count"
  | "scheduler:get-status"
  | "floating:get-state"
  | "floating:clear-unread"
  | "floating:drag-start"
  | "floating:drag-move"
  | "floating:drag-end"
  | "floating:set-expanded"
  | "toast:set-verbosity"
  | "alert:get-recent"
  | "prefs:get-personality-overrides"
  | "prefs:set-personality-overrides"
  | "prefs:get-bootstrap-status"
  | "prefs:save-bootstrap"
  | "prefs:get-trust-levels"
  | "prefs:set-trust-level"
  | "prefs:reset-trust-levels"
  | "prefs:get-retention-days"
  | "prefs:set-retention-days"
  | "prefs:get-redaction-level"
  | "prefs:set-redaction-level"
  | "kg:add-negative-pattern"
  | "kg:list-negative-patterns"
  | "kg:delete-negative-pattern"
  | "system:report-online"
  | "system:is-online"
  | "system:open-app"
  | "privacy:get-redaction-stats"
  | "privacy:reset-redaction-stats"
  | "dev:run-sample-pipeline"
  | "permissions:get-status"
  | "permissions:open-settings"
  | "permissions:request-screen"
  | "logger:info"
  | "logger:warning"
  | "logger:error"
  | "logger:business"
  | "logger:get-logs";

export type OvoEventChannel =
  | "capture:result"
  | "health:update"
  | "pipeline:new"
  | "pipeline:update"
  | "suggestion:new"
  | "action:pending"
  | "action:result"
  | "alert:new"
  | "permissions:status"
  | "log:stream"
  | "floating:state-update"
  | "agent:insights";

/**
 * Q1: ovo 长期能为用户做的"持续服务"，不是一次性 action。
 */
export interface OvoOffer {
  id: string;
  title: string;
  value_prop: string;
  first_action_preview?: string;
  frequency: "daily" | "weekly" | "event-driven" | "one-shot";
  needs_capability?: string;
  confidence: number;
}

export interface UserRoleHypothesis {
  role: string;
  evidence: string[];
  confidence: number;
}

export interface AgentInsightsPayload {
  pipelineId: string;
  timestamp: number;
  appName: string;
  windowTitle: string;
  role?: UserRoleHypothesis;
  latentIntent?: string;
  offers?: OvoOffer[];
  /** R4: 用户下一步行为预测，悬浮球 + 概览顶部突出展示 */
  prediction?: string;
  intent?: string;
  summary?: string;
}

export interface FloatingStatePayload {
  /** O1: LLM 给的 30 字以内卡片标题，跨职业说人话 */
  summary: string | null;
  activeApp: string | null;
  activeWindowTitle: string | null;
  pipelineStatus: "idle" | "thinking" | "generating" | "alert";
  unreadCount: number;
  lastPipelineAt: number;
  lastRiskLevel: "none" | "low" | "medium" | "high" | "critical";
}

export interface LogStreamEntry {
  timestamp: number;
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  context: Record<string, unknown>;
}

export type AlertLevel = "info" | "warn" | "error" | "critical";

export interface AlertPayload {
  level: AlertLevel;
  timestamp: string;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface SchedulerTaskStatusPayload {
  id: string;
  intervalMs: number;
  lastRunAt: number;
  lastDurationMs: number;
  runCount: number;
  errorCount: number;
  running: boolean;
  lastError?: string;
  queueSize?: number;
}

export interface PermissionsStatusPayload {
  screen: string;
  timestamp: number;
}

export interface PermissionsFullStatus {
  screenRecording: string;
  camera: string;
  microphone: string;
}

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
  /** action 类型，决定执行路径 + 信任分级（与 electron/types.ts ActionType 同步） */
  type?: ActionType;
  /** PHIL-1: 玻璃管家三层叙述中的"因为" — LLM 给的执行理由（可选） */
  reason?: string;
}

export interface ActionResultPayload {
  actionId: string;
  status: string;
  output: string;
  duration: number;
  error?: string;
}

export interface OvoEventPayloadMap {
  "capture:result": any;
  "health:update": HealthPayload;
  "pipeline:new": any;
  "pipeline:update": any;
  "suggestion:new": any[];
  "action:pending": { pipelineId: string; actions: AgentAction[] };
  "action:result": { pipelineId: string; results: ActionResultPayload[] };
  "alert:new": AlertPayload;
  "permissions:status": PermissionsStatusPayload;
  "log:stream": LogStreamEntry;
  "floating:state-update": FloatingStatePayload;
  "agent:insights": AgentInsightsPayload;
}

export interface OvoInvokePayloadMap {
  "windows:get-all": undefined;
  "windows:get-active": undefined;
  "windows:set-monitored": string[];
  "windows:get-monitored": undefined;
  "windows:get-capture-stats": undefined;
  "windows:get-thumbnails": undefined;
  "capture:start": { intervalSeconds?: number } | undefined;
  "capture:stop": undefined;
  "capture:set-interval": number;
  "capture:set-bg-monitoring": boolean;
  "capture:get-bg-monitoring": undefined;
  "capture:set-agent-interval": number;
  "capture:get-agent-interval": undefined;
  "capture:get-buffers": undefined;
  "capture:take-screenshot": undefined;
  "capture:clear-cache": undefined;
  "health:get-latest": undefined;
  "health:get-config": undefined;
  "health:set-config": { enabled?: boolean; intervalSeconds?: number };
  "ocr:initialize": undefined;
  "ocr:recognize": { base64?: string } | undefined;
  "agent:detect-backends": undefined;
  "agent:set-backend": string;
  "agent:set-api-config": AgentApiConfig;
  "agent:get-api-config-status": undefined;
  "agent:clear-api-config": undefined;
  "agent:status": undefined;
  "agent:test-scenario": { scenarioId: string; customPrompt?: string };
  "kg:search-entities": string;
  "kg:get-entity": string;
  "kg:get-events": number | { entityId?: string; limit?: number } | undefined;
  "kg:get-recent-events": number | undefined;
  "kg:get-stats": undefined;
  "kg:get-graph": number | undefined;
  "kg:trigger-summarize": undefined;
  "kg:analyze-personality": undefined;
  "kg:clear": undefined;
  "kg:export": undefined;
  "kg:set-pinned": { entityId: string; pinned: boolean };
  "kg:delete-entity": string;
  "kg:get-entity-detail": string;
  "kg:run-gc": undefined;
  "prompt-eval:list": number | undefined;
  "prompt-eval:set-status": { id: string; status: "applied" | "dismissed" | "pending" };
  "prompt-eval:run-now": undefined;
  "kg:weekly-acceptance": undefined;
  "process:timeline": number | undefined;
  "process:pipelines": number | undefined;
  "history:list-actions": number | undefined;
  "history:list-notifications": number | undefined;
  "action:get-detail": string;
  "privacy:get-blacklist": undefined;
  "privacy:set-blacklist": string[];
  "privacy:pause": number;
  "privacy:resume": undefined;
  "privacy:get-pause-state": undefined;
  "suggestion:feedback": any;
  "action:confirm": { actionId?: string; action?: AgentAction; pipelineId?: string };
  "action:cancel": { actionId: string; pipelineId?: string };
  "drafts:list": number | undefined;
  "drafts:promote": string;
  "drafts:dismiss": string;
  "outputs:list-past": number | undefined;
  "outputs:list-future": undefined;
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
  "tts:set-enabled": boolean;
  "app:get-version": undefined;
  "app:runtime-check": undefined;
  "app:open-console": undefined;
  "app:toggle-console": undefined;
  "error-log:get-recent": number | undefined;
  "error-log:get-count": undefined;
  "scheduler:get-status": undefined;
  "floating:get-state": undefined;
  "floating:clear-unread": undefined;
  "floating:drag-start": undefined;
  "floating:drag-move": { dx: number; dy: number };
  "floating:drag-end": undefined;
  "floating:set-expanded": boolean;
  "toast:set-verbosity": "silent" | "alerts" | "all";
  "alert:get-recent": number | undefined;
  "prefs:get-personality-overrides": undefined;
  "prefs:set-personality-overrides": Record<string, number>;
  "prefs:get-bootstrap-status": undefined;
  "prefs:save-bootstrap": { interests: string[]; currentProject: string; roles: string[] };
  "prefs:get-trust-levels": undefined;
  "prefs:set-trust-level": { type: ActionType; level: 0 | 1 | 2 | 3 | 4 };
  "prefs:reset-trust-levels": undefined;
  "prefs:get-retention-days": undefined;
  "prefs:set-retention-days": number;
  "prefs:get-redaction-level": undefined;
  "prefs:set-redaction-level": "basic" | "strict" | "paranoid";
  "kg:add-negative-pattern": { appName?: string; intent?: string; actionType?: ActionType; patternText: string; contextSignature?: string };
  "kg:list-negative-patterns": number | undefined;
  "kg:delete-negative-pattern": string;
  "system:report-online": boolean;
  "system:is-online": undefined;
  "system:open-app": { app?: string; bundleId?: string };
  "privacy:get-redaction-stats": undefined;
  "privacy:reset-redaction-stats": undefined;
  "dev:run-sample-pipeline": undefined;
  "permissions:get-status": undefined;
  "permissions:open-settings": { target?: "screen" | "camera" | "microphone" } | undefined;
  "permissions:request-screen": undefined;
  "logger:info": { source: string; message: string; context?: Record<string, unknown> };
  "logger:warning": { source: string; message: string; context?: Record<string, unknown> };
  "logger:error": { source: string; message: string; context?: Record<string, unknown> };
  "logger:business": {
    pipelineId?: string;
    node: string;
    status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
    input?: unknown;
    output?: unknown;
    error?: string;
    meta?: Record<string, unknown>;
  };
  "logger:get-logs": { type?: "system" | "business"; limit?: number } | undefined;
}

export type OvoInvokeResultMap = Record<OvoInvokeChannel, any>;

export interface OvoAPI {
  on: <TChannel extends OvoEventChannel>(
    channel: TChannel,
    listener: (payload: OvoEventPayloadMap[TChannel]) => void
  ) => () => void;
  invoke: <TChannel extends OvoInvokeChannel>(
    channel: TChannel,
    payload?: OvoInvokePayloadMap[TChannel]
  ) => Promise<OvoInvokeResultMap[TChannel]>;
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
    getThumbnails: () => Promise<
      Array<{
        windowId: string;
        appName: string;
        windowTitle: string;
        thumbnail: string;
        sourceId: string;
        isActive?: boolean;
      }>
    >;
  };
  capture: {
    start: (payload?: { intervalSeconds?: number }) => Promise<any>;
    stop: () => Promise<any>;
    setInterval: (seconds: number) => Promise<any>;
    setBackgroundMonitoring: (enabled: boolean) => Promise<{ ok: boolean; enabled: boolean }>;
    getBackgroundMonitoring: () => Promise<boolean>;
    setAgentInterval: (seconds: number) => Promise<{ ok: boolean; seconds: number }>;
    getAgentInterval: () => Promise<number>;
    getBuffers: () => Promise<any[]>;
    takeScreenshot: () => Promise<{
      dataUrl: string;
      mimeType: string;
      byteLength: number;
      capturedAt: number;
    }>;
    clearCache: () => Promise<{ ok: boolean; clearedAt: number }>;
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
    setApiConfig: (config: AgentApiConfig) => Promise<{ ok: boolean; error?: string }>;
    getApiConfigStatus: () => Promise<{
      hasKey: boolean;
      maskedKey: string;
      baseUrl: string;
      model: string;
      encryptionAvailable: boolean;
    }>;
    clearApiConfig: () => Promise<{ ok: boolean }>;
    testScenario: (payload: { scenarioId: string; customPrompt?: string }) => Promise<any>;
  };
  kg: {
    searchEntities: (query: string) => Promise<any[]>;
    getEntity: (id: string) => Promise<any>;
    getEvents: (payload?: number | { entityId?: string; limit?: number }) => Promise<any[]>;
    /** U2 时间线视图：拉最近 memory_events（含 5W actor 字段） */
    getRecentEvents: (limit?: number) => Promise<Array<{
      id: string;
      timestamp: number;
      appName: string;
      windowTitle: string;
      content: string;
      summary: string;
      intent: string;
      importance: number;
      sourceWindowId: string;
      actor?: "self" | "other" | "system" | "ovo" | "unknown" | null;
      actorName?: string | null;
    }>>;
    getStats: () => Promise<any>;
    getGraph: (limit?: number) => Promise<{
      nodes: Array<{ id: string; name: string; type: string; description?: string; mentionCount: number; lastSeen: number }>;
      edges: Array<{ id: string; sourceId: string; targetId: string; relation: string; strength: number; updatedAt: number }>;
    }>;
    triggerSummarize: () => Promise<{ ok: boolean }>;
    analyzePersonality: () => Promise<any>;
    clear: () => Promise<any>;
    export: () => Promise<any>;
    setPinned: (payload: { entityId: string; pinned: boolean }) => Promise<{ ok: boolean }>;
    deleteEntity: (entityId: string) => Promise<{ ok: boolean; relationsDeleted: number }>;
    getEntityDetail: (entityId: string) => Promise<{
      entity: {
        id: string; name: string; type: string; description: string;
        attributes: Record<string, unknown>;
        mentionCount: number; importance: number;
        qualityScore: number; pinned: boolean;
        firstSeen: number; lastSeen: number; lastReferencedAt: number;
      } | null;
      relations: Array<{ direction: "out" | "in"; relation: string; otherId: string; otherName: string; otherType: string; strength: number; context: string }>;
      eventCount: number;
    }>;
    runGC: () => Promise<{ deleted: number; rescored: number }>;
    // PHIL-1 / P0.4: negative patterns
    addNegativePattern: (payload: {
      appName?: string;
      intent?: string;
      actionType?: ActionType;
      patternText: string;
      contextSignature?: string;
    }) => Promise<{ ok: boolean; id?: string; error?: string }>;
    listNegativePatterns: (limit?: number) => Promise<Array<{
      id: string; created_at: number;
      app_name: string | null; intent: string | null;
      action_type: string | null; pattern_text: string;
      context_signature: string | null;
      hit_count: number; last_hit_at: number | null;
    }>>;
    deleteNegativePattern: (id: string) => Promise<{ ok: boolean }>;
  };
  promptEval: {
    list: (limit?: number) => Promise<Array<{
      id: string; created_at: number; scope: string; problem: string;
      proposed_change: string; evidence: string; confidence: number; status: string;
    }>>;
    setStatus: (payload: { id: string; status: "applied" | "dismissed" | "pending" }) => Promise<{ ok: boolean }>;
    runNow: () => Promise<{ ok: boolean; started: boolean }>;
  };
  insights: {
    weeklyAcceptance: () => Promise<{
      thisWeek: { total: number; accepted: number; rate: number };
      prevWeek: { total: number; accepted: number; rate: number };
      delta: number;
      confidenceLevel: "low" | "ok" | "good";
    }>;
  };
  process: {
    getTimeline: (limit?: number) => Promise<Array<{
      id: string;
      timestamp: number;
      kind: "capture" | "llm_call" | "action" | "kg_mutation" | "other";
      title: string;
      subtitle: string;
      pipelineId?: string;
      payload?: Record<string, unknown>;
    }>>;
    getPipelines: (limit?: number) => Promise<Array<{
      id: string;
      timestamp: number;
      duration: number;
      status: "completed" | "failed" | "running";
      appName: string;
      windowTitle: string;
      summary: string;
      phases: Array<{
        key: string;
        label: string;
        status: "done" | "failed" | "skipped" | "pending";
        brief: string;
        durationMs?: number;
      }>;
      detail: {
        capture: { ocrPreview: string; charCount: number; appName: string; windowTitle: string };
        understand: {
          intent: string; prediction: string; role: string; roleConfidence: number;
          latentIntent: string; risk: string; offerCount: number; suggestionCount: number; durationSec: number;
          promptPreview: string; rawResponse: string;
        };
        act: {
          executed: number; pending: number;
          items: Array<{ description: string; status: string; output: string }>;
        };
        remember: { newEntities: number; newRelationships: number; topEntityNames: string[] };
        relate: { added: number; reinforced: number; durationMs: number };
      };
    }>>;
  };
  history: {
    listActions: (limit?: number) => Promise<Array<{
      id: string;
      timestamp: number;
      type: string;
      actionId: string;
      status: "success" | "failed" | "cancelled" | "timeout" | "pending";
      description: string;
      preview: string;
      error?: string;
      confirmedByUser: boolean;
      pipelineId?: string;
      appName?: string;
      windowTitle?: string;
    }>>;
    listNotifications: (limit?: number) => Promise<Array<{
      id: string;
      timestamp: number;
      title: string;
      type: string;
      priority: number;
      tier: string;
      content: string;
    }>>;
  };
  privacy: {
    getBlacklist: () => Promise<string[]>;
    setBlacklist: (apps: string[]) => Promise<{ ok: boolean }>;
    pause: (minutes: number) => Promise<{ ok: boolean; pausedUntil: number }>;
    resume: () => Promise<{ ok: boolean }>;
    getPauseState: () => Promise<{ pausedUntil: number; isPaused: boolean }>;
    // DATA-12: 脱敏命中累计
    getRedactionStats: () => Promise<{ total: number; byType: Record<string, number> }>;
    resetRedactionStats: () => Promise<{ ok: boolean }>;
  };
  suggestion: {
    feedback: (payload: any) => Promise<any>;
  };
  action: {
    confirm: (payload: { actionId?: string; action?: any; pipelineId?: string }) => Promise<any>;
    cancel: (payload: { actionId: string; pipelineId?: string }) => Promise<any>;
    getDetail: (actionId: string) => Promise<ActionDetail | null>;
  };
  drafts: {
    list: (limit?: number) => Promise<Array<{
      id: string;
      createdAt: number;
      actionId: string;
      actionType: string;
      description: string;
      params: Record<string, unknown>;
      evidenceLevel: string;
      evidence: string[];
      groundingStatus: string;
      groundingReason: string;
      appName?: string;
      windowTitle?: string;
      pipelineId?: string;
    }>>;
    promote: (id: string) => Promise<{ ok: boolean; result?: any; error?: string }>;
    dismiss: (id: string) => Promise<{ ok: boolean }>;
  };
  outputs: {
    listPast: (limit?: number) => Promise<Array<{
      actionId: string;
      type: string;
      description: string;
      status: string;
      timestamp: number;
      pipelineId?: string;
      params?: Record<string, unknown>;
      output?: string;
    }>>;
    listFuture: () => Promise<{
      reminders: Array<{ name: string; dueAt?: string; listName?: string; completed: boolean }>;
      events: Array<{ title: string; startsAt: string; endsAt?: string; calendarName?: string; location?: string }>;
    }>;
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
    setEnabled: (enabled: boolean) => Promise<{ ok: boolean }>;
  };
  app: {
    getVersion: () => Promise<string>;
    runtimeCheck: () => Promise<{
      ok: boolean;
      version: string;
      channels: {
        takeScreenshot: boolean;
        openSettings: boolean;
      };
    }>;
    openConsole: () => Promise<any>;
    toggleConsole: () => Promise<{ ok: boolean; visible: boolean }>;
  };
  errorLog: {
    getRecent: (limit?: number) => Promise<Array<{ level: string; timestamp: string; source: string; message: string }>>;
    getCount: () => Promise<number>;
  };
  permissions: {
    getStatus: () => Promise<PermissionsFullStatus>;
    openSettings: (payload?: { target?: "screen" | "camera" | "microphone" }) => Promise<{ ok: boolean }>;
    requestScreen: () => Promise<PermissionsStatusPayload>;
  };
  scheduler: {
    getStatus: () => Promise<SchedulerTaskStatusPayload[]>;
  };
  floating: {
    getState: () => Promise<FloatingStatePayload>;
    clearUnread: () => Promise<{ ok: boolean }>;
    dragStart: () => Promise<{ ok: boolean }>;
    dragMove: (payload: { dx: number; dy: number }) => Promise<{ ok: boolean }>;
    dragEnd: () => Promise<{ ok: boolean }>;
    setExpanded: (expanded: boolean) => Promise<{ ok: boolean; height: number }>;
  };
  toast: {
    setVerbosity: (v: "silent" | "alerts" | "all") => Promise<{ ok: boolean; verbosity: string }>;
  };
  alerts: {
    getRecent: (limit?: number) => Promise<AlertPayload[]>;
  };
  // T13 / M8: 系统事件 — 网络状态
  system: {
    reportOnline: (online: boolean) => Promise<{ ok: boolean }>;
    isOnline: () => Promise<boolean>;
    /** 打开外部 macOS 应用（白名单内 stock app 或合法 bundleId）。用于 ActionDetailDrawer "去现场看" 按钮 */
    openApp: (payload: { app?: string; bundleId?: string }) => Promise<{ ok: boolean; error?: string }>;
  };
  prefs: {
    setUiLanguage: (lang: "zh" | "en" | "system") => Promise<{ ok: boolean }>;
    getPersonalityOverrides: () => Promise<Record<string, number>>;
    setPersonalityOverrides: (overrides: Record<string, number>) => Promise<{ ok: boolean }>;
    getBootstrapStatus: () => Promise<{
      done: boolean;
      interests: string[];
      currentProject: string;
      roles: string[];
    }>;
    saveBootstrap: (payload: { interests: string[]; currentProject: string; roles: string[] }) => Promise<{ ok: boolean }>;
    // 信任分级（P0.3 / P0.10）
    getTrustLevels: () => Promise<Record<ActionType, TrustLevel>>;
    setTrustLevel: (payload: { type: ActionType; level: TrustLevel }) => Promise<{ ok: boolean; error?: string }>;
    resetTrustLevels: () => Promise<{ ok: boolean }>;
    // 隐私核心（P0.11）
    getRetentionDays: () => Promise<number>;
    setRetentionDays: (days: number) => Promise<{ ok: boolean; error?: string }>;
    getRedactionLevel: () => Promise<"basic" | "strict" | "paranoid">;
    setRedactionLevel: (level: "basic" | "strict" | "paranoid") => Promise<{ ok: boolean; error?: string }>;
  };
  dev: {
    runSamplePipeline: () => Promise<{ ok: boolean; pipelinesAdded: number; entitiesAdded: number }>;
  };
  logger: {
    info: (source: string, message: string, context?: Record<string, unknown>) => Promise<{ ok: boolean }>;
    warning: (source: string, message: string, context?: Record<string, unknown>) => Promise<{ ok: boolean }>;
    error: (source: string, message: string, context?: Record<string, unknown>) => Promise<{ ok: boolean }>;
    logBusiness: (options: {
      pipelineId?: string;
      node: string;
      status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
      input?: unknown;
      output?: unknown;
      error?: string;
      meta?: Record<string, unknown>;
    }) => Promise<{ id: string }>;
    getLogs: (type?: "system" | "business", limit?: number) => Promise<any[]>;
  };
}

// C: ActionDetail——给 ActionDetailDrawer 用
export interface ActionDetail {
  actionId: string;
  found: boolean;
  type?: string;
  description?: string;
  params?: Record<string, unknown>;
  requireConfirm?: boolean;
  status?: string;
  output?: string;
  error?: string;
  confirmedByUser?: boolean;
  startedAt?: number;
  durationMs?: number;
  pipelineId?: string;
  pipelineStartedAt?: number;
  appName?: string;
  windowTitle?: string;
  ocrPreview?: string;
  intent?: string;
  summary?: string;
  prediction?: string;
  siblingActions?: Array<{
    id: string;
    type: string;
    description: string;
    status: string;
  }>;
  siblingSuggestions?: Array<{ title: string }>;
  timeline?: Array<{
    node: string;
    status: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    error?: string;
  }>;
}

declare global {
  interface Window {
    ovoAPI: OvoAPI;
  }
}

export {};
