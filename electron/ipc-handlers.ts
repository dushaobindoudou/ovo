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

interface WindowGetterOptions {
  getConsoleWindow: () => BrowserWindow | null;
  getFloatingWindow: () => BrowserWindow | null;
  getSuggestionWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(options: WindowGetterOptions) {
  const windowManager = new WindowManager();
  const screenshotManager = new ScreenshotManager();
  const ocrEngine = new OCREngine();
  const eventProcessor = new EventProcessor();
  const kg = new KnowledgeGraphEngine();
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
      options.getSuggestionWindow()?.webContents.send("capture:result", snapshot);
    }
  );

  let agentTimer: NodeJS.Timeout | null = setInterval(() => {
    void (async () => {
      try {
        const drained = eventProcessor.drainBuffers();
        if (drained.length === 0) return;
        const pipeline = pipelineLogger.startPipeline();
        pipelineLogger.updateStage(pipeline.id, "aggregate", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { windows: drained.length, entries: drained.reduce((acc, item) => acc + item.entries.length, 0) }
        });

        const prompt = buildIntentPrompt(drained, kg.getRelevantContext(), personalityAnalyzer.analyze().summary);
        pipelineLogger.updateStage(pipeline.id, "agent", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { promptSent: prompt }
        });
        const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 60_000 });
        if (!response.ok || !response.parsed) {
          pipelineLogger.updateStage(pipeline.id, "agent", {
            status: "failed",
            startTime: Date.now(),
            duration: response.duration,
            data: { error: response.error ?? "解析失败" }
          });
          pipelineLogger.complete(pipeline.id, "failed");
          options.getConsoleWindow()?.webContents.send("pipeline:update", pipelineLogger.getById(pipeline.id));
          return;
        }

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

        const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
        options.getSuggestionWindow()?.webContents.send("suggestion:new", suggestions);
        pipelineLogger.updateStage(pipeline.id, "suggestions", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { count: response.parsed.suggestions.length, suggestions: response.parsed.suggestions }
        });

        const actionResults = await actionExecutor.executeBatch(response.parsed.actions);
        pipelineLogger.updateStage(pipeline.id, "actions", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { actions: actionResults }
        });
        options.getSuggestionWindow()?.webContents.send("action:result", actionResults);

        const entityIds = response.parsed.entities.map((entity) => kg.upsertEntity(entity));
        response.parsed.relationships.forEach((relation) => {
          kg.upsertRelation(relation);
        });
        kg.addEvent({
          appName: drained[0].appName,
          windowTitle: drained[0].windowTitle,
          content: drained.flatMap((item) => item.entries.map((entry) => entry.text)).join("\n"),
          summary: response.parsed.prediction,
          intent: response.parsed.intent,
          sourceWindowId: drained[0].windowId,
          entityIds
        });
        pipelineLogger.updateStage(pipeline.id, "graphUpdate", {
          status: "success",
          startTime: Date.now(),
          duration: 0,
          data: { entityCount: response.parsed.entities.length, relationCount: response.parsed.relationships.length }
        });
        pipelineLogger.complete(pipeline.id, "completed");
        options.getConsoleWindow()?.webContents.send("pipeline:new", pipelineLogger.getById(pipeline.id));
        options.getConsoleWindow()?.webContents.send("pipeline:update", pipelineLogger.getById(pipeline.id));
      } catch (error) {
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
    autoCaptureService.stop();
  });

  ipcMain.handle("windows:get-all", async () => windowManager.getAllWindows());
  ipcMain.handle("windows:get-active", async () => windowManager.getActiveWindow());
  ipcMain.handle("windows:set-monitored", (_event, windowKeys: string[]) => {
    autoCaptureService.setMonitoredWindowKeys(windowKeys);
    return { ok: true };
  });
  ipcMain.handle("windows:get-monitored", () => autoCaptureService.getMonitoredWindowKeys());

  ipcMain.handle("capture:start", (_event, payload?: { intervalSeconds?: number }) => {
    if (payload?.intervalSeconds) autoCaptureService.setInterval(payload.intervalSeconds);
    autoCaptureService.start();
    return { ok: true };
  });
  ipcMain.handle("capture:stop", () => {
    autoCaptureService.stop();
    return { ok: true };
  });
  ipcMain.handle("capture:set-interval", (_event, seconds: number) => {
    autoCaptureService.setInterval(seconds);
    return { ok: true };
  });
  ipcMain.handle("capture:get-buffers", () => eventProcessor.getBuffers());
  ipcMain.handle("capture:set-simulation", (_event, enabled: boolean) => {
    autoCaptureService.setSimulationMode(Boolean(enabled));
    return {
      ok: true,
      simulationMode: autoCaptureService.getSimulationMode()
    };
  });
  ipcMain.handle("capture:get-simulation", () => ({
    simulationMode: autoCaptureService.getSimulationMode()
  }));

  ipcMain.handle("ocr:initialize", async () => {
    await ocrEngine.initialize();
    return { ok: true };
  });
  ipcMain.handle("ocr:recognize", async (_event, payload: { base64?: string }) => {
    if (payload?.base64) {
      return ocrEngine.recognize(Buffer.from(payload.base64, "base64"));
    }
    const image = await screenshotManager.captureScreen();
    return ocrEngine.recognize(image);
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

  ipcMain.handle("kg:search-entities", (_event, _query: string) => kg.getRelevantContext().relevantEntities);
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

  ipcMain.handle("action:confirm", async (_event, payload: Parameters<ActionExecutor["execute"]>[0]) =>
    actionExecutor.execute(payload)
  );
  ipcMain.handle("action:cancel", (_event, payload: { actionId: string }) => ({
    actionId: payload.actionId,
    status: "cancelled"
  }));

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
}
