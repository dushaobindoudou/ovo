import { app, BrowserWindow, ipcMain } from "electron";
import { WindowManager } from "./window-manager.js";
import { ScreenshotManager } from "./screenshot.js";
import { OCREngine } from "./ocr-engine.js";
import { EventProcessor } from "./event-processor.js";
import { AutoCaptureService } from "./auto-capture.js";
import { AgentBridge } from "./agent-bridge.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { PipelineLogger } from "./pipeline-logger.js";
import { SuggestionEngine } from "./suggestion-engine.js";
import { ActionExecutor } from "./action-executor.js";
import { FeedbackEngine } from "./feedback-engine.js";
import { PersonalityAnalyzer } from "./personality-analyzer.js";
import { TTSEngine } from "./tts-engine.js";
import { ClaudeCodeTester } from "./claude-code-tester.js";
import { buildIntentPrompt } from "./prompt-engine.js";
import { Logger, type BusinessLogEntry } from "./logger.js";
import { errorLogger } from "./error-logger.js";
import type { AgentAction } from "./types.js";
import type { ActionResult } from "./action-executor.js";

interface WindowGetterOptions {
  getConsoleWindow: () => BrowserWindow | null;
  getFloatingWindow: () => BrowserWindow | null;
  getSuggestionWindow: () => BrowserWindow | null;
  sharedKG?: KnowledgeGraphEngine;
  logger?: Logger;
  systemLogger?: {
    info: (source: string, message: string, context?: Record<string, unknown>) => void;
    warn: (source: string, message: string, context?: Record<string, unknown>) => void;
    error: (source: string, message: string, context?: Record<string, unknown>) => void;
  };
}

export function registerIpcHandlers(options: WindowGetterOptions) {
  const windowManager = new WindowManager();
  const screenshotManager = new ScreenshotManager();
  const ocrEngine = new OCREngine();
  const eventProcessor = new EventProcessor();
  const kg = options.sharedKG ?? new KnowledgeGraphEngine();
  const systemLogger = options.systemLogger;
  const pipelineLogger = new PipelineLogger(kg);
  const agentBridge = new AgentBridge();
  const suggestionEngine = new SuggestionEngine();
  const actionExecutor = new ActionExecutor(agentBridge);
  const feedbackEngine = new FeedbackEngine(kg);
  const personalityAnalyzer = new PersonalityAnalyzer(kg);
  const ttsEngine = new TTSEngine();
  const claudeTester = new ClaudeCodeTester(agentBridge);

  const autoCaptureService = new AutoCaptureService(
    windowManager,
    screenshotManager,
    ocrEngine,
    eventProcessor,
    (snapshot) => {
      options.getConsoleWindow()?.webContents.send("capture:result", snapshot);
      kg.addBusinessLog({
        node: "capture.snapshot",
        status: "success",
        input: {
          source: snapshot.captureSource ?? "active",
          appName: snapshot.appName,
          windowId: snapshot.windowId
        },
        output: {
          confidence: snapshot.confidence,
          textLength: snapshot.text.length
        },
        meta: { timestamp: snapshot.timestamp }
      });
    }
  );

  // 返回 autoCaptureService 引用，供 main.ts 自动启动
  return { autoCaptureService };

  const logSystem = (
    level: "info" | "warning" | "error",
    source: string,
    message: string,
    context?: Record<string, unknown>
  ) => {
    if (level === "error") systemLogger?.error(source, message, context);
    else if (level === "warning") systemLogger?.warn(source, message, context);
    else systemLogger?.info(source, message, context);
  };

  const startBizNode = (
    pipelineId: string | null | undefined,
    node: string,
    input?: unknown,
    meta?: Record<string, unknown>
  ) => {
    return kg.addBusinessLog({
      pipelineId: pipelineId ?? null,
      node,
      status: "running",
      input,
      meta,
      startTime: Date.now()
    });
  };

  const finishBizNode = (
    bizLogId: string,
    status: "success" | "failed" | "skipped" | "cancelled",
    payload?: { output?: unknown; error?: string; meta?: Record<string, unknown> }
  ) => {
    return kg.updateBusinessLog(bizLogId, {
      status,
      output: payload?.output,
      error: payload?.error,
      meta: payload?.meta,
      endTime: Date.now()
    });
  };

  const healthConfig = {
    enabled: true,
    intervalSeconds: 60
  };
  let latestHealth = {
    ok: true,
    timestamp: Date.now(),
    mode: "real" as const,
    sinceLastCaptureMs: -1
  };

  let healthTimer: NodeJS.Timeout | null = setInterval(() => {
    void (async () => {
      if (!healthConfig.enabled) return;
      const report = await autoCaptureService.runHealthCheck();
      latestHealth = report;
      options.getConsoleWindow()?.webContents.send("health:update", report);
    })();
  }, healthConfig.intervalSeconds * 1000);

  let agentTimer: NodeJS.Timeout | null = setInterval(() => {
    void (async () => {
      try {
        const drained = eventProcessor.drainBuffers();
        if (drained.length === 0) return;
        const pipeline = pipelineLogger.startPipeline();
        logSystem("info", "pipeline", "pipeline 启动", {
          pipelineId: pipeline.id,
          windows: drained.length
        });
        const windowSourceDistribution: Record<string, number> = {};
        for (const buf of drained) {
          windowSourceDistribution[buf.windowId] =
            (windowSourceDistribution[buf.windowId] ?? 0) + buf.entries.length;
        }
        const aggregateBizLogId = startBizNode(pipeline.id, "aggregate", {
          windows: drained.map((x) => ({
            windowId: x.windowId,
            appName: x.appName,
            entries: x.entries.length
          }))
        });
        pipelineLogger.updateStage(pipeline.id, "aggregate", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: {
            windows: drained.length,
            entries: drained.reduce((acc, item) => acc + item.entries.length, 0),
            windowSourceDistribution
          }
        });
        finishBizNode(aggregateBizLogId, "success", {
          output: {
            windows: drained.length,
            entries: drained.reduce((acc, item) => acc + item.entries.length, 0),
            windowSourceDistribution
          }
        });

        const promptBizLogId = startBizNode(pipeline.id, "intent.prompt.build", {
          windowCount: drained.length
        });
        const prompt = buildIntentPrompt(drained, kg.getRelevantContext(), personalityAnalyzer.analyze().summary);
        finishBizNode(promptBizLogId, "success", {
          output: {
            promptLength: prompt.length
          }
        });
        pipelineLogger.updateStage(pipeline.id, "agent", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { promptSent: prompt }
        });
        const predictBizLogId = startBizNode(pipeline.id, "intent.predict", {
          promptLength: prompt.length
        });
        const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 60_000 });
        if (!response.ok || !response.parsed) {
          finishBizNode(predictBizLogId, "failed", {
            error: response.error ?? "解析失败",
            output: {
              backend: response.backend,
              duration: response.duration
            }
          });
          pipelineLogger.updateStage(pipeline.id, "agent", {
            status: "failed",
            startTime: Date.now(),
            duration: response.duration,
            data: { error: response.error ?? "解析失败" }
          });
          pipelineLogger.complete(pipeline.id, "failed");
          logSystem("error", "pipeline", "pipeline 失败", {
            pipelineId: pipeline.id,
            reason: response.error ?? "解析失败"
          });
          options.getConsoleWindow()?.webContents.send("pipeline:update", pipelineLogger.getById(pipeline.id));
          return;
        }
        finishBizNode(predictBizLogId, "success", {
          output: {
            backend: response.backend,
            duration: response.duration,
            intent: response.parsed.intent,
            prediction: response.parsed.prediction
          }
        });

        pipelineLogger.updateStage(pipeline.id, "agent", {
          status: "success",
          startTime: Date.now(),
          duration: response.duration,
          data: {
            backend: response.backend,
            rawResponse: response.raw,
            parsedIntent: response.parsed.intent,
            parsedPrediction: response.parsed.prediction,
            promptSent: prompt
          }
        });

        pipelineLogger.updateStage(pipeline.id, "schema", {
          status: response.schemaMeta?.degraded ? "skipped" : "success",
          startTime: Date.now(),
          duration: 0,
          data: {
            degraded: response.schemaMeta?.degraded ?? false,
            repaired: response.schemaMeta?.repaired ?? false,
            notes: response.schemaMeta?.notes ?? []
          }
        });
        const schemaBizLogId = startBizNode(pipeline.id, "intent.schema", {
          rawLength: response.raw.length
        });
        finishBizNode(schemaBizLogId, response.schemaMeta?.degraded ? "skipped" : "success", {
          output: response.schemaMeta ?? {}
        });

        const suggestionBizLogId = startBizNode(pipeline.id, "suggestions.generate", {
          count: response.parsed.suggestions.length
        });
        const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
        options.getSuggestionWindow()?.webContents.send("suggestion:new", suggestions);
        pipelineLogger.updateStage(pipeline.id, "suggestions", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { count: response.parsed.suggestions.length, suggestions: response.parsed.suggestions }
        });
        finishBizNode(suggestionBizLogId, "success", {
          output: {
            queueSize: suggestions.length
          }
        });

        const pendingActions = response.parsed.actions.filter((a) => a.requireConfirm);
        if (pendingActions.length > 0) {
          options.getSuggestionWindow()?.webContents.send("action:pending", {
            pipelineId: pipeline.id,
            actions: pendingActions
          });
        }

        const actionBizLogId = startBizNode(pipeline.id, "actions.execute", {
          total: response.parsed.actions.length,
          pending: pendingActions.length
        });
        const actionResults = await actionExecutor.executeBatch(response.parsed.actions);
        pipelineLogger.updateStage(pipeline.id, "actions", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { actions: actionResults }
        });
        finishBizNode(actionBizLogId, "success", {
          output: {
            results: actionResults
          }
        });
        options.getSuggestionWindow()?.webContents.send("action:result", {
          pipelineId: pipeline.id,
          results: actionResults
        });

        const entityIds = response.parsed.entities.map((entity) => kg.upsertEntity(entity));
        response.parsed.relationships.forEach((relation) => {
          kg.upsertRelation(relation);
        });
        // Re-verify drained is not empty after async operations
        if (drained.length === 0) {
          pipelineLogger.complete(pipeline.id, "completed");
          logSystem("info", "pipeline", "pipeline 完成（无待处理数据）", {
            pipelineId: pipeline.id,
            duration: pipelineLogger.getById(pipeline.id)?.duration ?? 0
          });
          options.getConsoleWindow()?.webContents.send("pipeline:new", pipelineLogger.getById(pipeline.id));
          options.getConsoleWindow()?.webContents.send("pipeline:update", pipelineLogger.getById(pipeline.id));
          return;
        }
        kg.addEvent({
          appName: drained[0].appName,
          windowTitle: drained[0].windowTitle,
          content: drained.flatMap((item) => item.entries.map((entry) => entry.text)).join("\n"),
          summary: response.parsed.prediction,
          intent: response.parsed.intent,
          sourceWindowId: drained[0].windowId,
          entityIds
        });
        const graphBizLogId = startBizNode(pipeline.id, "graph.update", {
          entities: response.parsed.entities.length,
          relationships: response.parsed.relationships.length
        });
        pipelineLogger.updateStage(pipeline.id, "graphUpdate", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { entityCount: response.parsed.entities.length, relationCount: response.parsed.relationships.length }
        });
        finishBizNode(graphBizLogId, "success", {
          output: {
            entityCount: response.parsed.entities.length,
            relationCount: response.parsed.relationships.length
          }
        });
        pipelineLogger.complete(pipeline.id, "completed");
        logSystem("info", "pipeline", "pipeline 完成", {
          pipelineId: pipeline.id,
          duration: pipelineLogger.getById(pipeline.id)?.duration ?? 0
        });
        options.getConsoleWindow()?.webContents.send("pipeline:new", pipelineLogger.getById(pipeline.id));
        options.getConsoleWindow()?.webContents.send("pipeline:update", pipelineLogger.getById(pipeline.id));
      } catch (error) {
        logSystem("error", "pipeline", "pipeline 执行异常", {
          error: error instanceof Error ? error.message : "pipeline error"
        });
        options
          .getConsoleWindow()
          ?.webContents.send("pipeline:update", { error: error instanceof Error ? error.message : "pipeline error" });
      }
    })();
  }, 15_000);

  app.on("before-quit", () => {
    if (!agentTimer) return;
    clearInterval(agentTimer);
    agentTimer = null;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    autoCaptureService.stop();
  });

  ipcMain.handle("windows:get-all", async () => windowManager.getAllWindows());
  ipcMain.handle("windows:get-active", async () => windowManager.getActiveWindow());
  ipcMain.handle("windows:set-monitored", (_event, windowKeys: string[]) => {
    autoCaptureService.setMonitoredWindowKeys(windowKeys);
    return { ok: true };
  });
  ipcMain.handle("windows:get-monitored", () => autoCaptureService.getMonitoredWindowKeys());
  ipcMain.handle("windows:get-capture-stats", () => autoCaptureService.getWindowCaptureStats());

  ipcMain.handle("capture:start", (_event, payload?: { intervalSeconds?: number }) => {
    logSystem("info", "capture", "启动自动捕获", { intervalSeconds: payload?.intervalSeconds });
    if (payload?.intervalSeconds) autoCaptureService.setInterval(payload.intervalSeconds);
    autoCaptureService.start();
    return { ok: true };
  });
  ipcMain.handle("capture:stop", () => {
    logSystem("info", "capture", "停止自动捕获");
    autoCaptureService.stop();
    return { ok: true };
  });
  ipcMain.handle("capture:set-interval", (_event, seconds: number) => {
    autoCaptureService.setInterval(seconds);
    return { ok: true };
  });
  ipcMain.handle("capture:get-buffers", () => eventProcessor.getBuffers());
  ipcMain.handle("capture:take-screenshot", async () => {
    const bizLogId = startBizNode(null, "capture.manual", {
      source: "console.screenshot-test"
    });
    try {
      const image = await screenshotManager.captureScreen();
      const result = {
        dataUrl: `data:image/png;base64,${image.toString("base64")}`,
        mimeType: "image/png",
        byteLength: image.byteLength,
        capturedAt: Date.now()
      };
      finishBizNode(bizLogId, "success", {
        output: {
          byteLength: result.byteLength,
          mimeType: result.mimeType
        }
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "截图失败";
      finishBizNode(bizLogId, "failed", {
        error: message
      });
      logSystem("error", "capture", "手动截图失败", { error: message });
      throw error;
    }
  });
  ipcMain.handle("health:get-latest", () => latestHealth);
  ipcMain.handle("health:get-config", () => healthConfig);
  ipcMain.handle("health:set-config", (_event, payload: { enabled?: boolean; intervalSeconds?: number }) => {
    if (typeof payload.enabled === "boolean") healthConfig.enabled = payload.enabled;
    if (typeof payload.intervalSeconds === "number") {
      healthConfig.intervalSeconds = Math.max(10, Math.floor(payload.intervalSeconds));
      // Clear existing timer before creating a new one
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
      // Only restart timer if enabled
      if (healthConfig.enabled) {
        healthTimer = setInterval(() => {
          void (async () => {
            if (!healthConfig.enabled) return;
            const report = await autoCaptureService.runHealthCheck();
            latestHealth = report;
            options.getConsoleWindow()?.webContents.send("health:update", report);
          })();
        }, healthConfig.intervalSeconds * 1000);
      }
    }
    return { ok: true, config: healthConfig };
  });

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
        output: {
          confidence: ocr.confidence,
          textLength: ocr.text.length
        }
      });
      return ocr;
    }
    try {
      const image = await screenshotManager.captureScreen();
      const ocr = await ocrEngine.recognize(image);
      finishBizNode(bizLogId, "success", {
        output: {
          confidence: ocr.confidence,
          textLength: ocr.text.length
        }
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

  ipcMain.handle("agent:detect-backends", async () => agentBridge.detectAvailableBackends());
  ipcMain.handle("agent:set-backend", (_event, backend: Parameters<AgentBridge["setPreferredBackend"]>[0]) => {
    agentBridge.setPreferredBackend(backend);
    return { ok: true };
  });
  ipcMain.handle("agent:set-api-config", (_event, config: { baseUrl: string; key: string; model: string }) => {
    agentBridge.setApiConfig(config);
    return { ok: true };
  });
  ipcMain.handle("agent:status", () => agentBridge.getStatus());
  ipcMain.handle("agent:test-scenario", async (_event, payload: { scenarioId: string; customPrompt?: string }) =>
    claudeTester.runScenario(payload)
  );

  ipcMain.handle("kg:search-entities", (_event, query: string) => kg.searchEntities(query));
  ipcMain.handle("kg:get-entity", (_event, id: string) =>
    kg.getRelevantContext().relevantEntities.find((entity) => entity.name === id) ?? null
  );
  ipcMain.handle("kg:get-events", (_event, limit = 100) => kg.getEvents(limit));
  ipcMain.handle("kg:get-stats", () => kg.getStats());
  ipcMain.handle("kg:analyze-personality", () => personalityAnalyzer.analyze());
  ipcMain.handle("kg:clear", () => {
    kg.clearAll();
    return { ok: true };
  });
  ipcMain.handle("kg:export", () => ({
    stats: kg.getStats(),
    entities: kg.getRelevantContext().relevantEntities,
    relations: kg.getRelevantContext().relevantRelations
  }));

  ipcMain.handle("suggestion:feedback", (_event, payload: Parameters<FeedbackEngine["submitSuggestionFeedback"]>[0]) =>
    feedbackEngine.submitSuggestionFeedback(payload)
  );

  const mergePipelineAction = (pipelineId: string, actionId: string, result: ActionResult) => {
    pipelineLogger.mergeActionsStage(pipelineId, (actions) => {
      const idx = actions.findIndex((a) => a.actionId === actionId);
      if (idx >= 0) {
        actions[idx] = result;
        return actions;
      }
      actions.push(result);
      return actions;
    });
    const updated = pipelineLogger.getById(pipelineId);
    if (updated) options.getConsoleWindow()?.webContents.send("pipeline:update", updated);
  };

  ipcMain.handle(
    "action:confirm",
    async (_event, payload: { action: AgentAction; pipelineId?: string }) => {
      const bizLogId = startBizNode(payload.pipelineId ?? null, "action.confirm.execute", {
        actionId: payload.action.id,
        description: payload.action.description
      });
      const result = await actionExecutor.execute(payload.action);
      finishBizNode(bizLogId, result.status === "success" ? "success" : "failed", {
        output: {
          actionId: result.actionId,
          duration: result.duration,
          status: result.status
        },
        error: result.error
      });
      if (payload.pipelineId) mergePipelineAction(payload.pipelineId, payload.action.id, result);
      return result;
    }
  );
  ipcMain.handle(
    "action:cancel",
    (_event, payload: { actionId: string; pipelineId?: string }) => {
      const result: ActionResult = {
        actionId: payload.actionId,
        status: "cancelled",
        output: "用户已取消",
        duration: 0
      };
      kg.addBusinessLog({
        pipelineId: payload.pipelineId ?? null,
        node: "action.cancel",
        status: "cancelled",
        input: {
          actionId: payload.actionId
        },
        output: result
      });
      if (payload.pipelineId) mergePipelineAction(payload.pipelineId, payload.actionId, result);
      return result;
    }
  );

  ipcMain.handle("pipeline:get-recent", (_event, limit = 20) => pipelineLogger.getRecent(limit));
  ipcMain.handle("pipeline:get-detail", (_event, id: string) => pipelineLogger.getById(id));
  ipcMain.handle("pipeline:rate-stage", (_event, payload: { pipelineId: string; stage: string; rating: "good" | "bad" }) => {
    pipelineLogger.rateStage(payload.pipelineId, payload.stage, payload.rating);
    return { ok: true };
  });
  ipcMain.handle("pipeline:rate-overall", (_event, payload: { pipelineId: string; rating: "good" | "neutral" | "bad" }) => {
    pipelineLogger.rateOverall(payload.pipelineId, payload.rating);
    return { ok: true };
  });
  ipcMain.handle("pipeline:clear", () => {
    pipelineLogger.clear();
    return { ok: true };
  });

  ipcMain.handle("system-log:list", (_event, limit = 200) => kg.getSystemLogs(limit));
  ipcMain.handle("business-log:list", (_event, payload?: { limit?: number; pipelineId?: string }) =>
    kg.getBusinessLogs(payload?.limit ?? 100, payload?.pipelineId)
  );
  ipcMain.handle(
    "business-log:create",
    (_event, payload: { pipelineId?: string; node: string; status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled"; input?: unknown; output?: unknown; error?: string; meta?: Record<string, unknown> }) => ({
      id: kg.addBusinessLog({
        pipelineId: payload.pipelineId ?? null,
        node: payload.node,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
        meta: payload.meta,
        startTime: Date.now()
      })
    })
  );
  ipcMain.handle(
    "business-log:update",
    (
      _event,
      payload: {
        id: string;
        status?: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
        output?: unknown;
        error?: string;
        meta?: Record<string, unknown>;
      }
    ) => ({
      ok: kg.updateBusinessLog(payload.id, {
        status: payload.status,
        output: payload.output,
        error: payload.error,
        meta: payload.meta,
        endTime: Date.now()
      })
    })
  );

  ipcMain.handle("tts:speak", (_event, payload: { text: string; voice?: string }) =>
    ttsEngine.speak(payload.text, payload.voice)
  );
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:open-console", () => {
    const win = options.getConsoleWindow();
    if (!win) return { ok: false };
    win.show();
    win.focus();
    return { ok: true };
  });

  // 错误日志查询
  ipcMain.handle("error-log:get-recent", (_event, limit = 50) => errorLogger.getEntries(limit));
  ipcMain.handle("error-log:get-count", () => errorLogger.getErrorCount());
}
