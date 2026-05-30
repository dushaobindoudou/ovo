/**
 * ipc/kg.ts —— kg:* + prompt-eval:* + history:* + process:* + business-log:* + system-log:* IPC
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 这里集中"知识图谱 + 历史日志查询"相关的 channel。
 */
import {
  KgClearSchema,
  KgDeleteEntitySchema,
  KgDeleteNegativePatternSchema,
  KgExportSchema,
  KgSetPinnedSchema,
  LoggerBusinessSchema,
  withConfirmHandshake
} from "../ipc-schema.js";
import type { IpcHandlerDeps } from "./_shared.js";
import { REQUIRE_CONFIRM_TYPES } from "../agent-response-normalize.js";
import type { ActionType, AgentAction } from "../types.js";

type BusinessLogStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

export function registerKgHandlers(deps: IpcHandlerDeps) {
  const { ipcMain, safeHandle, kg, personalityAnalyzer, logSystem, runPromptSelfEval } = deps;

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
  // 用户产品改造 U2: 记忆"时间线"视图 — 按时间倒序拉 memory_events，含 5W actor 字段
  ipcMain.handle("kg:get-recent-events", (_event, limit?: number) =>
    kg.getRecentEvents(typeof limit === "number" && limit > 0 ? limit : 100, { includeLegacy: false })
  );
  ipcMain.handle("kg:get-stats", () => kg.getStats());
  // P1-2 记忆纠错：实体改名（旧名并入 aliases，保留匹配）
  ipcMain.handle("kg:rename-entity", (_event, payload: { entityId: string; newName: string }) => {
    if (!payload?.entityId || typeof payload.newName !== "string") {
      return { ok: false, error: "参数缺失" };
    }
    return kg.renameEntity(payload.entityId, payload.newName);
  });
  // 到期执行调度：列表（含未来未到期 + 最近历史）+ 取消单条
  ipcMain.handle("scheduled-actions:list", (_event, limit?: number) =>
    kg.listScheduledActions(typeof limit === "number" && limit > 0 ? limit : 50)
  );
  ipcMain.handle("scheduled-actions:cancel", (_event, id: string) =>
    kg.cancelScheduledAction(String(id))
  );
  ipcMain.handle("kg:get-graph", (_event, limit?: number) => kg.getGraphSnapshot(limit ?? 80));
  ipcMain.handle("kg:analyze-personality", () => personalityAnalyzer.analyze());
  // SEC-16: kg:clear 不可逆破坏性操作——加主进程二次握手。
  // 第一次调用返回 confirmToken（10s TTL），renderer 必须带 token 再调一次才真清空。
  // 即使 renderer 被 XSS 一次性 fire-and-forget 也清不掉数据。
  // renderer 端 confirm dialog 仍保留作为 UX 防呆——这里是 main 进程独立兜底。
  safeHandle("kg:clear", KgClearSchema, (payload) =>
    withConfirmHandshake("kg:clear", payload ?? undefined, () => {
      kg.clearAll();
      logSystem("warning", "kg", "知识图谱已被清空（kg:clear 二次确认完成）");
      return { cleared: true };
    })
  );
  // SEC-16: kg:export 全量数据外泄面——同样加二次握手。
  // 攻击者拿到全量 entity + relation 即可重建用户画像，敏感度等同于数据库导出。
  safeHandle("kg:export", KgExportSchema, (payload) =>
    withConfirmHandshake("kg:export", payload ?? undefined, () => ({
      stats: kg.getStats(),
      entities: kg.getRelevantContext().relevantEntities,
      relations: kg.getRelevantContext().relevantRelations
    }))
  );

  // KG-D: 用户主权操作
  // SEC-16: zod 校验——entityId 字符集限定，pinned 必须 boolean
  safeHandle("kg:set-pinned", KgSetPinnedSchema, (payload) => {
    kg.setPinned(payload.entityId, payload.pinned);
    return { ok: true };
  });
  // SEC-16: zod 校验——entityId 字符集限定，防 SQL 注入辅助 / 路径遍历样的字符
  safeHandle("kg:delete-entity", KgDeleteEntitySchema, (entityId) => {
    return kg.deleteEntity(entityId);
  });
  ipcMain.handle("kg:get-entity-detail", (_event, entityId: string) => {
    return kg.getEntityDetail(entityId);
  });
  ipcMain.handle("kg:run-gc", () => kg.runEntityGC());

  // PHIL-1 / P0.4: 玻璃管家 negative patterns（用户教 Ovo "永远不要这样做"）
  ipcMain.handle("kg:add-negative-pattern", (_event, payload: {
    appName?: string;
    intent?: string;
    actionType?: string;
    patternText: string;
    contextSignature?: string;
  }) => {
    if (!payload.patternText || typeof payload.patternText !== "string") {
      return { ok: false, error: "patternText 必填" };
    }
    const id = kg.insertNegativePattern(payload);
    return { ok: true, id };
  });
  ipcMain.handle("kg:list-negative-patterns", (_event, limit?: number) =>
    kg.listNegativePatterns(typeof limit === "number" && limit > 0 ? limit : 100));
  // SEC-16: zod 校验——id 字符集限定
  safeHandle("kg:delete-negative-pattern", KgDeleteNegativePatternSchema, (id) => {
    kg.deleteNegativePattern(id);
    return { ok: true };
  });

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
  // A: toast 弹窗历史——主控台「通知历史」面板用
  ipcMain.handle("history:list-notifications", (_event, limit?: number) => kg.getToastHistory(limit ?? 100));
  // C: action 详情——给 ActionDetailDrawer 用
  ipcMain.handle("action:get-detail", (_event, actionId: string) => kg.getActionDetail(actionId));

  // 产出物看板 —— 用户反馈："Ovo 替我做的事在哪看？"
  ipcMain.handle("outputs:list-past", (_event, limit?: number) => kg.getRecentOutputs(limit ?? 50));
  ipcMain.handle("outputs:list-future", async () => {
    // 未来栏：拉 macOS Reminders + Calendar 未来 48h
    const { listUpcomingReminders, listUpcomingCalendarEvents } = await import("../macos-actions.js");
    const [reminders, events] = await Promise.all([
      listUpcomingReminders(48).catch(() => []),
      listUpcomingCalendarEvents(48).catch(() => [])
    ]);
    return { reminders, events };
  });

  // 反思 #2: 草稿台 —— Ovo 准备好但 evidence 验证未通过的 action
  ipcMain.handle("drafts:list", (_event, limit?: number) => kg.listDrafts(limit ?? 20));
  ipcMain.handle("drafts:dismiss", (_event, id: string) => kg.dismissDraft(id));
  // promote：标记草稿为 promoted，并把 action 真执行（重用 actionExecutor）
  ipcMain.handle("drafts:promote", async (_event, id: string) => {
    const promoted = kg.promoteDraft(id);
    if (!promoted.ok || !promoted.draft) {
      return { ok: false, error: "草稿不存在或已被处理" };
    }
    const d = promoted.draft;
    const actionType = d.actionType as ActionType;
    const action: AgentAction = {
      id: d.actionId,
      type: actionType,
      description: d.description,
      params: d.params,
      requireConfirm: false,
      priority: 50,
      evidence_level: "direct",
      evidence: ["user-promoted-draft"]
    };

    // R2-1: 不可逆 / 抢屏类（REQUIRE_CONFIRM_TYPES）即便用户 promote 也不直接执行——
    // 草稿可能搁置很久、params 已陈旧（如一封旧邮件正文），直发风险高。改为注册成 pending
    // 并弹"执行"浮窗，让用户对着最终参数再确认一次。其余可逆动作保持直接执行。
    if (REQUIRE_CONFIRM_TYPES.has(actionType)) {
      // R5-2：动作还没真执行，先把草稿退回 pending，这样用户若忽略确认浮窗，
      // 草稿仍留在草稿台不丢失（promoteDraft 之前已把它标 promoted）。
      kg.revertDraft(d.id);
      const pendingId = `${d.actionId}_promote_${Date.now().toString(36)}`;
      const pendingAction: AgentAction = { ...action, id: pendingId, requireConfirm: true };
      deps.registerPendingAction(pendingAction, d.pipelineId);
      deps.broadcast("action:pending", { pipelineId: d.pipelineId ?? "draft-promote", actions: [pendingAction] });
      return { ok: true, pending: true, message: "已转为待确认（不可逆动作需最终确认）" };
    }

    try {
      const result = await deps.actionExecutor.execute(action, {
        appName: d.appName,
        windowTitle: d.windowTitle,
        pipelineId: d.pipelineId
      });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  // F4: 流程 tab 进度条数据（按 pipeline 分组）
  ipcMain.handle("process:pipelines", (_event, limit?: number) => kg.getPipelineProgress(limit ?? 50));

  // system-log / business-log（KG 持久化的日志查询，归到 KG 模块）
  ipcMain.handle("system-log:list", (_event, limit = 200) => kg.getSystemLogs(limit));
  ipcMain.handle("business-log:list", (_event, payload?: { limit?: number; pipelineId?: string }) =>
    kg.getBusinessLogs(payload?.limit ?? 100, payload?.pipelineId)
  );
  ipcMain.handle(
    "business-log:create",
    (_event, payload: { pipelineId?: string; node: string; status: BusinessLogStatus; input?: unknown; output?: unknown; error?: string; meta?: Record<string, unknown> }) => ({
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
        status?: BusinessLogStatus;
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

  // 日志写入入口——logger:business 由 renderer 调，受 zod 投毒防护
  // SEC-17: KG 投毒防护——zod 校验所有字段长度上限
  safeHandle("logger:business", LoggerBusinessSchema, (payload) => ({
    id: kg.addBusinessLog({
      pipelineId: payload.pipelineId ?? null,
      node: payload.node,
      status: payload.status as BusinessLogStatus,
      input: payload.input,
      output: payload.output,
      error: payload.error,
      meta: payload.meta,
      startTime: Date.now()
    })
  }));
  ipcMain.handle(
    "logger:get-logs",
    (_event, payload?: { type?: "system" | "business"; limit?: number }) => {
      const limit = payload?.limit ?? 100;
      if (payload?.type === "business") return kg.getBusinessLogs(limit);
      return kg.getSystemLogs(limit);
    }
  );
}
