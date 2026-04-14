export interface NudgeAPI {
  on: (channel: string, listener: (payload: any) => void) => () => void;
  invoke: (channel: string, payload?: any) => Promise<any>;
  windows: {
    getAll: () => Promise<any[]>;
    getActive: () => Promise<any>;
    setMonitored: (windowKeys: string[]) => Promise<any>;
    getMonitored: () => Promise<string[]>;
  };
  capture: {
    start: (payload?: { intervalSeconds?: number }) => Promise<any>;
    stop: () => Promise<any>;
    setInterval: (seconds: number) => Promise<any>;
    getBuffers: () => Promise<any[]>;
    setSimulation: (enabled: boolean) => Promise<{ ok: boolean; simulationMode: boolean }>;
    getSimulation: () => Promise<{ simulationMode: boolean }>;
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
    confirm: (payload: any) => Promise<any>;
    cancel: (payload: { actionId: string }) => Promise<any>;
  };
  pipeline: {
    getRecent: (limit?: number) => Promise<any[]>;
    getDetail: (id: string) => Promise<any>;
    rateStage: (payload: { pipelineId: string; stage: string; rating: "good" | "bad" }) => Promise<any>;
    rateOverall: (payload: { pipelineId: string; rating: "good" | "neutral" | "bad" }) => Promise<any>;
    clear: () => Promise<any>;
  };
  tts: {
    speak: (payload: { text: string; voice?: string }) => Promise<any>;
  };
  app: {
    getVersion: () => Promise<string>;
    openConsole: () => Promise<any>;
  };
}

declare global {
  interface Window {
    nudgeAPI: NudgeAPI;
  }
}

export {};
