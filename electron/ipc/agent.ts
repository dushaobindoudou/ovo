/**
 * ipc/agent.ts —— agent:* + ocr:* + tts:* IPC handler
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * Claude API 配置 / OCR 单测入口 / TTS 朗读——3 个外部 IO 服务的 channel 合并。
 */
import { safeExecuteAsync } from "../safe-execute.js";
import { AgentSetApiConfigSchema } from "../ipc-schema.js";
import type { AgentBridge } from "../agent-bridge.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerAgentHandlers(deps: IpcHandlerDeps) {
  const {
    ipcMain,
    safeHandle,
    agentBridge,
    ocrEngine,
    screenshotManager,
    ttsEngine,
    claudeTester,
    startBizNode,
    finishBizNode,
    logSystem
  } = deps;

  // SEC-4: 启动时从 secrets-store 恢复 API 配置状态
  void (async () => {
    try {
      const { secretsStore } = await import("../secrets-store.js");
      if (secretsStore.hasApiKey()) {
        agentBridge.markApiConfigured(true);
        logSystem("info", "agent", "已从 safeStorage 恢复 API 配置");
      }
    } catch (e) {
      logSystem("warning", "agent", "API 配置恢复失败", {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  })();

  // Auto-detect agent backends on startup so the status page shows real data；
  // 默认优先使用 hermes（稳定性 / 没有 401/403 风险）。
  void safeExecuteAsync(
    async () => {
      const backends = await agentBridge.detectAvailableBackends();
      logSystem("info", "agent", "检测到 Agent 后端", { backends });
      if (backends.includes("hermes")) {
        agentBridge.setPreferredBackend("hermes");
        logSystem("info", "agent", "已默认设置 preferred backend = hermes");
      }
    },
    "agent.detect-backends",
    undefined,
    "warn"
  );

  ipcMain.handle("agent:detect-backends", async () => agentBridge.detectAvailableBackends());
  ipcMain.handle("agent:set-backend", (_event, backend: Parameters<AgentBridge["setPreferredBackend"]>[0]) => {
    agentBridge.setPreferredBackend(backend);
    return { ok: true };
  });
  // SEC-4 + SEC-16: API key 走 safeStorage 加密落盘——renderer 永远拿不到明文。
  // baseUrl 白名单 + key 前缀校验已抽到 AgentSetApiConfigSchema（zod），
  // 防 renderer XSS 把 key 重定向到攻击者域名 / 写入空串 / 注入非 LLM provider key。
  safeHandle("agent:set-api-config", AgentSetApiConfigSchema, async (config) => {
    const { secretsStore } = await import("../secrets-store.js");
    if (!secretsStore.isEncryptionAvailable()) {
      return { ok: false, error: "系统未提供凭证存储（safeStorage 不可用）" };
    }
    if (!secretsStore.setApiKey(config.key)) {
      return { ok: false, error: "凭证写入失败" };
    }
    secretsStore.setApiBaseUrl(config.baseUrl);
    secretsStore.setApiModel(config.model);
    agentBridge.markApiConfigured(secretsStore.hasApiKey());
    return { ok: true };
  });
  ipcMain.handle("agent:get-api-config-status", async () => {
    const { secretsStore } = await import("../secrets-store.js");
    return {
      hasKey: secretsStore.hasApiKey(),
      maskedKey: secretsStore.getMaskedApiKey(),
      baseUrl: secretsStore.getApiBaseUrl(),
      model: secretsStore.getApiModel(),
      encryptionAvailable: secretsStore.isEncryptionAvailable()
    };
  });
  ipcMain.handle("agent:clear-api-config", async () => {
    const { secretsStore } = await import("../secrets-store.js");
    secretsStore.clearApiKey();
    agentBridge.markApiConfigured(false);
    return { ok: true };
  });
  ipcMain.handle("agent:status", () => agentBridge.getStatus());
  ipcMain.handle("agent:test-scenario", async (_event, payload: { scenarioId: string; customPrompt?: string }) =>
    claudeTester.runScenario(payload)
  );

  // OCR
  ipcMain.handle("ocr:initialize", async () => {
    await ocrEngine.initialize();
    return { ok: true };
  });
  ipcMain.handle("ocr:recognize", async (_event, payload: { base64?: string }) => {
    const bizLogId = startBizNode(null, "ocr.recognize", {
      source: payload?.base64 ? "payload.base64" : "screenshot.capture"
    });
    if (payload?.base64) {
      const ocr = await ocrEngine.recognize(Buffer.from(payload.base64, "base64"));
      finishBizNode(bizLogId, "success", {
        output: { confidence: ocr.confidence, textLength: ocr.text.length }
      });
      return ocr;
    }
    try {
      const image = await screenshotManager.captureScreen();
      const ocr = await ocrEngine.recognize(image);
      finishBizNode(bizLogId, "success", {
        output: { confidence: ocr.confidence, textLength: ocr.text.length }
      });
      return ocr;
    } catch (error) {
      finishBizNode(bizLogId, "failed", {
        error: error instanceof Error ? error.message : "ocr 失败"
      });
      logSystem("error", "ocr", "OCR 识别失败", {
        error: error instanceof Error ? error.message : "unknown"
      });
      throw error;
    }
  });

  // TTS
  ipcMain.handle("tts:speak", (_event, payload: { text: string; voice?: string }) =>
    ttsEngine.speak(payload.text, payload.voice)
  );
  // SEC-12: renderer 启动 / 设置切换时同步 ttsEnabled
  // 同时持久化到 preferences-store，下次主进程启动 init 时就能正确恢复
  ipcMain.handle("tts:set-enabled", async (_event, enabled: boolean) => {
    ttsEngine.setEnabled(!!enabled);
    const { preferencesStore } = await import("../preferences-store.js");
    preferencesStore.setTtsEnabled(!!enabled);
    return { ok: true };
  });
}
