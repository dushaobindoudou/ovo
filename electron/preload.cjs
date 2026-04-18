const { contextBridge, ipcRenderer } = require("electron");

// Whitelist of allowed IPC channels for security
const ALLOWED_CHANNELS = new Set([
  "windows:get-all",
  "windows:get-active",
  "windows:set-monitored",
  "windows:get-monitored",
  "windows:get-capture-stats",
  "capture:start",
  "capture:stop",
  "capture:set-interval",
  "capture:get-buffers",
  "capture:take-screenshot",
  "health:get-latest",
  "health:get-config",
  "health:set-config",
  "ocr:initialize",
  "ocr:recognize",
  "agent:detect-backends",
  "agent:set-backend",
  "agent:set-api-config",
  "agent:status",
  "agent:test-scenario",
  "kg:search-entities",
  "kg:get-entity",
  "kg:get-events",
  "kg:get-stats",
  "kg:analyze-personality",
  "kg:clear",
  "kg:export",
  "suggestion:feedback",
  "action:confirm",
  "action:cancel",
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
  "app:open-console",
  // 错误日志
  "error-log:get-recent",
  "error-log:get-count",
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
  "action:result"
]);

const invokeChecked = (channel, payload) => {
  if (!ALLOWED_CHANNELS.has(channel)) {
    console.error(`Blocked IPC call to invalid channel: ${channel}`);
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld("nudgeAPI", {
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
    getCaptureStats: () => ipcRenderer.invoke("windows:get-capture-stats")
  },
  capture: {
    start: (payload) => ipcRenderer.invoke("capture:start", payload),
    stop: () => ipcRenderer.invoke("capture:stop"),
    setInterval: (seconds) => ipcRenderer.invoke("capture:set-interval", seconds),
    getBuffers: () => ipcRenderer.invoke("capture:get-buffers"),
    takeScreenshot: () => ipcRenderer.invoke("capture:take-screenshot")
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
    testScenario: (payload) => ipcRenderer.invoke("agent:test-scenario", payload)
  },
  kg: {
    searchEntities: (payload) => ipcRenderer.invoke("kg:search-entities", payload),
    getEntity: (id) => ipcRenderer.invoke("kg:get-entity", id),
    getEvents: (limit) => ipcRenderer.invoke("kg:get-events", limit),
    getStats: () => ipcRenderer.invoke("kg:get-stats"),
    analyzePersonality: () => ipcRenderer.invoke("kg:analyze-personality"),
    clear: () => ipcRenderer.invoke("kg:clear"),
    export: () => ipcRenderer.invoke("kg:export")
  },
  suggestion: {
    feedback: (payload) => ipcRenderer.invoke("suggestion:feedback", payload)
  },
  action: {
    confirm: (payload) => ipcRenderer.invoke("action:confirm", payload),
    cancel: (payload) => ipcRenderer.invoke("action:cancel", payload)
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
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload)
  },
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    openConsole: () => ipcRenderer.invoke("app:open-console")
  },
  errorLog: {
    getRecent: (limit) => ipcRenderer.invoke("error-log:get-recent", limit),
    getCount: () => ipcRenderer.invoke("error-log:get-count")
  }
});
