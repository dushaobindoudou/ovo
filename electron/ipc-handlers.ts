import { app, BrowserWindow, ipcMain as rawIpcMain } from "electron";
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
import { buildObservationPrompt, buildSynthesisPrompt } from "./adaptive-prompt.js";
import { buildRelationInferencePrompt, parseInferredRelations } from "./relation-inference.js";
import { buildSelfEvalPrompt, parseSelfEvalSuggestions } from "./prompt-self-eval.js";
import { extractFilePaths } from "./file-recognizer.js";
import { buildAggregatedText, summarizeAggregation } from "./text-diff.js";
import { errorLogger } from "./error-logger.js";
import { scheduler } from "./scheduler.js";
import { sessionTracker, inferActivityState } from "./session-tracker.js";
import { safeExecute, safeExecuteAsync } from "./safe-execute.js";
import { preferencesStore } from "./preferences-store.js";
import { sanitizeParsedPayload } from "./text-sanitize.js";
import type { AgentSuggestion } from "./types.js";
import type { ActionResult } from "./action-executor.js";

import {
  broadcastToRendererWindows,
  buildActionReceipts,
  makeSafeHandle,
  makeSafeIpcMain
} from "./ipc/_utils.js";
import { registerSchedulers } from "./ipc/schedulers.js";
import { createPendingActionRegistry } from "./ipc/pending-actions.js";
import { registerPrivacyHandlers } from "./ipc/privacy.js";
import { registerKgHandlers } from "./ipc/kg.js";
import { registerCaptureHandlers } from "./ipc/capture.js";
import { registerAgentHandlers } from "./ipc/agent.js";
import { registerPipelineHandlers } from "./ipc/pipeline.js";
import { registerSystemHandlers } from "./ipc/system.js";
import { registerDevHandlers } from "./ipc/dev.js";
import type { IpcHandlerDeps, WindowGetterOptions } from "./ipc/_shared.js";

export type { WindowGetterOptions };

export function registerIpcHandlers(options: WindowGetterOptions) {
  // CODE-3: 用 safeIpcMain 替换 rawIpcMain，幂等注册——dev reload 不再抛 "second handler"
  const ipcMain = makeSafeIpcMain(rawIpcMain);
  const safeHandle = makeSafeHandle(ipcMain);

  const windowManager = new WindowManager();
  const screenshotManager = new ScreenshotManager();
  const ocrEngine = new OCREngine();
  const eventProcessor = new EventProcessor();
  const kg = options.sharedKG ?? new KnowledgeGraphEngine();
  const systemLogger = options.systemLogger;
  const pipelineLogger = new PipelineLogger(kg);
  const agentBridge = new AgentBridge();
  const suggestionEngine = new SuggestionEngine();
  const actionExecutor = new ActionExecutor(agentBridge, kg);
  const feedbackEngine = new FeedbackEngine(kg);
  const personalityAnalyzer = new PersonalityAnalyzer(kg);
  const ttsEngine = new TTSEngine();
  // Bug: TTS 没声音 — 之前依赖 SettingsPanel 启动同步，但用户从来不打开 SettingsPanel
  // 主进程 ttsEngine.enabled 永远是 false → speak 拒绝。
  // 修复: 直接从 preferences-store 读初值（持久化），不依赖 renderer 同步。
  ttsEngine.setEnabled(preferencesStore.getTtsEnabled());
  const claudeTester = new ClaudeCodeTester(agentBridge);

  // SEC-11 + N7: pending action registry——主进程持有真值，renderer 只传 actionId。
  // 防止 renderer 被 XSS 注入后伪造任意 AgentAction 调用 action:confirm。
  // 10 分钟 TTL，过期自动清理；before-quit 时落盘；启动时恢复未决项。
  const { register: registerPendingAction, consume: consumePendingAction } = createPendingActionRegistry();

  // O2 悬浮球状态：去掉 scene 枚举，改用 LLM 给的 summary 自由文本
  const floatingState: {
    summary: string | null;
    activeApp: string | null;
    activeWindowTitle: string | null;
    pipelineStatus: "idle" | "thinking" | "generating" | "alert";
    unreadCount: number;
    lastPipelineAt: number;
    lastRiskLevel: "none" | "low" | "medium" | "high" | "critical";
  } = {
    summary: null,
    activeApp: null,
    activeWindowTitle: null,
    pipelineStatus: "idle",
    unreadCount: 0,
    lastPipelineAt: 0,
    lastRiskLevel: "none"
  };
  const pushFloatingState = () => {
    broadcastToRendererWindows("floating:state-update", { ...floatingState });
  };

  const autoCaptureService = new AutoCaptureService(
    windowManager,
    screenshotManager,
    ocrEngine,
    eventProcessor,
    (snapshot) => {
      const tick = {
        timestamp: snapshot.timestamp,
        windowId: snapshot.windowId,
        appName: snapshot.appName,
        windowTitle: snapshot.windowTitle,
        captureSource: snapshot.captureSource ?? "active",
        confidence: snapshot.confidence,
        textLength: snapshot.text.length
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        safeExecute(
          () => {
            const url = win.webContents.getURL();
            if (url.includes("#console")) {
              win.webContents.send("capture:result", snapshot);
            } else {
              win.webContents.send("capture:tick", tick);
            }
          },
          "ipc.capture-broadcast",
          undefined,
          "info"
        );
      }
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
  let latestHealth: unknown = {
    ok: true,
    timestamp: Date.now(),
    mode: "real" as const,
    sinceLastCaptureMs: -1
  };

  // H10(E) 事件聚合摘要：每 10 分钟扫一次（注册在 registerSchedulers）
  // 本函数定义在主入口因为引用了 kg / agentBridge 闭包
  const runSummarizeOnce = async () => {
    const events = kg.getRecentEvents(50);
    const byIntent = new Map<string, typeof events>();
    for (const ev of events) {
      const intent = (ev.intent || "").trim();
      if (!intent) continue;
      const arr = byIntent.get(intent) ?? [];
      arr.push(ev);
      byIntent.set(intent, arr);
    }
    for (const [intent, list] of byIntent) {
      if (list.length < 5) continue;
      // 检查是否已经在最近 1 小时内总结过
      const recentSummaryName = `summary::${intent}`;
      const existing = kg.searchEntities(recentSummaryName, 1);
      const isFresh = existing.find((e) =>
        e.name === recentSummaryName &&
        typeof e.attributes?.generatedAt === "number" &&
        Date.now() - (e.attributes.generatedAt as number) < 60 * 60 * 1000
      );
      if (isFresh) continue;
      const corpus = list.slice(0, 10).map((e) => `- [${e.appName}] ${e.summary || e.content?.slice(0, 200)}`).join("\n");
      const prompt = `请用一句中文总结用户在最近 ${list.length} 次"${intent}"意图下的关键收获，60 字以内。\n\n${corpus}\n\n仅输出总结文本本身，无需 JSON、markdown 或前后缀。`;
      await safeExecuteAsync(
        async () => {
          const res = await agentBridge.call({ prompt, outputFormat: "text", timeout: 30_000 });
          if (res.ok) {
            const summary = (res.raw || "").slice(0, 200).trim();
            if (summary) kg.insertInsightSummary(recentSummaryName, summary, 8);
          }
        },
        `kg.summarize.${intent}`,
        undefined,
        "warn"
      );
    }
    // M4: 同时跑二级索引（场景角色）+ 三级索引（行为模式）
    try {
      const scene = kg.rebuildSceneRoles();
      const pattern = kg.detectBehaviorPatterns();
      logSystem("info", "kg-summarize", "三层索引重建", {
        sceneRolePairs: scene.pairs,
        sceneRelations: scene.relations,
        behaviorPatterns: pattern.patterns
      });
    } catch (error) {
      logSystem("error", "kg-summarize", "索引重建失败", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  ipcMain.handle("kg:trigger-summarize", async () => {
    await runSummarizeOnce();
    return { ok: true };
  });

  // P8: 每日 prompt 自评（GEPA 简化版）
  // 每 24h 跑一次：拉低分 pipeline → LLM 看 → 写 prompt_eval_suggestions（待用户 review）
  const runPromptSelfEval = async () => {
    try {
      const lows = kg.getLowOutcomePipelines(24, 8);
      if (lows.length < 3) {
        logSystem("info", "prompt.self-eval", "低分 pipeline 不足 3 条，跳过", { found: lows.length });
        return;
      }
      const prompt = buildSelfEvalPrompt(lows);
      const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 60_000 });
      if (!response.ok) {
        logSystem("warning", "prompt.self-eval", "LLM 调用失败", { error: response.error });
        return;
      }
      const suggestions = parseSelfEvalSuggestions(response.raw ?? "");
      let inserted = 0;
      for (const s of suggestions) {
        kg.insertPromptEvalSuggestion({
          scope: s.scope,
          problem: s.problem,
          proposedChange: s.proposed_change,
          evidence: s.evidence,
          confidence: s.confidence
        });
        inserted++;
      }
      logSystem("info", "prompt.self-eval", "自评完成", {
        sampleCount: lows.length,
        suggestionCount: suggestions.length,
        inserted
      });
    } catch (e) {
      logSystem("error", "prompt.self-eval", "自评异常", {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  };
  // === 把所有定期任务一次性注册到 scheduler（拆分到 ipc/schedulers.ts）===
  // kg-decay / kg-summarize / prefs-update / memory-monitor / health-check /
  // kg-daily-gc / prompt-self-eval + 初始 health check + startup GC
  const { startupGcTimer } = registerSchedulers({
    kg,
    agentBridge,
    autoCaptureService,
    logSystem,
    broadcast: broadcastToRendererWindows,
    healthConfig,
    setLatestHealth: (v) => { latestHealth = v; },
    runSummarizeOnce,
    runPromptSelfEval
  });
  void startupGcTimer; // before-quit cleanup 已在 registerSchedulers 内部 app.on

  /**
   * KG-G: 关系推断二次 pass。
   * 给 LLM "本轮新 entities + 最近 1h KG 池"，让它找显然但漏掉的关系，
   * 写进 relationships 表 inferred=1。
   *
   * 异步、不阻塞主 pipeline；失败仅记日志。
   */
  async function runRelationInference(
    parentPipelineId: string,
    newEntities: import("./types.js").ExtractedEntity[],
    appName: string
  ) {
    const startedAt = Date.now();
    // 上下文池：取最近 1h 高质量 entity（≤ 12 个）
    const contextEntities = kg.getEntitiesForInference(12, 1)
      .filter((e) => !newEntities.some((n) => n.name === e.name)); // 去重
    if (newEntities.length + contextEntities.length < 3) return;

    const prompt = buildRelationInferencePrompt(newEntities, contextEntities);
    const bizId = startBizNode(parentPipelineId, "kg.relation-inference", {
      newEntityCount: newEntities.length,
      contextEntityCount: contextEntities.length,
      appName
    });
    let raw = "";
    try {
      const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 45_000 });
      raw = response.raw ?? "";
      if (!response.ok) {
        finishBizNode(bizId, "failed", { error: response.error ?? "agent call failed" });
        return;
      }
    } catch (err) {
      finishBizNode(bizId, "failed", { error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const inferences = parseInferredRelations(raw);
    if (inferences.length === 0) {
      finishBizNode(bizId, "success", {
        output: { added: 0, reinforced: 0, inferences: 0, durationMs: Date.now() - startedAt }
      });
      return;
    }

    // 把 source/target 名字解析回 entity id
    let added = 0;
    let reinforced = 0;
    let skipped = 0;
    for (const inf of inferences) {
      const sourceMatches = kg.searchEntities(inf.source, 1);
      const targetMatches = kg.searchEntities(inf.target, 1);
      // 严格匹配 name（searchEntities 用 LIKE 模糊匹配，需要二次校验）
      const source = sourceMatches.find((e) => e.name === inf.source);
      const target = targetMatches.find((e) => e.name === inf.target);
      if (!source?.id || !target?.id || source.id === target.id) {
        skipped++;
        continue;
      }
      try {
        const r = kg.upsertInferredRelation({
          sourceId: source.id,
          targetId: target.id,
          relation: inf.relation,
          context: `[inferred] ${inf.evidence}`,
          confidence: inf.confidence
        });
        if (r.added) added++;
        else if (r.reinforced) reinforced++;
      } catch {
        skipped++;
      }
    }

    finishBizNode(bizId, "success", {
      output: {
        inferences: inferences.length,
        added,
        reinforced,
        skipped,
        durationMs: Date.now() - startedAt
      }
    });
    logSystem("info", "kg.relation-inference", "二次推断完成", {
      pipelineId: parentPipelineId,
      added,
      reinforced,
      skipped,
      total: inferences.length
    });
  }

  const runAgentPipelineOnce = async () => {
    const drained = eventProcessor.drainBuffers();
    if (drained.length === 0) return;
    // NEW-2 不变量：每个窗口独立 pipeline，绝不跨窗口/跨应用合并。
    // 跨窗口混合会让 LLM 把多 app 内容当一段理解 → 推断混乱 + 敏感信息跨应用泄露
    // （看银行 + 看推特 = 银行内容被当推特上下文）。修改这段循环结构前必读 NEW-2。
    for (const buffer of drained) {
      // 不变量再检查：buffer 必须有 windowId（没 windowId 的脏数据丢弃）
      if (!buffer.windowId || !buffer.appName) {
        logSystem("warning", "pipeline", "buffer 缺 windowId/appName，跳过", {
          windowId: buffer.windowId,
          appName: buffer.appName,
          entryCount: buffer.entries.length
        });
        continue;
      }
      try {
        await runPipelineForWindow(buffer);
      } catch (error) {
        logSystem("error", "pipeline", "pipeline 执行异常", {
          windowId: buffer.windowId,
          error: error instanceof Error ? error.message : "pipeline error"
        });
        broadcastToRendererWindows("pipeline:update", {
          error: error instanceof Error ? error.message : "pipeline error"
        });
      }
    }
  };

  async function runPipelineForWindow(buffer: import("./types.js").WindowBuffer) {
    const pipeline = pipelineLogger.startPipeline();
    logSystem("info", "pipeline", "pipeline 启动", {
      pipelineId: pipeline.id,
      windowId: buffer.windowId,
      appName: buffer.appName,
      entries: buffer.entries.length
    });

    // ---- 阶段 1: aggregate（合并该窗口的多次 OCR） ----
    const aggregateStart = Date.now();
    const aggregateInput = {
      windowId: buffer.windowId,
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      entryCount: buffer.entries.length,
      timeRange: buffer.entries.length > 0
        ? {
            from: buffer.entries[0].timestamp,
            to: buffer.entries[buffer.entries.length - 1].timestamp
          }
        : null
    };
    // NEW-3: 用增量聚合替换简单 join——单帧时输出全量，多帧时输出「基线 + +/- 变化」
    // 节省 LLM token 50-70%（同窗口连续帧 OCR 文本通常 80-95% 相同）。
    const mergedText = buildAggregatedText(buffer.entries);
    const aggSummary = summarizeAggregation(buffer.entries);
    const aggregateOutput = {
      mergedTextLength: mergedText.length,
      // DATA-2: preview 从 2000 字降到 500 字，pipeline_logs 不再当 OCR 副本存
      preview: mergedText.slice(0, 500),
      // 暴露聚合统计给"回放"页：用户可看到 ovo 在 N 帧 OCR 里识别了多少变化
      frameCount: aggSummary.frameCount,
      changedFrames: aggSummary.changedFrames,
      totalAdded: aggSummary.totalAdded,
      totalRemoved: aggSummary.totalRemoved
    };
    const aggregateBizLogId = startBizNode(pipeline.id, "aggregate", aggregateInput);
    pipelineLogger.updateStage(pipeline.id, "aggregate", {
      status: "success",
      startTime: aggregateStart,
      duration: Date.now() - aggregateStart,
      input: aggregateInput,
      output: aggregateOutput,
      data: aggregateOutput
    });
    finishBizNode(aggregateBizLogId, "success", { output: aggregateOutput });

    // ---- 阶段 2: agent（adaptive prompt 调 LLM）----
    const agentStart = Date.now();
    // 立刻推 floating 状态：thinking 中（summary 等 LLM 返回再更新）
    floatingState.activeApp = buffer.appName;
    floatingState.activeWindowTitle = buffer.windowTitle;
    floatingState.pipelineStatus = "thinking";
    pushFloatingState();
    const personality = personalityAnalyzer.analyze().summary;
    const baseGraphCtx = kg.getUserContext();
    // Q2+Q3+P2+P6: KG 画像 + 反馈画像 + 5min 轨迹 + 当前活动状态
    // P2-fix: 轨迹按当前 active windowId 过滤，避免看 Twitter 时把 Claude Code 轨迹注入 prompt
    const activity = inferActivityState(buffer.windowId);
    const graphCtx = {
      ...baseGraphCtx,
      knownRoles: kg.getKnownRoles(5),
      feedbackProfile: kg.getUserFeedbackProfile(),
      sessionTrajectory: sessionTracker.getTrajectoryForPrompt(buffer.windowId),
      activityState: `状态: ${activity.state} · ${activity.description}`
    };
    // P3: 两段式 pipeline。Pass 1 观察 + 抽实体；Pass 2 基于 Pass 1 合成 offers/actions/suggestions
    const obsPrompt = buildObservationPrompt(buffer, graphCtx, personality);
    const predictBizLogId = startBizNode(pipeline.id, "intent.predict", {
      windowId: buffer.windowId,
      promptLength: obsPrompt.length,
      passes: 2
    });
    const obsResponse = await agentBridge.call({ prompt: obsPrompt, outputFormat: "json", timeout: 60_000 });

    if (!obsResponse.ok || !obsResponse.parsed) {
      const agentOutput = {
        backend: obsResponse.backend,
        durationMs: obsResponse.duration,
        ok: obsResponse.ok,
        pass: "observation",
        rawLength: obsResponse.raw?.length ?? 0,
        rawPreview: (obsResponse.raw ?? "").slice(0, 1200),
        error: obsResponse.error
      };
      pipelineLogger.updateStage(pipeline.id, "agent", {
        status: "failed",
        startTime: agentStart,
        duration: obsResponse.duration,
        // DATA-3: 不存 prompt 全文，只存长度 + 短 preview（200 字够定位问题）
        input: { promptLength: obsPrompt.length, promptPreview: obsPrompt.slice(0, 200), pass: "observation" },
        output: agentOutput,
        error: obsResponse.error ?? "Pass 1 (observation) 失败",
        data: { ...agentOutput, error: obsResponse.error }
      });
      finishBizNode(predictBizLogId, "failed", { error: obsResponse.error ?? "Pass 1 失败", output: agentOutput });
      pipelineLogger.complete(pipeline.id, "failed");
      logSystem("error", "pipeline", "pipeline 失败 - Pass 1 (观察)", {
        pipelineId: pipeline.id,
        windowId: buffer.windowId,
        reason: obsResponse.error ?? "未知"
      });
      broadcastToRendererWindows("pipeline:new", pipelineLogger.getById(pipeline.id));
      broadcastToRendererWindows("pipeline:update", pipelineLogger.getById(pipeline.id));
      return;
    }

    // Pass 2: 合成
    const obsParsed = obsResponse.parsed;
    // PHIL-1 / P0.4: 取出"用户教过的禁忌"注入 prompt 作为硬约束
    const relevantNegatives = kg.getRelevantNegativePatterns({
      appName: buffer.appName,
      intent: obsParsed.intent
    }, 10);
    // T8 反向校准：取出当前场景下用户反复拒绝过的 action 类型（衰减后仍 >= 阈值），软约束 LLM 保守
    const inflations = kg.getInflationWarnings({
      appName: buffer.appName,
      intent: obsParsed.intent
    });
    const inflationWarnings = inflations.map(
      (w) => `${w.actionType || "(未分类)"}${w.appName ? ` @ ${w.appName}` : ""}（已累计被拒 ${w.effectiveScore.toFixed(1)} 次）`
    );
    const synthPrompt = buildSynthesisPrompt({
      intent: obsParsed.intent,
      summary: obsParsed.summary,
      latentIntent: obsParsed.latent_intent,
      role: obsParsed.user_role_hypothesis
        ? { role: obsParsed.user_role_hypothesis.role, confidence: obsParsed.user_role_hypothesis.confidence }
        : undefined,
      topEntities: obsParsed.entities.slice(0, 8).map((e) => ({ name: e.name, type: e.type })),
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      feedbackProfile: graphCtx.feedbackProfile,
      negativePatterns: relevantNegatives.map((p) => p.pattern_text),
      inflationWarnings
    });
    // 命中计数 +1（用于后续观察哪些 pattern 真有约束力）
    for (const p of relevantNegatives) {
      try { kg.markNegativePatternHit(p.id); } catch { /* 命中计数失败不阻断 */ }
    }
    const synthResponse = await agentBridge.call({ prompt: synthPrompt, outputFormat: "json", timeout: 45_000 });

    // Pass 2 失败兜底：保留 Pass 1 输出，actions/suggestions/offers 走默认（actions 自动 log_note 兜底）
    const synthParsed = (synthResponse.ok && synthResponse.parsed) ? synthResponse.parsed : null;

    // 合并：Pass 1 给观察字段，Pass 2 给 actions/suggestions/offers
    const merged = {
      ...obsParsed,
      actions: synthParsed?.actions ?? obsParsed.actions,
      suggestions: synthParsed?.suggestions ?? obsParsed.suggestions,
      offers: synthParsed?.offers ?? obsParsed.offers
    };
    // 用户反馈："浮窗有时显示一段前端代码（CSS/JS）"
    // 根因：LLM 偶尔把屏幕 OCR 看到的代码原文当 prediction/summary/suggestion.content 写回来。
    // 在 merged 落地为下游可见字段前**集中清洗**，避免 N 个 UI 各自再防御。
    sanitizeParsedPayload(merged as unknown as Record<string, unknown>);
    // 重写 response.parsed，让下游代码原封不动复用
    (obsResponse as { parsed: typeof merged }).parsed = merged;

    const totalDuration = obsResponse.duration + (synthResponse?.duration ?? 0);
    const agentInput = {
      windowId: buffer.windowId,
      appName: buffer.appName,
      passes: 2,
      pass1PromptLength: obsPrompt.length,
      pass2PromptLength: synthPrompt.length,
      pass1Duration: obsResponse.duration,
      pass2Duration: synthResponse?.duration ?? 0
    };
    const agentOutput = {
      backend: obsResponse.backend,
      durationMs: totalDuration,
      ok: obsResponse.ok && synthResponse.ok,
      pass1Ok: obsResponse.ok,
      pass2Ok: synthResponse?.ok ?? false,
      rawLength: (obsResponse.raw?.length ?? 0) + (synthResponse?.raw?.length ?? 0),
      rawPreview: `[OBSERVATION]\n${(obsResponse.raw ?? "").slice(0, 600)}\n\n[SYNTHESIS]\n${(synthResponse?.raw ?? "").slice(0, 600)}`,
      intent: merged.intent,
      prediction: merged.prediction,
      role: merged.user_role_hypothesis?.role,
      offers: (merged.offers ?? []).length,
      actions: merged.actions.length,
      suggestions: merged.suggestions.length
    };
    pipelineLogger.updateStage(pipeline.id, "agent", {
      status: "success",
      startTime: agentStart,
      duration: totalDuration,
      input: agentInput,
      output: agentOutput,
      data: {
        promptSent: `[Pass1]\n${obsPrompt.slice(0, 1500)}\n\n[Pass2]\n${synthPrompt.slice(0, 1500)}`,
        ...agentOutput
      }
    });
    finishBizNode(predictBizLogId, "success", { output: agentOutput });

    // 给老变量名续命，下游代码不动；显式断言 parsed 存在（前面 early-return 已保证）
    const response = obsResponse as typeof obsResponse & { parsed: typeof merged };

    // ---- 阶段 3: schema 校验/修复 ----
    const schemaStart = Date.now();
    const schemaInput = {
      // DATA-3: LLM raw response 不全存，只存长度 + 短 preview
      rawLength: response.raw.length,
      rawPreview: response.raw.slice(0, 200)
    };
    const schemaOutput = {
      degraded: response.schemaMeta?.degraded ?? false,
      repaired: response.schemaMeta?.repaired ?? false,
      notes: response.schemaMeta?.notes ?? [],
      parsedIntent: response.parsed.intent,
      parsedPrediction: response.parsed.prediction,
      counts: {
        actions: response.parsed.actions.length,
        suggestions: response.parsed.suggestions.length,
        entities: response.parsed.entities.length,
        relationships: response.parsed.relationships.length
      }
    };
    pipelineLogger.updateStage(pipeline.id, "schema", {
      status: response.schemaMeta?.degraded ? "failed" : "success",
      startTime: schemaStart,
      duration: 0,
      input: schemaInput,
      output: schemaOutput,
      error: response.schemaMeta?.degraded ? response.schemaMeta.notes.join("; ") : undefined,
      data: schemaOutput
    });
    const schemaBizLogId = startBizNode(pipeline.id, "intent.schema", schemaInput);
    finishBizNode(schemaBizLogId, response.schemaMeta?.degraded ? "failed" : "success", {
      output: schemaOutput
    });

    // ---- 阶段 4: suggestions ----
    const suggestionsStart = Date.now();
    const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
    options.onSuggestions?.(response.parsed.suggestions);
    broadcastToRendererWindows("suggestion:new", suggestions);
    // Q1+Q4: 把 LLM 给出的 role / latent_intent / offers 广播给前端
    broadcastToRendererWindows("agent:insights", {
      pipelineId: pipeline.id,
      timestamp: Date.now(),
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      role: response.parsed.user_role_hypothesis,
      latentIntent: response.parsed.latent_intent,
      offers: response.parsed.offers,
      // R4: 把 prediction / intent / summary 也广播，前端 Overview 顶部展示
      prediction: response.parsed.prediction,
      intent: response.parsed.intent,
      summary: response.parsed.summary
    });
    // P1: offers 也走 toast，让用户立刻看见 ovo 提议的长期服务
    // type="offer" 让 toast UI 渲染成邀请式（要 / 不要），不是建议式（采纳 / 忽略）
    if (response.parsed.offers && response.parsed.offers.length > 0) {
      const offerToasts: AgentSuggestion[] = response.parsed.offers.map((o) => ({
        id: `offer_${o.id}_${Date.now().toString(36)}`,
        type: "offer",
        title: o.title,
        content: `${o.value_prop}${o.first_action_preview ? `\n\n▸ ${o.first_action_preview}` : ""}`,
        priority: 75 // 高于普通 tip，保证 alerts 档也能见
      }));
      options.onSuggestions?.(offerToasts);
    }
    const suggestionsInput = { count: response.parsed.suggestions.length };
    const suggestionsOutput = {
      ingested: suggestions.length,
      titles: suggestions.slice(0, 10).map((s) => s.title)
    };
    pipelineLogger.updateStage(pipeline.id, "suggestions", {
      status: "success",
      startTime: suggestionsStart,
      duration: Date.now() - suggestionsStart,
      input: suggestionsInput,
      output: suggestionsOutput,
      data: { count: response.parsed.suggestions.length, suggestions: response.parsed.suggestions }
    });
    finishBizNode(startBizNode(pipeline.id, "suggestions.generate", suggestionsInput), "success", {
      output: suggestionsOutput
    });

    // ---- 阶段 5: actions ----
    const actionsStart = Date.now();
    // 「不打扰」原则：LLM 标记 requireConfirm 或属于硬白名单外的类型都视作 pending
    const pendingActions = response.parsed.actions.filter(
      (a) => a.requireConfirm || !ActionExecutor.canAutoExecute(a.type)
    );
    if (pendingActions.length > 0) {
      // SEC-11: 注册到主进程 registry，确认时只接 actionId 不接整 action 对象
      for (const a of pendingActions) registerPendingAction(a, pipeline.id);
      broadcastToRendererWindows("action:pending", {
        pipelineId: pipeline.id,
        actions: pendingActions
      });
      // 问题2 + 用户反馈（2026-05-21）：pending 动作不再只弹"有 N 个动作等你确认"的
      // 软提示（用户得自己去面板点），而是**每个动作直接弹一张可执行 toast（执行/忽略）**，
      // 用户在浮窗里就能拍板。即便控制台没开也能用。
      try {
        if (options.toastManager?.enqueueActions) {
          options.toastManager.enqueueActions(pendingActions, pipeline.id);
        } else {
          // 兜底：老结构没有 enqueueActions 时退回软提示
          const pendingReceipt: AgentSuggestion = {
            id: `pending_${pipeline.id}_${Date.now().toString(36)}`,
            type: "risk",
            title: pendingActions.length === 1 ? "有 1 个动作等你确认" : `有 ${pendingActions.length} 个动作等你确认`,
            content: pendingActions.slice(0, 3).map((a) => `· ${a.description || a.type || "动作"}`).join("\n"),
            priority: 95
          };
          options.toastManager?.enqueueReceipts?.([pendingReceipt]);
        }
      } catch (e) {
        systemLogger?.warn?.("toast.pending", "pending toast 生成失败", {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    const actionsInput = {
      total: response.parsed.actions.length,
      pending: pendingActions.length,
      autoExecutable: response.parsed.actions.length - pendingActions.length
    };
    const actionResults = await actionExecutor.executeBatch(response.parsed.actions, {
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      windowId: buffer.windowId,
      intent: response.parsed.intent,
      // 反思 #2: 把 OCR 摘录传进去，让 evidence-grounder 验证 LLM 自报的证据
      ocrPreview: mergedText,
      pipelineId: pipeline.id
    });
    const actionsOutput = {
      executed: actionResults.length,
      results: actionResults
    };
    pipelineLogger.updateStage(pipeline.id, "actions", {
      status: "success",
      startTime: actionsStart,
      duration: Date.now() - actionsStart,
      input: actionsInput,
      output: actionsOutput,
      data: { actions: actionResults }
    });
    finishBizNode(startBizNode(pipeline.id, "actions.execute", actionsInput), "success", {
      output: actionsOutput
    });
    broadcastToRendererWindows("action:result", {
      pipelineId: pipeline.id,
      results: actionResults
    });

    // P4: 已执行 action 弹"回执"，让用户知道 ovo 默默做了哪些事（复制、发送等）
    try {
      const receipts = buildActionReceipts(response.parsed.actions, actionResults);
      if (receipts.length && options.onReceipts) options.onReceipts(receipts);
    } catch (e) {
      systemLogger?.warn?.("toast.receipts", "回执生成失败", {
        error: e instanceof Error ? e.message : String(e)
      });
    }

    // ---- 阶段 6: graphUpdate ----
    const graphStart = Date.now();
    // 应用本身永远是 first-class entity：每次 pipeline 自动 upsert，不依赖 LLM 是否抽到。
    const appEntityId = kg.upsertEntity({
      name: buffer.appName,
      type: "application",
      description: buffer.windowTitle ? `窗口: ${buffer.windowTitle}` : "应用",
      attributes: { windowId: buffer.windowId, windowTitle: buffer.windowTitle }
    });
    const entityIds = response.parsed.entities.map((entity) => kg.upsertEntity(entity));
    if (!entityIds.includes(appEntityId)) entityIds.unshift(appEntityId);
    // Q2: LLM 这一轮推断的角色，写回 KG 累加 confidence（"越用越聪明"的核心数据）
    if (response.parsed.user_role_hypothesis) {
      try {
        kg.recordRoleHypothesis(
          response.parsed.user_role_hypothesis.role,
          response.parsed.user_role_hypothesis.confidence
        );
      } catch (e) {
        systemLogger?.warn?.("kg.role", "写入角色画像失败", {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    // 自动建 (application) -uses-> (LLM 抽到的概念) 关系
    for (const ent of response.parsed.entities) {
      if (ent.type === "application" || ent.name === buffer.appName) continue;
      safeExecute(
        () => kg.upsertRelation({
          source: buffer.appName,
          target: ent.name,
          relation: "uses",
          context: `${buffer.appName} 在 ${new Date().toISOString()} 涉及 ${ent.type} ${ent.name}`
        }),
        "kg.auto-app-uses-relation",
        undefined,
        "warn"
      );
    }

    // M5：被动识别 OCR 文本中的文件路径，登记为 application_file entity
    const filePaths = extractFilePaths(mergedText);
    let fileEntityCount = 0;
    for (const fp of filePaths) {
      const ok = safeExecute(
        () => {
          kg.upsertEntity({
            name: fp.path,
            type: "application_file",
            description: `${fp.ext.toUpperCase()} 文件`,
            attributes: { path: fp.path, ext: fp.ext, name: fp.name, kind: fp.kind, lastSeenAppName: buffer.appName }
          });
          kg.upsertRelation({
            source: buffer.appName,
            target: fp.path,
            relation: "opens",
            context: `OCR 中识别到 ${fp.kind} 文件路径`
          });
          return true;
        },
        "kg.file-recognizer-upsert",
        false,
        "warn"
      );
      if (ok) fileEntityCount += 1;
    }
    response.parsed.relationships.forEach((relation) => {
      kg.upsertRelation(relation);
    });
    // DATA-11: 计算 OCR 整体置信度（buffer 多帧平均）；低于 0.5 KG 内部会拒绝入库
    const avgConfidence = buffer.entries.length > 0
      ? buffer.entries.reduce((s, e) => s + (e.confidence || 0), 0) / buffer.entries.length
      : 0;
    // 5W 改造：LLM observation 输出的 actor / actor_name 透传给 addEvent
    // observation parsed 是 unknown 类型，安全地读 actor / actor_name 字段
    const parsedRaw = response.parsed as unknown as {
      actor?: string;
      actor_name?: string;
      summary?: string;
      prediction?: string;
      intent?: string;
    };
    const rawActor = String(parsedRaw.actor ?? "").toLowerCase();
    const actor: "self" | "other" | "system" | "ovo" | "unknown" =
      rawActor === "self" || rawActor === "other" || rawActor === "system" ? rawActor :
      rawActor === "mixed" ? "self" :  // 混合时归为 self（用户为主）
      "unknown";
    const actorName = typeof parsedRaw.actor_name === "string" ? parsedRaw.actor_name : undefined;
    kg.addEvent({
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      // NEW-4 双轨：content 保留原始 OCR（供审计/调试），summary 给用户看
      content: mergedText,
      summary: response.parsed.summary || response.parsed.prediction,
      // O1: intent 改为 LLM 给的纯自由文本（不再加 scene:: 前缀）
      intent: response.parsed.intent || "unknown",
      sourceWindowId: buffer.windowId,
      entityIds,
      confidence: avgConfidence,
      actor,
      actorName
    });
    const graphInput = {
      entitiesProposed: response.parsed.entities.length,
      relationsProposed: response.parsed.relationships.length
    };
    const graphOutput = {
      entityIds,
      entityCount: entityIds.length,
      relationCount: response.parsed.relationships.length,
      fileEntities: fileEntityCount,
      filePaths: filePaths.map((f) => f.path)
    };
    pipelineLogger.updateStage(pipeline.id, "graphUpdate", {
      status: "success",
      startTime: graphStart,
      duration: Date.now() - graphStart,
      input: graphInput,
      output: graphOutput,
      data: graphOutput
    });
    finishBizNode(startBizNode(pipeline.id, "graph.update", graphInput), "success", { output: graphOutput });

    pipelineLogger.complete(pipeline.id, "completed");
    // P7: 立刻算一次 outcome_score（基于内在质量信号，反馈来了再 update）
    safeExecute(
      () => kg.computeAndStoreOutcomeScore(pipeline.id),
      "kg.compute-outcome-score",
      0,
      "warn"
    );
    logSystem("info", "pipeline", "pipeline 完成", {
      pipelineId: pipeline.id,
      windowId: buffer.windowId,
      duration: pipelineLogger.getById(pipeline.id)?.duration ?? 0
    });
    broadcastToRendererWindows("pipeline:new", pipelineLogger.getById(pipeline.id));
    broadcastToRendererWindows("pipeline:update", pipelineLogger.getById(pipeline.id));

    // KG-G: 关系推断二次 pass（异步、节流、不阻塞主 flow）
    // 节流：本 pipeline 抽出 ≥ 2 个非 application 类 entity 才触发
    const newRealEntities = response.parsed.entities.filter((e) => e.type !== "application");
    if (newRealEntities.length >= 2) {
      void runRelationInference(pipeline.id, newRealEntities, buffer.appName).catch((err) => {
        // 用户反馈：claude CLI 失败导致这条 warning 一直刷。
        // 这是后台 enrichment，主流程不靠它 → 降级为 info，不再打 warning alert。
        logSystem("info", "kg.relation-inference", "关系推断失败（不影响主流程）", {
          pipelineId: pipeline.id,
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }

    // O1+M6: 推一次最终 floating 状态。risk 优先用 LLM 给的，没给就用 priority 阈值兜底。
    const llmRisk = response.parsed.risk;
    const hasHighPriority = response.parsed.suggestions.some((s) => (s.priority ?? 0) >= 80);
    floatingState.summary = response.parsed.summary || response.parsed.intent || null;
    floatingState.pipelineStatus = "idle";
    floatingState.lastPipelineAt = Date.now();
    floatingState.unreadCount += response.parsed.suggestions.length;
    floatingState.lastRiskLevel = llmRisk && llmRisk !== "none"
      ? llmRisk
      : hasHighPriority
        ? "medium"
        : "low";
    pushFloatingState();
  }

  // F4 修：默认对齐 capture interval（5s）。scheduler 自带 "running 就跳过" 机制，
  // 不会真的每 5s 都跑一次新 pipeline——pipeline 完成才会启动下一轮，自然限流。
  let agentIntervalSeconds = 5;
  scheduler.register({
    id: "agent-pipeline",
    intervalMs: agentIntervalSeconds * 1000,
    queueSize: () => eventProcessor.getBuffers().reduce((sum, buf) => sum + buf.entries.length, 0),
    task: runAgentPipelineOnce,
    onError: (error) => {
      errorLogger.alert("error", "agent-pipeline", "pipeline 调度异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.on("before-quit", () => {
    scheduler.stopAll();
    autoCaptureService.stop();
    // 释放 OCR 引擎资源（Tesseract worker 占用约 150MB 内存）
    void safeExecuteAsync(() => ocrEngine.terminate(), "ocr.before-quit-terminate", undefined, "info");
  });

  // M6 悬浮球：拉当前状态 + 用户清零未读（floatingState 闭包在此，留主入口 handle）
  ipcMain.handle("floating:get-state", () => ({ ...floatingState }));
  ipcMain.handle("floating:clear-unread", () => {
    floatingState.unreadCount = 0;
    floatingState.lastRiskLevel = "none";
    pushFloatingState();
    return { ok: true };
  });

  // 把 pipeline_logger action stage 合并的逻辑提到 deps——给 pipeline.ts (action:confirm / cancel) 用
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
    if (updated) broadcastToRendererWindows("pipeline:update", updated);
  };

  // ============================================================
  // 子模块按域注册（A1 / CODE-11: god module 拆分）
  // ============================================================
  const floatingDragState: { start: { x: number; y: number } | null } = { start: null };
  const deps: IpcHandlerDeps = {
    ipcMain,
    safeHandle,
    kg,
    agentBridge,
    actionExecutor,
    feedbackEngine,
    personalityAnalyzer,
    ttsEngine,
    ocrEngine,
    eventProcessor,
    windowManager,
    screenshotManager,
    suggestionEngine,
    pipelineLogger,
    claudeTester,
    autoCaptureService,
    options,
    logSystem,
    broadcast: broadcastToRendererWindows,
    startBizNode,
    finishBizNode,
    consumePendingAction,
    registerPendingAction,
    buildActionReceipts,
    mergePipelineAction,
    pushFloatingState,
    floatingDragState,
    isDevMode: !app.isPackaged,
    getAgentIntervalSeconds: () => agentIntervalSeconds,
    setAgentIntervalSeconds: (s) => { agentIntervalSeconds = s; },
    healthConfig,
    getLatestHealth: () => latestHealth,
    setLatestHealth: (v) => { latestHealth = v; },
    runAgentPipelineOnce,
    runPromptSelfEval
  };

  registerPrivacyHandlers(deps);
  registerKgHandlers(deps);
  registerCaptureHandlers(deps);
  registerAgentHandlers(deps);
  registerPipelineHandlers(deps);
  registerSystemHandlers(deps);
  registerDevHandlers(deps);

  return { autoCaptureService };
}
