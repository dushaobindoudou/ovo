const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nudgeAPI", {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  windows: {
    getAll: () => ipcRenderer.invoke("windows:get-all"),
    getActive: () => ipcRenderer.invoke("windows:get-active"),
    setMonitored: (windowKeys) => ipcRenderer.invoke("windows:set-monitored", windowKeys),
    getMonitored: () => ipcRenderer.invoke("windows:get-monitored")
  },
  capture: {
    start: (payload) => ipcRenderer.invoke("capture:start", payload),
    stop: () => ipcRenderer.invoke("capture:stop"),
    setInterval: (seconds) => ipcRenderer.invoke("capture:set-interval", seconds),
    getBuffers: () => ipcRenderer.invoke("capture:get-buffers"),
    setSimulation: (enabled) => ipcRenderer.invoke("capture:set-simulation", enabled),
    getSimulation: () => ipcRenderer.invoke("capture:get-simulation")
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
  tts: {
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload)
  },
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    openConsole: () => ipcRenderer.invoke("app:open-console")
  }
});
