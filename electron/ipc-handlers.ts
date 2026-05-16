import { app, BrowserWindow, ipcMain, systemPreferences, shell, screen } from "electron";
import { execFile } from "node:child_process";
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
import { Logger } from "./logger.js";
import { errorLogger } from "./error-logger.js";
import { scheduler } from "./scheduler.js";
import { sessionTracker, inferActivityState } from "./session-tracker.js";
import { preferencesStore } from "./preferences-store.js";
import type { AgentAction, AgentSuggestion } from "./types.js";
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
  onSuggestions?: (suggestions: AgentSuggestion[]) => void;
  onReceipts?: (receipts: AgentSuggestion[]) => void;
  toastManager?: {
    setVerbosity: (v: "silent" | "alerts" | "all") => void;
    noteRejection?: (type: string) => void;
    setDoNotDisturb?: (minutes: number) => void;
    enqueueReceipts?: (receipts: AgentSuggestion[]) => void;
  };
}

type BusinessLogStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

/**
 * P4: 把 action 执行结果转成"回执"提示，让用户知道 ovo 默默做了什么。
 * 只在 status="success" 且类型确实对外可感知时生成（剪贴板写入、邮件/iMessage 已发等）。
 * 静默类型（log_note / summarize / search / create_todo 等）不生成回执，避免噪音。
 */
function buildActionReceipts(actions: AgentAction[], results: ActionResult[]): AgentSuggestion[] {
  const byId = new Map<string, AgentAction>();
  for (const a of actions) byId.set(a.id, a);
  const out: AgentSuggestion[] = [];
  for (const r of results) {
    if (r.status !== "success") continue;
    const action = byId.get(r.actionId);
    if (!action) continue;
    if (action.type === "copy_to_clipboard") {
      const text = String(action.params?.text ?? "");
      const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: "ovo 已帮你复制",
        content: preview || action.description,
        priority: 100
      });
      continue;
    }
    if (action.type === "send_email") {
      const to = String(action.params?.to ?? "");
      const subject = String(action.params?.subject ?? action.description ?? "");
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: "ovo 已发送邮件",
        content: `${to ? `收件人: ${to}\n` : ""}主题: ${subject}`.trim(),
        priority: 100
      });
      continue;
    }
    if (action.type === "send_imessage") {
      const to = String(action.params?.to ?? "");
      const body = String(action.params?.body ?? action.description ?? "");
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: "ovo 已发送 iMessage",
        content: `${to ? `收件人: ${to}\n` : ""}${body}`.slice(0, 240),
        priority: 100
      });
      continue;
    }
    if (action.type === "set_reminder" || action.type === "add_calendar") {
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: action.type === "set_reminder" ? "ovo 已设置提醒" : "ovo 已加入日历",
        content: action.description,
        priority: 100
      });
      continue;
    }
    // log_note: 仅在用户标记 priority>=80（高风险归档）才出回执
    if (action.type === "log_note" && action.priority >= 80) {
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: "ovo 已记录提醒",
        content: action.description,
        priority: 100
      });
    }
  }
  return out;
}

function broadcastToRendererWindows(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch {
      /* ignore */
    }
  }
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
  const actionExecutor = new ActionExecutor(agentBridge, kg);
  const feedbackEngine = new FeedbackEngine(kg);
  const personalityAnalyzer = new PersonalityAnalyzer(kg);
  const ttsEngine = new TTSEngine();
  const claudeTester = new ClaudeCodeTester(agentBridge);

  // SEC-11: pending action 注册表——主进程持有真值，renderer 只传 actionId。
  // 防止 renderer 被 XSS 注入后伪造任意 AgentAction 调用 action:confirm。
  // 10 分钟 TTL，过期自动清理。
  const pendingActionsRegistry = new Map<string, {
    action: AgentAction;
    pipelineId?: string;
    expiresAt: number;
  }>();
  const PENDING_ACTION_TTL_MS = 10 * 60_000;
  function registerPendingAction(action: AgentAction, pipelineId?: string) {
    pendingActionsRegistry.set(action.id, {
      action,
      pipelineId,
      expiresAt: Date.now() + PENDING_ACTION_TTL_MS
    });
  }
  function consumePendingAction(actionId: string): { action: AgentAction; pipelineId?: string } | null {
    const entry = pendingActionsRegistry.get(actionId);
    if (!entry) return null;
    pendingActionsRegistry.delete(actionId);
    if (entry.expiresAt < Date.now()) return null;
    return { action: entry.action, pipelineId: entry.pipelineId };
  }
  // GC 过期项（每 5 分钟）
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pendingActionsRegistry) {
      if (entry.expiresAt < now) pendingActionsRegistry.delete(id);
    }
  }, 5 * 60_000).unref?.();

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
        try {
          const url = win.webContents.getURL();
          if (url.includes("#console")) {
            win.webContents.send("capture:result", snapshot);
          } else {
            win.webContents.send("capture:tick", tick);
          }
        } catch {
          /* ignore */
        }
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

  // 返回 autoCaptureService 引用，供 main.ts 自动启动
  // 注意: return 放在函数末尾，所有 IPC handler 注册代码在其前执行

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

  // Run initial health check immediately so the status page shows real data
  void autoCaptureService.runHealthCheck().then((report) => {
    latestHealth = report;
    broadcastToRendererWindows("health:update", report);
  }).catch(() => { /* ignore */ });

  // 关系强度每日衰减：scheduler 兜底，每 24h 运行一次。
  scheduler.register({
    id: "kg-decay",
    intervalMs: 24 * 60 * 60 * 1000,
    task: () => {
      kg.decayRelationships();
    },
    onError: (error) => {
      errorLogger.alert("warn", "kg-decay", "关系强度衰减异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // H10(E) 事件聚合摘要：每 10 分钟扫一次，同 intent 累积 ≥ 5 条则触发 LLM 总结
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
      try {
        const res = await agentBridge.call({ prompt, outputFormat: "text", timeout: 30_000 });
        if (res.ok) {
          const summary = (res.raw || "").slice(0, 200).trim();
          if (summary) kg.insertInsightSummary(recentSummaryName, summary, 8);
        }
      } catch { /* swallow */ }
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
  scheduler.register({
    id: "kg-summarize",
    intervalMs: 10 * 60 * 1000,
    task: runSummarizeOnce,
    onError: (error) => {
      errorLogger.alert("warn", "kg-summarize", "事件聚合摘要异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  ipcMain.handle("kg:trigger-summarize", async () => {
    await runSummarizeOnce();
    return { ok: true };
  });

  // H10(F) 反馈驱动偏好：每 30 分钟根据用户对各 intent_type 的赞踩动态调整 personalityOverrides
  scheduler.register({
    id: "prefs-update",
    intervalMs: 30 * 60 * 1000,
    task: () => {
      const stats = kg.getFeedbackStatsByIntent();
      const overrides = { ...preferencesStore.get().personalityOverrides };
      let changed = false;
      for (const s of stats) {
        if (s.total < 3) continue; // 样本太少不动
        const key = `intent_${s.intentType}`;
        const prev = typeof overrides[key] === "number" ? (overrides[key] as number) : 0.5;
        let next = prev;
        if (s.ratio >= 0.7) next = Math.min(1, prev + 0.05);
        else if (s.ratio <= 0.3) next = Math.max(0, prev - 0.05);
        if (Math.abs(next - prev) > 0.001) {
          overrides[key] = Number(next.toFixed(3));
          changed = true;
        }
      }
      if (changed) {
        preferencesStore.setPersonalityOverrides(overrides);
        logSystem("info", "prefs-update", "反馈驱动 personalityOverrides 已更新", { overrides });
      }
    },
    onError: (error) => {
      errorLogger.alert("warn", "prefs-update", "反馈学习异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const MEMORY_WARN_MB = 1024;
  const MEMORY_CRITICAL_MB = 1536;
  scheduler.register({
    id: "memory-monitor",
    intervalMs: 60_000,
    task: () => {
      const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;
      if (heapUsedMb >= MEMORY_CRITICAL_MB) {
        errorLogger.alert("critical", "memory-monitor", "主进程内存临界", { heapUsedMb: Math.round(heapUsedMb) });
      } else if (heapUsedMb >= MEMORY_WARN_MB) {
        errorLogger.alert("warn", "memory-monitor", "主进程内存偏高", { heapUsedMb: Math.round(heapUsedMb) });
      }
    }
  });

  scheduler.register({
    id: "health-check",
    intervalMs: healthConfig.intervalSeconds * 1000,
    task: async () => {
      if (!healthConfig.enabled) return;
      const report = await autoCaptureService.runHealthCheck();
      latestHealth = report;
      broadcastToRendererWindows("health:update", report);
    },
    onError: (error) => {
      errorLogger.alert("warn", "health-check", "自检任务异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // KG-C: 每日 KG GC，清噪音 entity（黑名单 + 一次性低质量孤儿 + 极低质量过期）
  // 启动后立即跑一次（清掉历史污染），之后每 24h 跑一次
  // 也会顺手 recompute 所有 quality_score
  scheduler.register({
    id: "kg-daily-gc",
    intervalMs: 24 * 3600 * 1000,
    task: async () => {
      try {
        const result = kg.runEntityGC();
        logSystem("info", "kg.gc", "KG 每日 GC 完成", result);
      } catch (e) {
        logSystem("error", "kg.gc", "KG GC 失败", {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    },
    onError: (error) => {
      errorLogger.alert("warn", "kg-daily-gc", "KG GC 任务异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  // 启动时立即跑一次（异步），不阻塞 IPC 注册
  setTimeout(() => {
    try {
      const result = kg.runEntityGC();
      logSystem("info", "kg.gc", "KG 启动 GC 完成", result);
    } catch (e) {
      logSystem("warning", "kg.gc", "KG 启动 GC 跳过", {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }, 5_000);

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
  scheduler.register({
    id: "prompt-self-eval",
    intervalMs: 24 * 3600 * 1000,
    task: runPromptSelfEval,
    onError: (error) => {
      errorLogger.alert("warn", "prompt-self-eval", "自评任务异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
    // 按窗口拆分：每个窗口独立 pipeline。一个窗口的多次 OCR 在 aggregate 阶段合并成一段输入。
    for (const buffer of drained) {
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
    const mergedText = buffer.entries.map((entry) => entry.text).join("\n");
    const aggregateOutput = {
      mergedTextLength: mergedText.length,
      // 给"ovo 做过的事"页面用：让用户能在回放里看到 AI 当时实际拿到的 OCR 文本，
      // 太短就没诊断价值；太长 pipeline_logs 会膨胀。2000 字是经验折中。
      preview: mergedText.slice(0, 2000)
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
        input: { promptLength: obsPrompt.length, promptPreview: obsPrompt.slice(0, 800), pass: "observation" },
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
      feedbackProfile: graphCtx.feedbackProfile
    });
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
      rawLength: response.raw.length,
      rawPreview: response.raw.slice(0, 800)
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
      // 问题2: pending 动作要让用户感知；走 toast 通知（即便控制台没开也能看到）
      try {
        const pendingReceipt: AgentSuggestion = {
          id: `pending_${pipeline.id}_${Date.now().toString(36)}`,
          type: "alert",
          title: pendingActions.length === 1
            ? "有 1 个动作等你确认"
            : `有 ${pendingActions.length} 个动作等你确认`,
          content: pendingActions
            .slice(0, 3)
            .map((a) => `· ${a.description || a.type || "动作"}`)
            .join("\n") + (pendingActions.length > 3 ? `\n…还有 ${pendingActions.length - 3} 项` : ""),
          priority: 90
        };
        options.toastManager?.enqueueReceipts?.([pendingReceipt]);
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
      intent: response.parsed.intent
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
      try {
        kg.upsertRelation({
          source: buffer.appName,
          target: ent.name,
          relation: "uses",
          context: `${buffer.appName} 在 ${new Date().toISOString()} 涉及 ${ent.type} ${ent.name}`
        });
      } catch { /* swallow */ }
    }

    // M5：被动识别 OCR 文本中的文件路径，登记为 application_file entity
    const filePaths = extractFilePaths(mergedText);
    let fileEntityCount = 0;
    for (const fp of filePaths) {
      try {
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
        fileEntityCount += 1;
      } catch { /* swallow */ }
    }
    response.parsed.relationships.forEach((relation) => {
      kg.upsertRelation(relation);
    });
    kg.addEvent({
      appName: buffer.appName,
      windowTitle: buffer.windowTitle,
      content: mergedText,
      summary: response.parsed.summary || response.parsed.prediction,
      // O1: intent 改为 LLM 给的纯自由文本（不再加 scene:: 前缀）
      intent: response.parsed.intent || "unknown",
      sourceWindowId: buffer.windowId,
      entityIds
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
    try { kg.computeAndStoreOutcomeScore(pipeline.id); } catch { /* ignore */ }
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
        logSystem("warning", "kg.relation-inference", "关系推断失败（不影响主流程）", {
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
    void ocrEngine.terminate().catch(() => { /* swallow */ });
  });

  // M6 悬浮球：拉当前状态 + 用户清零未读
  ipcMain.handle("floating:get-state", () => ({ ...floatingState }));
  ipcMain.handle("floating:clear-unread", () => {
    floatingState.unreadCount = 0;
    floatingState.lastRiskLevel = "none";
    pushFloatingState();
    return { ok: true };
  });

  // 悬浮球拖动：用 JS 实现球本身可拖。webkit-app-region:drag 只能拖空白，球被 button no-drag 屏蔽。
  // 渲染端 mousedown 时调 drag-start 记起点；mousemove 时传全局 delta；mouseup 调 drag-end。
  // 不在 mousemove 累计，避免浮点误差与丢事件。
  let floatingDragStart: { x: number; y: number } | null = null;
  ipcMain.handle("floating:drag-start", () => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed()) return { ok: false };
    const [x, y] = win.getPosition();
    floatingDragStart = { x, y };
    return { ok: true };
  });
  ipcMain.handle("floating:drag-move", (_event, payload: { dx: number; dy: number }) => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed() || !floatingDragStart) return { ok: false };
    const dx = Number.isFinite(payload?.dx) ? payload.dx : 0;
    const dy = Number.isFinite(payload?.dy) ? payload.dy : 0;
    win.setPosition(Math.round(floatingDragStart.x + dx), Math.round(floatingDragStart.y + dy));
    return { ok: true };
  });
  ipcMain.handle("floating:drag-end", () => {
    floatingDragStart = null;
    return { ok: true };
  });

  // 悬浮球高度切换：默认仅球(108)，sticky 展开时撑到 260；消除大片幽灵拖动区
  ipcMain.handle("floating:set-expanded", (_event, expanded: boolean) => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed()) return { ok: false };
    // 96×96 (折叠) ↔ 300×288 (展开)。展开方向：保持球的屏幕位置不变，卡片向左下延伸。
    // 若球离屏幕左边太近导致无法向左展开，退化为以球为中心的可行位置。
    const COLLAPSED = { w: 96, h: 96 };
    const EXPANDED = { w: 300, h: 288 };
    const [curX, curY] = win.getPosition();
    const [curW] = win.getSize();
    // 球目前的屏幕 X（球永远贴当前窗口右侧 96px 区域）
    const orbScreenX = curX + (curW - COLLAPSED.w);
    const target = expanded ? EXPANDED : COLLAPSED;
    // 默认让球保持在 (orbScreenX, curY)，窗口右上角对齐球
    let newX = orbScreenX + COLLAPSED.w - target.w;
    let newY = curY;
    // 边界保护：避免溢出屏幕
    const display = screen.getDisplayNearestPoint({ x: orbScreenX, y: curY });
    const wa = display.workArea;
    if (newX < wa.x) newX = wa.x;
    if (newX + target.w > wa.x + wa.width) newX = wa.x + wa.width - target.w;
    if (newY + target.h > wa.y + wa.height) newY = wa.y + wa.height - target.h;
    if (newY < wa.y) newY = wa.y;
    win.setBounds({ x: newX, y: newY, width: target.w, height: target.h }, false);
    return { ok: true, width: target.w, height: target.h };
  });
  ipcMain.handle("toast:set-verbosity", (_event, v: "silent" | "alerts" | "all") => {
    options.toastManager?.setVerbosity?.(v);
    logSystem("info", "toast", "弹窗激进度更新", { verbosity: v });
    return { ok: true, verbosity: v };
  });

  ipcMain.handle("scheduler:get-status", () => scheduler.getStatus());
  ipcMain.handle("alert:get-recent", (_event, limit?: number) => errorLogger.getAlerts(limit ?? 50));

  // 调试入口：注入 3 段假 OCR 后立即跑一次 agent-pipeline，
  // 用户可以在不依赖屏幕录制权限的情况下立刻看到 KG / 建议 / 日志填充。
  ipcMain.handle("dev:run-sample-pipeline", async () => {
    const FIXTURES = [
      {
        windowId: "sample_wechat",
        appName: "WeChat",
        windowTitle: "工作群 - 项目排期",
        text: "产品: 这周需求要发布吗？\n开发: 周三可以提测\n产品: 帮我把 Jira 状态改成 in-progress"
      },
      {
        windowId: "sample_chrome",
        appName: "Chrome",
        windowTitle: "React useEffect best practices",
        text: "useEffect 必须返回清理函数避免内存泄漏\n依赖数组留空只在首次渲染执行\n避免在 effect 里直接 setState 进入死循环"
      },
      {
        windowId: "sample_vscode",
        appName: "VSCode",
        windowTitle: "TS2345 error",
        text: "Type 'string | null' is not assignable to type 'string'\n建议使用 ?? 'unknown' 或可选链 userName?.toUpperCase()"
      }
    ];
    for (const f of FIXTURES) {
      eventProcessor.append(f.windowId, f.appName, f.windowTitle, {
        timestamp: Date.now(),
        text: f.text,
        confidence: 0.92
      });
    }
    options.logger?.info("dev:run-sample-pipeline", "注入 3 段假 OCR 并触发 pipeline", {
      windows: FIXTURES.length
    });
    const beforePipelines = kg.getStats().pipelines;
    const beforeEntities = kg.getStats().entities;
    await runAgentPipelineOnce();
    const afterPipelines = kg.getStats().pipelines;
    const afterEntities = kg.getStats().entities;
    return {
      ok: true,
      pipelinesAdded: afterPipelines - beforePipelines,
      entitiesAdded: afterEntities - beforeEntities
    };
  });

  ipcMain.handle("prefs:get-personality-overrides", () => preferencesStore.get().personalityOverrides ?? {});
  ipcMain.handle("prefs:set-personality-overrides", (_event, overrides: Record<string, number>) => {
    preferencesStore.setPersonalityOverrides(overrides);
    return { ok: true };
  });

  // P5: Bootstrap wizard
  ipcMain.handle("prefs:get-bootstrap-status", () => ({
    done: preferencesStore.get().bootstrapDone ?? false,
    interests: preferencesStore.get().bootstrapInterests ?? [],
    currentProject: preferencesStore.get().bootstrapCurrentProject ?? "",
    roles: preferencesStore.get().bootstrapRoles ?? []
  }));
  ipcMain.handle("prefs:save-bootstrap", (_event, payload: { interests: string[]; currentProject: string; roles: string[] }) => {
    preferencesStore.setBootstrap(payload);
    // 把兴趣 + 角色写进 KG 作为高质量 interest_profile
    try {
      for (const role of payload.roles) {
        kg.recordRoleHypothesis(role, 0.75); // 用户主动声明的角色给较高初始置信
      }
      for (const interest of payload.interests) {
        const id = kg.upsertEntity({
          name: interest,
          type: "concept",
          description: `用户在 bootstrap wizard 主动声明的关注主题`,
          attributes: { fromBootstrap: true }
        });
        // 钉住 + 设高质量分
        try { kg.setPinned(id, true); } catch { /* ignore */ }
      }
      if (payload.currentProject) {
        const id = kg.upsertEntity({
          name: payload.currentProject,
          type: "project",
          description: `用户在 bootstrap wizard 声明的当前主项目`,
          attributes: { fromBootstrap: true }
        });
        try { kg.setPinned(id, true); } catch { /* ignore */ }
      }
      kg.recomputeAllQualityScores();
    } catch (e) {
      logSystem("warning", "bootstrap", "写入 KG 失败", { error: e instanceof Error ? e.message : String(e) });
    }
    return { ok: true };
  });

  ipcMain.handle("windows:get-all", async () => windowManager.getAllWindows());
  ipcMain.handle("windows:get-active", async () => windowManager.getActiveWindow());
  ipcMain.handle("windows:set-monitored", (_event, windowKeys: string[]) => {
    autoCaptureService.setMonitoredWindowKeys(windowKeys);
    return { ok: true };
  });
  ipcMain.handle("windows:get-monitored", () => autoCaptureService.getMonitoredWindowKeys());
  ipcMain.handle("windows:get-capture-stats", () => autoCaptureService.getWindowCaptureStats());
  ipcMain.handle("windows:get-thumbnails", async () => windowManager.getWindowThumbnails());

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
  ipcMain.handle("capture:set-bg-monitoring", (_event, enabled: boolean) => {
    autoCaptureService.setBackgroundMonitoring(!!enabled);
    logSystem("info", "capture", "后台监控开关", { enabled: !!enabled });
    return { ok: true, enabled: !!enabled };
  });
  ipcMain.handle("capture:get-bg-monitoring", () => autoCaptureService.isBackgroundMonitoring());
  ipcMain.handle("capture:set-agent-interval", (_event, seconds: number) => {
    const safeSeconds = Math.max(3, Math.min(600, Math.floor(Number(seconds) || 15)));
    agentIntervalSeconds = safeSeconds;
    scheduler.setInterval("agent-pipeline", safeSeconds * 1000);
    logSystem("info", "capture", "Agent 调用间隔已更新", { seconds: safeSeconds });
    return { ok: true, seconds: safeSeconds };
  });
  ipcMain.handle("capture:get-agent-interval", () => agentIntervalSeconds);
  ipcMain.handle("capture:get-buffers", () => eventProcessor.getBuffers());
  ipcMain.handle("capture:clear-cache", () => {
    autoCaptureService.clearAllCaches();
    return { ok: true, clearedAt: Date.now() };
  });
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
      scheduler.setInterval("health-check", healthConfig.intervalSeconds * 1000);
    }
    if (!healthConfig.enabled) {
      scheduler.unregister("health-check");
    } else if (!scheduler.has("health-check")) {
      scheduler.register({
        id: "health-check",
        intervalMs: healthConfig.intervalSeconds * 1000,
        task: async () => {
          if (!healthConfig.enabled) return;
          const report = await autoCaptureService.runHealthCheck();
          latestHealth = report;
          broadcastToRendererWindows("health:update", report);
        },
        onError: (error) => {
          errorLogger.alert("warn", "health-check", "自检任务异常", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
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

  // Auto-detect agent backends on startup so the status page shows real data；
  // 默认优先使用 hermes（稳定性 / 没有 401/403 风险）。
  void agentBridge.detectAvailableBackends().then((backends) => {
    logSystem("info", "agent", "检测到 Agent 后端", { backends });
    if (backends.includes("hermes")) {
      agentBridge.setPreferredBackend("hermes");
      logSystem("info", "agent", "已默认设置 preferred backend = hermes");
    }
  }).catch(() => { /* ignore */ });

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
  ipcMain.handle("kg:get-entity", (_event, id: string) => {
    // 兼容传入 entity id 或 entity name
    const matches = kg.searchEntities(id, 50);
    return matches.find((entity) => entity.id === id || entity.name === id) ?? null;
  });
  ipcMain.handle(
    "kg:get-events",
    (_event, payload?: number | { entityId?: string; limit?: number }) => {
      if (typeof payload === "number") return kg.getEvents(payload);
      if (payload && payload.entityId) {
        return kg.getEventsByEntity(payload.entityId, payload.limit ?? 50);
      }
      return kg.getEvents(payload?.limit ?? 100);
    }
  );
  ipcMain.handle("kg:get-stats", () => kg.getStats());
  ipcMain.handle("kg:get-graph", (_event, limit?: number) => kg.getGraphSnapshot(limit ?? 80));
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

  // KG-D: 用户主权操作
  ipcMain.handle("kg:set-pinned", (_event, payload: { entityId: string; pinned: boolean }) => {
    kg.setPinned(payload.entityId, !!payload.pinned);
    return { ok: true };
  });
  ipcMain.handle("kg:delete-entity", (_event, entityId: string) => {
    return kg.deleteEntity(entityId);
  });
  ipcMain.handle("kg:get-entity-detail", (_event, entityId: string) => {
    return kg.getEntityDetail(entityId);
  });
  ipcMain.handle("kg:run-gc", () => kg.runEntityGC());

  // P8: prompt 自评建议
  ipcMain.handle("prompt-eval:list", (_event, limit?: number) => kg.listPromptEvalSuggestions(limit ?? 30));
  ipcMain.handle("prompt-eval:set-status", (_event, payload: { id: string; status: "applied" | "dismissed" | "pending" }) => {
    kg.setPromptEvalStatus(payload.id, payload.status);
    return { ok: true };
  });
  ipcMain.handle("prompt-eval:run-now", async () => {
    void runPromptSelfEval();
    return { ok: true, started: true };
  });
  // R8: 「ovo 越来越懂你」指标
  ipcMain.handle("kg:weekly-acceptance", () => kg.getWeeklyAcceptanceTrend());
  // F3: 流程 tab 时间线
  ipcMain.handle("process:timeline", (_event, limit?: number) => kg.getProcessTimeline(limit ?? 80));
  // 问题4：人类可读的「ovo 做过什么」清单（按 action 维度而不是 pipeline 维度）
  ipcMain.handle("history:list-actions", (_event, limit?: number) => kg.getActionHistory(limit ?? 100));
  // F4: 流程 tab 进度条数据（按 pipeline 分组）
  ipcMain.handle("process:pipelines", (_event, limit?: number) => kg.getPipelineProgress(limit ?? 50));

  // T2: 应用黑名单
  ipcMain.handle("privacy:get-blacklist", () => preferencesStore.get().blacklistedApps ?? []);
  ipcMain.handle("privacy:set-blacklist", (_event, apps: string[]) => {
    const cleaned = (apps ?? []).map((a) => String(a).trim()).filter((a) => a.length > 0);
    preferencesStore.setBlacklistedApps(cleaned);
    return { ok: true };
  });

  // T3: 暂停 / 恢复
  ipcMain.handle("privacy:pause", (_event, minutes: number) => {
    const m = Math.max(1, Math.min(24 * 60, Math.floor(minutes)));
    const until = Date.now() + m * 60_000;
    preferencesStore.setPausedUntil(until);
    return { ok: true, pausedUntil: until };
  });
  ipcMain.handle("privacy:resume", () => {
    preferencesStore.setPausedUntil(0);
    return { ok: true };
  });
  ipcMain.handle("privacy:get-pause-state", () => ({
    pausedUntil: preferencesStore.get().pausedUntil ?? 0,
    isPaused: (preferencesStore.get().pausedUntil ?? 0) > Date.now()
  }));

  ipcMain.handle("suggestion:feedback", (_event, payload: Parameters<FeedbackEngine["submitSuggestionFeedback"]>[0]) => {
    // R2 / R7: 用户 reject 后让 toast 短期屏蔽这类 type
    if (payload.action === "rejected" && payload.suggestionType) {
      try { options.toastManager?.noteRejection?.(payload.suggestionType); } catch { /* ignore */ }
    }
    // R2: offer accept 时立刻给一条 receipt（capability 引擎未上线，先告诉用户已记下偏好）
    if (payload.action === "accepted" && payload.suggestionType?.startsWith("offer:")) {
      try {
        options.toastManager?.enqueueReceipts?.([{
          id: `accept_${payload.suggestionId}_${Date.now().toString(36)}`,
          type: "receipt",
          title: "✓ ovo 已记下你的偏好",
          content: "ovo 会持续观察这类机会。capability 引擎下一轮上线后，会按你订的频率自动给你输出。",
          priority: 100
        }]);
      } catch { /* ignore */ }
    }
    return feedbackEngine.submitSuggestionFeedback(payload);
  });
  ipcMain.handle("toast:set-dnd", (_event, minutes: number) => {
    try { options.toastManager?.setDoNotDisturb?.(Math.max(1, Math.floor(minutes))); } catch { /* ignore */ }
    return { ok: true };
  });

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

  ipcMain.handle(
    "action:confirm",
    async (_event, payload: { actionId?: string; action?: AgentAction; pipelineId?: string }) => {
      // SEC-11: 优先按 actionId 从主进程 registry 取真实 action；
      // renderer 提供的 payload.action 不再被信任（防 XSS 伪造）。
      const requestedId = payload.actionId ?? payload.action?.id;
      if (!requestedId) {
        return {
          actionId: "unknown",
          status: "failed" as const,
          output: "",
          duration: 0,
          error: "缺少 actionId"
        };
      }
      const registered = consumePendingAction(requestedId);
      if (!registered) {
        return {
          actionId: requestedId,
          status: "failed" as const,
          output: "",
          duration: 0,
          error: "动作不存在或已过期，请重新触发"
        };
      }
      const action = registered.action;
      const pipelineId = registered.pipelineId ?? payload.pipelineId;
      const bizLogId = startBizNode(pipelineId ?? null, "action.confirm.execute", {
        actionId: action.id,
        description: action.description
      });
      const result = await actionExecutor.execute(action);
      finishBizNode(bizLogId, result.status === "success" ? "success" : "failed", {
        output: {
          actionId: result.actionId,
          duration: result.duration,
          status: result.status
        },
        error: result.error
      });
      if (pipelineId) mergePipelineAction(pipelineId, action.id, result);
      // P4: 用户刚确认的 action 完成后也弹回执
      try {
        const receipts = buildActionReceipts([action], [result]);
        if (receipts.length && options.onReceipts) options.onReceipts(receipts);
      } catch { /* ignore */ }
      return result;
    }
  );
  ipcMain.handle(
    "action:cancel",
    (_event, payload: { actionId: string; pipelineId?: string }) => {
      // SEC-11: 取消时也从 registry 移除，避免后续 confirm 误判
      consumePendingAction(payload.actionId);
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
  ipcMain.handle("app:runtime-check", () => ({
    ok: true,
    version: app.getVersion(),
    channels: {
      takeScreenshot: true,
      openSettings: true
    }
  }));
  ipcMain.handle("app:open-console", () => {
    const win = options.getConsoleWindow();
    if (!win) return { ok: false };
    win.show();
    win.focus();
    return { ok: true };
  });
  // P1: 点击悬浮球 toggle 主窗口
  ipcMain.handle("app:toggle-console", () => {
    const win = options.getConsoleWindow();
    if (!win) return { ok: false, visible: false };
    if (win.isVisible() && win.isFocused()) {
      win.hide();
      return { ok: true, visible: false };
    }
    win.show();
    win.focus();
    return { ok: true, visible: true };
  });

  // 错误日志查询
  ipcMain.handle("error-log:get-recent", (_event, limit = 50) => errorLogger.getEntries(limit));
  ipcMain.handle("error-log:get-count", () => errorLogger.getErrorCount());

  // macOS 权限检测
  ipcMain.handle("permissions:get-status", () => {
    const result: Record<string, string> = {};
    if (process.platform === "darwin") {
      result.screenRecording = systemPreferences.getMediaAccessStatus("screen") as string;
      result.camera = systemPreferences.getMediaAccessStatus("camera") as string;
      result.microphone = systemPreferences.getMediaAccessStatus("microphone") as string;
    } else {
      result.screenRecording = "not-available";
      result.camera = "not-available";
      result.microphone = "not-available";
    }
    return result;
  });
  ipcMain.handle("permissions:open-settings", async (_event, payload?: { target?: "screen" | "camera" | "microphone" }) => {
    const attempts: Array<{ method: string; ok: boolean; detail?: string }> = [];
    const log = (level: "info" | "warning", msg: string, ctx?: Record<string, unknown>) => {
      options.logger?.[level === "info" ? "info" : "warning"]("permissions:open-settings", msg, ctx);
    };
    const openWithCommand = (args: string[]) =>
      new Promise<boolean>((resolve) => {
        execFile("open", args, (err) => resolve(!err));
      });

    if (process.platform !== "darwin") {
      if (process.platform === "win32") {
        await shell.openExternal("ms-settings:privacy");
      } else {
        await shell.openExternal("https://wiki.archlinux.org/title/Screen_sharing");
      }
      return { ok: true, attempts: [{ method: "platform-fallback", ok: true }] };
    }

    const target = payload?.target ?? "screen";
    const anchor = target === "camera"
      ? "Privacy_Camera"
      : target === "microphone"
        ? "Privacy_Microphone"
        : "Privacy_ScreenCapture";

    // macOS 13+：osascript reveal anchor 是经验上最稳定的（System Settings 而非 System Preferences）。
    const osascript = `tell application "System Settings" to activate
delay 0.2
tell application "System Settings" to reveal anchor "${anchor}" of pane id "com.apple.preference.security"`;
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("osascript", ["-e", osascript], (err) => (err ? reject(err) : resolve()));
      });
      attempts.push({ method: "osascript-reveal", ok: true });
      log("info", "已通过 osascript 打开系统设置", { target, anchor });
      return { ok: true, method: "osascript-reveal", target, attempts };
    } catch (err) {
      attempts.push({ method: "osascript-reveal", ok: false, detail: err instanceof Error ? err.message : String(err) });
    }

    const urlsToTry = [
      `x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?${anchor}`,
      `x-apple.systempreferences:com.apple.preference.security?${anchor}`
    ];
    for (const url of urlsToTry) {
      try {
        await shell.openExternal(url);
        attempts.push({ method: `shell.openExternal:${url}`, ok: true });
        log("info", "已通过 shell.openExternal 打开系统设置", { url });
        return { ok: true, method: "shell.openExternal", target, url, attempts };
      } catch (err) {
        attempts.push({ method: `shell.openExternal:${url}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const url of urlsToTry) {
      const ok = await openWithCommand([url]);
      attempts.push({ method: `open ${url}`, ok });
      if (ok) {
        log("info", "已通过 open URL 打开系统设置", { url });
        return { ok: true, method: "open-url", target, url, attempts };
      }
    }

    if (await openWithCommand(["-a", "System Settings"])) {
      attempts.push({ method: "open -a 'System Settings'", ok: true });
      log("info", "已通过 open -a System Settings", {});
      return { ok: true, method: "open-app-name", target, attempts };
    }
    if (await openWithCommand(["-b", "com.apple.systempreferences"])) {
      attempts.push({ method: "open -b com.apple.systempreferences", ok: true });
      log("info", "已通过 bundle id 打开系统设置", {});
      return { ok: true, method: "open-bundle-id", target, attempts };
    }

    const openPathError = await shell.openPath("/System/Applications/System Settings.app");
    if (!openPathError) {
      attempts.push({ method: "shell.openPath", ok: true });
      return { ok: true, method: "shell.openPath", target, attempts };
    }
    attempts.push({ method: "shell.openPath", ok: false, detail: openPathError });

    log("warning", "全部策略失败", { attempts });
    return { ok: false, method: "failed", target, error: openPathError || "unable to open settings", attempts };
  });

  // 触发 desktopCapturer 以引发 macOS 原生屏幕录制授权提示；
  // 成功与否都返回一次最新状态。
  ipcMain.handle("permissions:request-screen", async () => {
    try {
      await screenshotManager.captureScreen();
    } catch {
      /* 忽略失败，依然返回最新状态 */
    }
    if (process.platform === "darwin") {
      return { screen: systemPreferences.getMediaAccessStatus("screen"), timestamp: Date.now() };
    }
    return { screen: "not-available", timestamp: Date.now() };
  });

  // 日志系统 IPC（preload 已暴露，这里补齐 handler）
  ipcMain.handle(
    "logger:info",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.info(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "logger:warning",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.warning(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "logger:error",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.error(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "logger:business",
    (
      _event,
      payload: {
        pipelineId?: string;
        node: string;
        status: BusinessLogStatus;
        input?: unknown;
        output?: unknown;
        error?: string;
        meta?: Record<string, unknown>;
      }
    ) => ({
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
    "logger:get-logs",
    (_event, payload?: { type?: "system" | "business"; limit?: number }) => {
      const limit = payload?.limit ?? 100;
      if (payload?.type === "business") return kg.getBusinessLogs(limit);
      return kg.getSystemLogs(limit);
    }
  );

  return { autoCaptureService };
}
