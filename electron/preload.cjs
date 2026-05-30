const { contextBridge, ipcRenderer } = require("electron");

// Whitelist of allowed IPC channels for security
const ALLOWED_CHANNELS = new Set([
  "windows:get-all",
  "windows:get-active",
  "windows:set-monitored",
  "windows:get-monitored",
  "windows:get-capture-stats",
  "windows:get-thumbnails",
  "capture:start",
  "capture:stop",
  "capture:set-interval",
  "capture:set-bg-monitoring",
  "capture:get-bg-monitoring",
  "capture:set-agent-interval",
  "capture:get-agent-interval",
  "capture:get-buffers",
  "capture:take-screenshot",
  "capture:clear-cache",
  "health:get-latest",
  "health:get-config",
  "health:set-config",
  "ocr:initialize",
  "ocr:recognize",
  "agent:detect-backends",
  "agent:set-backend",
  "agent:set-api-config",
  "agent:get-api-config-status",
  "agent:clear-api-config",
  "agent:status",
  "agent:test-scenario",
  "kg:search-entities",
  "kg:get-entity",
  "kg:get-events",
  "kg:get-recent-events",
  "kg:get-stats",
  "kg:get-graph",
  "kg:trigger-summarize",
  "kg:analyze-personality",
  "kg:clear",
  "kg:export",
  "kg:set-pinned",
  "kg:delete-entity",
  "kg:get-entity-detail",
  "kg:run-gc",
  "scheduled-actions:list",
  "scheduled-actions:cancel",
  "prompt-eval:list",
  "prompt-eval:set-status",
  "prompt-eval:run-now",
  "kg:weekly-acceptance",
  "process:timeline",
  "process:pipelines",
  "history:list-actions",
  "history:list-notifications",
  "action:get-detail",
  "privacy:get-blacklist",
  "privacy:set-blacklist",
  "privacy:pause",
  "privacy:resume",
  "privacy:get-pause-state",
  "suggestion:feedback",
  "action:confirm",
  "action:cancel",
  "action:undo-clipboard",
  "pipeline:get-recent",
  "pipeline:get-detail",
  "pipeline:rate-stage",
  "pipeline:rate-overall",
  "pipeline:clear",
  "system-log:list",
  "business-log:list",
  "business-log:create",
  "business-log:update",
  "tts:speak",
  "app:get-version",
  "app:runtime-check",
  "app:open-console",
  "app:toggle-console",
  // 错误日志
  "error-log:get-recent",
  "error-log:get-count",
  // 调度器与告警
  "scheduler:get-status",
  "floating:get-state",
  "floating:clear-unread",
  "floating:drag-start",
  "floating:drag-move",
  "floating:drag-end",
  "floating:set-expanded",
  "toast:set-verbosity",
  "alert:get-recent",
  // 用户偏好
  "prefs:set-ui-language",
  "prefs:get-personality-overrides",
  "prefs:set-personality-overrides",
  "prefs:get-bootstrap-status",
  "prefs:save-bootstrap",
  "prefs:get-trust-levels",
  "prefs:set-trust-level",
  "prefs:reset-trust-levels",
  "prefs:get-retention-days",
  "prefs:set-retention-days",
  "prefs:get-redaction-level",
  "prefs:set-redaction-level",
  "kg:add-negative-pattern",
  "kg:list-negative-patterns",
  "kg:delete-negative-pattern",
  "system:report-online",
  "system:is-online",
  "system:open-app",
  "drafts:list",
  "drafts:dismiss",
  "drafts:promote",
  "outputs:list-past",
  "outputs:list-future",
  "tts:set-enabled",
  "privacy:get-redaction-stats",
  "privacy:reset-redaction-stats",
  // 调试
  "dev:run-sample-pipeline",
  // 权限检测
  "permissions:get-status",
  "permissions:open-settings",
  "permissions:request-screen",
  // 日志系统
  "logger:info",
  "logger:warning",
  "logger:error",
  "logger:business",
  "logger:get-logs"
]);

const ALLOWED_EVENT_CHANNELS = new Set([
  "capture:result",
  "health:update",
  "pipeline:new",
  "pipeline:update",
  "suggestion:new",
  "action:pending",
  "action:result",
  "alert:new",
  "permissions:status",
  "log:stream",
  "floating:state-update",
  "agent:insights"
]);

const invokeChecked = (channel, payload) => {
  if (!ALLOWED_CHANNELS.has(channel)) {
    console.error(`Blocked IPC call to invalid channel: ${channel}`);
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld("ovoAPI", {
  invoke: (channel, payload) => invokeChecked(channel, payload),
  on: (channel, listener) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      console.error(`Blocked IPC event subscription to invalid channel: ${channel}`);
      return () => {};
    }
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  windows: {
    getAll: () => ipcRenderer.invoke("windows:get-all"),
    getActive: () => ipcRenderer.invoke("windows:get-active"),
    setMonitored: (windowKeys) => ipcRenderer.invoke("windows:set-monitored", windowKeys),
    getMonitored: () => ipcRenderer.invoke("windows:get-monitored"),
    getCaptureStats: () => ipcRenderer.invoke("windows:get-capture-stats"),
    getThumbnails: () => ipcRenderer.invoke("windows:get-thumbnails")
  },
  capture: {
    start: (payload) => ipcRenderer.invoke("capture:start", payload),
    stop: () => ipcRenderer.invoke("capture:stop"),
    setInterval: (seconds) => ipcRenderer.invoke("capture:set-interval", seconds),
    setBackgroundMonitoring: (enabled) => ipcRenderer.invoke("capture:set-bg-monitoring", enabled),
    getBackgroundMonitoring: () => ipcRenderer.invoke("capture:get-bg-monitoring"),
    setAgentInterval: (seconds) => ipcRenderer.invoke("capture:set-agent-interval", seconds),
    getAgentInterval: () => ipcRenderer.invoke("capture:get-agent-interval"),
    getBuffers: () => ipcRenderer.invoke("capture:get-buffers"),
    takeScreenshot: () => ipcRenderer.invoke("capture:take-screenshot"),
    clearCache: () => ipcRenderer.invoke("capture:clear-cache")
  },
  health: {
    getLatest: () => ipcRenderer.invoke("health:get-latest"),
    getConfig: () => ipcRenderer.invoke("health:get-config"),
    setConfig: (payload) => ipcRenderer.invoke("health:set-config", payload)
  },
  ocr: {
    initialize: () => ipcRenderer.invoke("ocr:initialize"),
    recognize: (payload) => ipcRenderer.invoke("ocr:recognize", payload)
  },
  agent: {
    status: () => ipcRenderer.invoke("agent:status"),
    detectBackends: () => ipcRenderer.invoke("agent:detect-backends"),
    setBackend: (backend) => ipcRenderer.invoke("agent:set-backend", backend),
    setApiConfig: (config) => ipcRenderer.invoke("agent:set-api-config", config),
    getApiConfigStatus: () => ipcRenderer.invoke("agent:get-api-config-status"),
    clearApiConfig: () => ipcRenderer.invoke("agent:clear-api-config"),
    testScenario: (payload) => ipcRenderer.invoke("agent:test-scenario", payload)
  },
  kg: {
    searchEntities: (payload) => ipcRenderer.invoke("kg:search-entities", payload),
    getEntity: (id) => ipcRenderer.invoke("kg:get-entity", id),
    getEvents: (payload) => ipcRenderer.invoke("kg:get-events", payload),
    getRecentEvents: (limit) => ipcRenderer.invoke("kg:get-recent-events", limit),
    getStats: () => ipcRenderer.invoke("kg:get-stats"),
    getGraph: (limit) => ipcRenderer.invoke("kg:get-graph", limit),
    listScheduledActions: (limit) => ipcRenderer.invoke("scheduled-actions:list", limit),
    cancelScheduledAction: (id) => ipcRenderer.invoke("scheduled-actions:cancel", id),
    triggerSummarize: () => ipcRenderer.invoke("kg:trigger-summarize"),
    analyzePersonality: () => ipcRenderer.invoke("kg:analyze-personality"),
    // SEC-16 二次握手：第一次调用拿 confirmToken，带 token 再调一次才真执行。
    // 之前 UI 只调一次 → 永远停在 requiresConfirm → 「清理数据不生效」。这里在
    // 包装层自动完成两步。人工闸门是调用方的 window.confirm 对话框。
    clear: async () => {
      const first = await ipcRenderer.invoke("kg:clear");
      if (first && first.requiresConfirm && first.confirmToken) {
        return ipcRenderer.invoke("kg:clear", { confirmToken: first.confirmToken });
      }
      return first;
    },
    export: async () => {
      const first = await ipcRenderer.invoke("kg:export");
      if (first && first.requiresConfirm && first.confirmToken) {
        return ipcRenderer.invoke("kg:export", { confirmToken: first.confirmToken });
      }
      return first;
    },
    setPinned: (payload) => ipcRenderer.invoke("kg:set-pinned", payload),
    deleteEntity: (entityId) => ipcRenderer.invoke("kg:delete-entity", entityId),
    getEntityDetail: (entityId) => ipcRenderer.invoke("kg:get-entity-detail", entityId),
    runGC: () => ipcRenderer.invoke("kg:run-gc"),
    // PHIL-1 / P0.4: 玻璃管家 negative patterns
    addNegativePattern: (payload) => ipcRenderer.invoke("kg:add-negative-pattern", payload),
    listNegativePatterns: (limit) => ipcRenderer.invoke("kg:list-negative-patterns", limit),
    deleteNegativePattern: (id) => ipcRenderer.invoke("kg:delete-negative-pattern", id)
  },
  promptEval: {
    list: (limit) => ipcRenderer.invoke("prompt-eval:list", limit),
    setStatus: (payload) => ipcRenderer.invoke("prompt-eval:set-status", payload),
    runNow: () => ipcRenderer.invoke("prompt-eval:run-now")
  },
  insights: {
    weeklyAcceptance: () => ipcRenderer.invoke("kg:weekly-acceptance")
  },
  process: {
    getTimeline: (limit) => ipcRenderer.invoke("process:timeline", limit),
    getPipelines: (limit) => ipcRenderer.invoke("process:pipelines", limit)
  },
  history: {
    listActions: (limit) => ipcRenderer.invoke("history:list-actions", limit),
    listNotifications: (limit) => ipcRenderer.invoke("history:list-notifications", limit)
  },
  privacy: {
    getBlacklist: () => ipcRenderer.invoke("privacy:get-blacklist"),
    setBlacklist: (apps) => ipcRenderer.invoke("privacy:set-blacklist", apps),
    pause: (minutes) => ipcRenderer.invoke("privacy:pause", minutes),
    resume: () => ipcRenderer.invoke("privacy:resume"),
    getPauseState: () => ipcRenderer.invoke("privacy:get-pause-state"),
    // DATA-12: 脱敏命中累计
    getRedactionStats: () => ipcRenderer.invoke("privacy:get-redaction-stats"),
    resetRedactionStats: () => ipcRenderer.invoke("privacy:reset-redaction-stats")
  },
  suggestion: {
    feedback: (payload) => ipcRenderer.invoke("suggestion:feedback", payload)
  },
  action: {
    confirm: (payload) => ipcRenderer.invoke("action:confirm", payload),
    getDetail: (actionId) => ipcRenderer.invoke("action:get-detail", actionId),
    cancel: (payload) => ipcRenderer.invoke("action:cancel", payload),
    undoClipboard: (actionId) => ipcRenderer.invoke("action:undo-clipboard", actionId)
  },
  drafts: {
    list: (limit) => ipcRenderer.invoke("drafts:list", limit),
    promote: (id) => ipcRenderer.invoke("drafts:promote", id),
    dismiss: (id) => ipcRenderer.invoke("drafts:dismiss", id)
  },
  outputs: {
    listPast: (limit) => ipcRenderer.invoke("outputs:list-past", limit),
    listFuture: () => ipcRenderer.invoke("outputs:list-future")
  },
  pipeline: {
    getRecent: (limit) => ipcRenderer.invoke("pipeline:get-recent", limit),
    getDetail: (id) => ipcRenderer.invoke("pipeline:get-detail", id),
    rateStage: (payload) => ipcRenderer.invoke("pipeline:rate-stage", payload),
    rateOverall: (payload) => ipcRenderer.invoke("pipeline:rate-overall", payload),
    clear: () => ipcRenderer.invoke("pipeline:clear")
  },
  logs: {
    getSystem: (limit) => ipcRenderer.invoke("system-log:list", limit),
    getBusiness: (payload) => ipcRenderer.invoke("business-log:list", payload),
    createBusiness: (payload) => ipcRenderer.invoke("business-log:create", payload),
    updateBusiness: (payload) => ipcRenderer.invoke("business-log:update", payload)
  },
  // 日志系统接口 - 暴露给前端页面使用
  logger: {
    info: (source, message, context) => ipcRenderer.invoke("logger:info", { source, message, context }),
    warning: (source, message, context) => ipcRenderer.invoke("logger:warning", { source, message, context }),
    error: (source, message, context) => ipcRenderer.invoke("logger:error", { source, message, context }),
    logBusiness: (options) => ipcRenderer.invoke("logger:business", options),
    getLogs: (type, limit) => ipcRenderer.invoke("logger:get-logs", { type, limit })
  },
  tts: {
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload),
    setEnabled: (enabled) => ipcRenderer.invoke("tts:set-enabled", enabled)
  },
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    runtimeCheck: () => ipcRenderer.invoke("app:runtime-check"),
    openConsole: () => ipcRenderer.invoke("app:open-console"),
    toggleConsole: () => ipcRenderer.invoke("app:toggle-console")
  },
  errorLog: {
    getRecent: (limit) => ipcRenderer.invoke("error-log:get-recent", limit),
    getCount: () => ipcRenderer.invoke("error-log:get-count")
  },
  permissions: {
    getStatus: () => ipcRenderer.invoke("permissions:get-status"),
    openSettings: (payload) => ipcRenderer.invoke("permissions:open-settings", payload),
    requestScreen: () => ipcRenderer.invoke("permissions:request-screen")
  },
  scheduler: {
    getStatus: () => ipcRenderer.invoke("scheduler:get-status")
  },
  floating: {
    getState: () => ipcRenderer.invoke("floating:get-state"),
    clearUnread: () => ipcRenderer.invoke("floating:clear-unread"),
    dragStart: () => ipcRenderer.invoke("floating:drag-start"),
    dragMove: (payload) => ipcRenderer.invoke("floating:drag-move", payload),
    dragEnd: () => ipcRenderer.invoke("floating:drag-end"),
    setExpanded: (expanded) => ipcRenderer.invoke("floating:set-expanded", expanded)
  },
  toast: {
    setVerbosity: (v) => ipcRenderer.invoke("toast:set-verbosity", v)
  },
  alerts: {
    getRecent: (limit) => ipcRenderer.invoke("alert:get-recent", limit)
  },
  // T13 / M8: 系统事件 — 网络状态上报
  system: {
    reportOnline: (online) => ipcRenderer.invoke("system:report-online", online),
    isOnline: () => ipcRenderer.invoke("system:is-online"),
    openApp: (payload) => ipcRenderer.invoke("system:open-app", payload)
  },
  prefs: {
    setUiLanguage: (lang) => ipcRenderer.invoke("prefs:set-ui-language", lang),
    getPersonalityOverrides: () => ipcRenderer.invoke("prefs:get-personality-overrides"),
    setPersonalityOverrides: (overrides) => ipcRenderer.invoke("prefs:set-personality-overrides", overrides),
    getBootstrapStatus: () => ipcRenderer.invoke("prefs:get-bootstrap-status"),
    saveBootstrap: (payload) => ipcRenderer.invoke("prefs:save-bootstrap", payload),
    // 信任分级（P0.3 / P0.10）
    getTrustLevels: () => ipcRenderer.invoke("prefs:get-trust-levels"),
    setTrustLevel: (payload) => ipcRenderer.invoke("prefs:set-trust-level", payload),
    resetTrustLevels: () => ipcRenderer.invoke("prefs:reset-trust-levels"),
    // 隐私核心（P0.11）
    getRetentionDays: () => ipcRenderer.invoke("prefs:get-retention-days"),
    setRetentionDays: (days) => ipcRenderer.invoke("prefs:set-retention-days", days),
    getRedactionLevel: () => ipcRenderer.invoke("prefs:get-redaction-level"),
    setRedactionLevel: (level) => ipcRenderer.invoke("prefs:set-redaction-level", level)
  },
  dev: {
    runSamplePipeline: () => ipcRenderer.invoke("dev:run-sample-pipeline")
  }
});
