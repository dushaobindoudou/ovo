/**
 * ipc/pipeline.ts —— action:* + pipeline:* + suggestion:* + toast:* IPC handler
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 这里只放 channel handler；runPipelineForWindow / runAgentPipelineOnce
 * 这种"主流程编排" 留在 ipc-handlers.ts 主文件（CODE-10 单独的重构 PR）。
 */
import { safeExecute } from "../safe-execute.js";
import type { AgentAction, ActionType } from "../types.js";
import type { ActionResult } from "../action-executor.js";
import type { FeedbackEngine } from "../feedback-engine.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerPipelineHandlers(deps: IpcHandlerDeps) {
  const {
    ipcMain,
    kg,
    actionExecutor,
    feedbackEngine,
    pipelineLogger,
    options,
    startBizNode,
    finishBizNode,
    buildActionReceipts,
    consumePendingAction,
    mergePipelineAction,
    broadcast
  } = deps;

  // toast 弹窗激进度 + 免打扰
  ipcMain.handle("toast:set-verbosity", (_event, v: "silent" | "alerts" | "all") => {
    options.toastManager?.setVerbosity?.(v);
    deps.logSystem("info", "toast", "弹窗激进度更新", { verbosity: v });
    return { ok: true, verbosity: v };
  });
  ipcMain.handle("toast:set-dnd", (_event, minutes: number) => {
    safeExecute(
      () => options.toastManager?.setDoNotDisturb?.(Math.max(1, Math.floor(minutes))),
      "toast.set-dnd",
      undefined,
      "info"
    );
    return { ok: true };
  });

  // P1-3 验收台「重试」：用户对失败的产出物显式重试。
  //   用户主动点重试 = direct 意图 → 标 evidence_level=direct 绕过 evidence gating
  //   （历史动作没有实时屏幕证据，否则会被 grounder 误拒）。信任/确认规则照旧由 execute 内部处理。
  ipcMain.handle("action:rerun", async (_event, payload: {
    actionId?: string; type?: string; description?: string; params?: Record<string, unknown>;
  }) => {
    const action: AgentAction = {
      id: payload.actionId || `rerun_${Date.now().toString(36)}`,
      type: (payload.type as ActionType) ?? "other",
      description: payload.description ?? "",
      params: payload.params ?? {},
      requireConfirm: false,
      priority: 50,
      evidence_level: "direct"
    };
    const result = await actionExecutor.execute(action, {});
    deps.logSystem("info", "action.rerun", "重试产出物动作", {
      actionId: action.id, type: action.type, status: result.status
    });
    return { ok: result.status === "success", result };
  });

  // 用户反馈（accept / reject / ignored）
  ipcMain.handle("suggestion:feedback", (_event, payload: Parameters<FeedbackEngine["submitSuggestionFeedback"]>[0]) => {
    // R2 / R7: 用户 reject 后让 toast 短期屏蔽这类 type
    if (payload.action === "rejected" && payload.suggestionType) {
      safeExecute(
        () => options.toastManager?.noteRejection?.(payload.suggestionType),
        "toast.note-rejection",
        undefined,
        "info"
      );
    }
    // 北极星 TTFV：首次采纳一条建议 = 拿到第一份价值（recordMetric 内部对 first_value 去重）
    if (payload.action === "accepted") {
      safeExecute(() => kg.recordMetric("first_value", { suggestionType: payload.suggestionType }), "metric.first-value", undefined, "info");
    }
    // R2: offer accept 时立刻给一条 receipt（capability 引擎未上线，先告诉用户已记下偏好）
    if (payload.action === "accepted" && payload.suggestionType?.startsWith("offer:")) {
      safeExecute(
        () => options.toastManager?.enqueueReceipts?.([{
          id: `accept_${payload.suggestionId}_${Date.now().toString(36)}`,
          type: "receipt",
          title: "✓ ovo 已记下你的偏好",
          content: "ovo 会持续观察这类机会。capability 引擎下一轮上线后，会按你订的频率自动给你输出。",
          priority: 100
        }]),
        "toast.enqueue-receipt",
        undefined,
        "info"
      );
    }
    return feedbackEngine.submitSuggestionFeedback(payload);
  });

  // action:confirm —— SEC-11: 主进程 registry 决定权威 action
  ipcMain.handle(
    "action:confirm",
    async (_event, payload: { actionId?: string; action?: AgentAction; pipelineId?: string }) => {
      // SEC-11: 优先按 actionId 从主进程 registry 取真实 action；
      // renderer 提供的 payload.action 不再被信任（防 XSS 伪造）。
      const requestedId = payload.actionId ?? payload.action?.id;
      if (!requestedId) {
        const failed: ActionResult = {
          actionId: "unknown",
          status: "failed",
          output: "",
          duration: 0,
          error: "缺少 actionId — 请重启 Ovo 或重新触发该动作"
        };
        // 失败也广播，让所有窗口清掉孤儿 pending 行（即使知道是无效请求）
        try { broadcast("action:result", { pipelineId: payload.pipelineId ?? "manual", results: [failed] }); } catch { /* */ }
        return failed;
      }
      const registered = consumePendingAction(requestedId);
      if (!registered) {
        // 用户 Bug 真根因：consume 失败时之前直接 return 不广播，导致 pending 列表永远孤儿。
        // 失败原因可能是：① Ovo 重启过 ② 10 分钟 TTL 过期 ③ 同一 action 被双击触发两次（第 2 次没值）
        // 修复：广播 action:result 让所有 renderer 清掉对应 pending 行 + 给用户友好错误
        const failed: ActionResult = {
          actionId: requestedId,
          status: "failed",
          output: "",
          duration: 0,
          error: "这条待办已失效（可能 Ovo 重启过 / 等待太久 / 重复点击）— 请重新让 Ovo 观察一次"
        };
        try {
          broadcast("action:result", {
            pipelineId: payload.pipelineId ?? "manual",
            results: [failed]
          });
        } catch { /* */ }
        return failed;
      }
      const action = registered.action;
      const pipelineId = registered.pipelineId ?? payload.pipelineId;
      const bizLogId = startBizNode(pipelineId ?? null, "action.confirm.execute", {
        actionId: action.id,
        description: action.description
      });
      // Bug 真根因（2026-05-20）：用户主动点"确认执行"已经是 direct 级意图，
      // 但 LLM 当初输出的 action 可能没填 evidence_level（→ default speculative）
      // 或填了 inferred 但 evidence 数组在屏幕上找不到 → gateByEvidence 把这条
      // **用户已确认**的 action 也拒了 / 落了草稿台。
      //
      // 修复：confirm 路径在调 execute 前强制把 evidence_level=direct + evidence
      // 注入"用户已确认"标记，绕过 grounding 验证。同 promoteDraft 路径一致。
      const confirmedAction = {
        ...action,
        evidence_level: "direct" as const,
        evidence: ["用户在确认对话框点了「确认执行」"]
      };
      const result = await actionExecutor.execute(confirmedAction);
      // Bug 修复：getActionHistory 期待 output.results[]（数组），confirm 路径之前写成
      // 单对象 {actionId, duration, status}，导致 dedupe 不到 → 用户看不到确认后的 success。
      // 现在和 actions.execute 同样的 results[] 结构 + 保留 input.actions 让 description 能查到。
      finishBizNode(bizLogId, result.status === "success" ? "success" : "failed", {
        output: {
          results: [{
            actionId: result.actionId,
            type: action.type,
            status: result.status,
            output: result.output,
            duration: result.duration,
            error: result.error
          }]
        },
        error: result.error
      });
      if (pipelineId) mergePipelineAction(pipelineId, action.id, result);
      // Bug 修复：广播 action:result 让所有 renderer（Console / Toast / Floating panel）的
      // usePendingActions 都能清掉对应 pending row。之前只有触发 ConfirmDialog 的窗口本地
      // 清，其他窗口的 "等你确认" 列表永远不更新。
      try {
        broadcast("action:result", {
          pipelineId: pipelineId ?? "manual",
          results: [{
            actionId: result.actionId,
            type: action.type,
            status: result.status,
            output: result.output,
            duration: result.duration,
            error: result.error
          }]
        });
      } catch { /* broadcast 失败不影响主流程 */ }
      // P4: 用户刚确认的 action 完成后也弹回执
      safeExecute(
        () => {
          const receipts = buildActionReceipts([action], [result]);
          if (receipts.length && options.onReceipts) options.onReceipts(receipts);
        },
        "ipc.action-receipt",
        undefined,
        "info"
      );
      return result;
    }
  );

  // action:cancel
  ipcMain.handle(
    "action:cancel",
    (_event, payload: { actionId: string; pipelineId?: string }) => {
      // SEC-11: 取消时也从 registry 移除，避免后续 confirm 误判
      const cancelled = consumePendingAction(payload.actionId);
      // T8 反向校准：用户主动取消 pending action = "这个场景你太激进了"的强信号 → bump
      if (cancelled?.action?.type) {
        try { kg.bumpInflation({ actionType: cancelled.action.type }); } catch { /* 不阻断取消 */ }
      }
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
        input: { actionId: payload.actionId },
        output: result
      });
      if (payload.pipelineId) mergePipelineAction(payload.pipelineId, payload.actionId, result);
      // 同 confirm 路径 — 广播 action:result 让所有窗口清 pending（status=cancelled 也算 settled）
      try {
        broadcast("action:result", {
          pipelineId: payload.pipelineId ?? "manual",
          results: [{
            actionId: result.actionId,
            status: result.status,
            output: result.output,
            duration: result.duration
          }]
        });
      } catch { /* */ }
      return result;
    }
  );

  // R4-2: 撤销最近一次自动复制（恢复复制前的剪贴板）
  ipcMain.handle("action:undo-clipboard", (_event, actionId: string) =>
    actionExecutor.undoClipboard(String(actionId ?? ""))
  );

  // pipeline:* 日志查询 / 评分 / 清空
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
}
