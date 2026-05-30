/**
 * ipc/schedulers.ts —— 集中注册所有 scheduler 周期任务
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 *
 * 这里负责的 scheduler 任务：
 *   - kg-decay           关系强度每日衰减
 *   - kg-summarize       事件聚合摘要（H10(E)）
 *   - prefs-update       反馈驱动 personalityOverrides 更新（H10(F)）
 *   - memory-monitor     主进程内存告警
 *   - health-check       自动捕获健康检查
 *   - kg-daily-gc        KG GC + 数据保留期清理
 *   - prompt-self-eval   每日 prompt 自评（P8 / GEPA 简化版）
 *
 * 不包括 agent-pipeline scheduler——它依赖 runAgentPipelineOnce，
 * 仍在 ipc-handlers.ts 主文件注册（紧贴 pipeline 编排逻辑）。
 *
 * 设计：传入 deps（注意：这是个超集，含 runSummarizeOnce / runPromptSelfEval
 * 的回调）；register 返回 startupGcTimer 句柄给主入口做 before-quit 清理。
 */
import { app } from "electron";
import { scheduler } from "../scheduler.js";
import { errorLogger } from "../error-logger.js";
import { preferencesStore } from "../preferences-store.js";
import { safeExecuteAsync } from "../safe-execute.js";
import type { AgentBridge } from "../agent-bridge.js";
import type { AutoCaptureService } from "../auto-capture.js";
import type { KnowledgeGraphEngine } from "../knowledge-graph.js";
import type { ActionExecutor, ActionResult } from "../action-executor.js";
import type { AgentAction, ActionType, AgentSuggestion } from "../types.js";
import type { LogSystemFn, HealthConfig } from "./_shared.js";

export interface SchedulerDeps {
  kg: KnowledgeGraphEngine;
  agentBridge: AgentBridge;
  autoCaptureService: AutoCaptureService;
  logSystem: LogSystemFn;
  broadcast: (channel: string, payload: unknown) => void;
  healthConfig: HealthConfig;
  setLatestHealth: (v: unknown) => void;
  runSummarizeOnce: () => Promise<void>;
  runPromptSelfEval: () => Promise<void>;
  // 到期执行调度（scheduled-actions-fire）所需：
  actionExecutor: ActionExecutor;
  registerPendingAction: (action: AgentAction, pipelineId?: string) => void;
  toastManager?: {
    enqueueActions?: (actions: AgentAction[], pipelineId: string) => void;
    enqueueReceipts?: (receipts: AgentSuggestion[]) => void;
  };
}

/** 到点必须确认、永不无人值守自动发送的类型（安全底线） */
const ALWAYS_CONFIRM_AT_FIRE = new Set<ActionType>(["send_email", "send_imessage"]);
/** 过期超过此时长的调度直接跳过，避免停机一段时间后回来洪流式补发陈旧动作 */
const SCHED_STALE_MS = 6 * 3600 * 1000;
/** 每次扫描最多处理多少条到期项，防止一次性淹没执行器 */
const SCHED_MAX_PER_TICK = 5;

/** 从 ActionResult 里抽一句简短结果摘要落到 last_result。 */
function summarizeActionResult(r: ActionResult): string {
  if (r.error) return r.error.slice(0, 200);
  try {
    const parsed = JSON.parse(r.output ?? "{}") as { summary?: string };
    if (parsed.summary) return String(parsed.summary).slice(0, 200);
  } catch { /* output 非 JSON，忽略 */ }
  return (r.output ?? r.status ?? "").slice(0, 200);
}

/** 注册所有 scheduler 周期任务。返回需要在 before-quit 清理的句柄。 */
export function registerSchedulers(deps: SchedulerDeps): { startupGcTimer: NodeJS.Timeout } {
  const {
    kg,
    autoCaptureService,
    logSystem,
    broadcast,
    healthConfig,
    setLatestHealth,
    runSummarizeOnce,
    runPromptSelfEval,
    actionExecutor,
    registerPendingAction,
    toastManager
  } = deps;

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

  // H10(E) 事件聚合摘要：每 10 分钟扫一次
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

  // 主进程内存监控
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

  // 自检健康检查
  scheduler.register({
    id: "health-check",
    intervalMs: healthConfig.intervalSeconds * 1000,
    task: async () => {
      if (!healthConfig.enabled) return;
      const report = await autoCaptureService.runHealthCheck();
      setLatestHealth(report);
      broadcast("health:update", report);
    },
    onError: (error) => {
      errorLogger.alert("warn", "health-check", "自检任务异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // KG-C: 每日 KG GC，清噪音 entity（黑名单 + 一次性低质量孤儿 + 极低质量过期）
  // 启动后立即跑一次（清掉历史污染），之后每 24h 跑一次
  scheduler.register({
    id: "kg-daily-gc",
    intervalMs: 24 * 3600 * 1000,
    task: async () => {
      try {
        const result = kg.runEntityGC();
        logSystem("info", "kg.gc", "KG 每日 GC 完成", result);
        // P0.11: 数据保留期改为读用户配置；默认 30 天
        // -1 = 不保留（每次 GC 都清光，等于关 Ovo 立刻删）
        //  0 = 永久（跳过 GC）
        const retentionDays = preferencesStore.getRetentionDays();
        if (retentionDays === 0) {
          logSystem("info", "kg.retention", "数据保留期=永久，跳过 GC", { retentionDays });
        } else {
          const effective = retentionDays === -1 ? 0 : retentionDays;
          const ret = kg.runRetentionGC(effective);
          logSystem("info", "kg.retention", "数据保留期 GC 完成", { ...ret, retentionDays });
        }
        // R2-2: 草稿过期清理。expireOldDrafts 之前是死代码（无调度方），导致 drafts
        // 表 pending 行无限增长。接进每日 GC，默认 7 天未处理的草稿标 expired。
        const draftRet = kg.expireOldDrafts();
        if (draftRet.expired > 0) logSystem("info", "kg.drafts-gc", "过期草稿清理", draftRet);
        // 到期执行调度：清掉 30 天前的终态项（fired / cancelled / failed）
        const schedRet = kg.purgeOldScheduledActions();
        if (schedRet.purged > 0) logSystem("info", "kg.sched-gc", "过期调度动作清理", schedRet);
        const metricRet = kg.purgeOldMetrics();
        if (metricRet.purged > 0) logSystem("info", "kg.metric-gc", "过期指标事件清理", metricRet);
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
  // CODE-16: 保留 handle + before-quit 清理，避免 5s 内 quit 时 GC 跑在已关 db 上
  const startupGcTimer = setTimeout(() => {
    try {
      const result = kg.runEntityGC();
      logSystem("info", "kg.gc", "KG 启动 GC 完成", result);
    } catch (e) {
      logSystem("warning", "kg.gc", "KG 启动 GC 跳过", {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }, 5_000);
  app.on("before-quit", () => clearTimeout(startupGcTimer));

  // P8: 每日 prompt 自评（GEPA 简化版）
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

  // 到期执行调度：每分钟扫一次 scheduled_actions 里到期且 pending 的项。
  //   - 送发类（send_email / send_imessage）到点不偷发 → 转待确认 toast（settle 视作已触发）
  //   - 可逆 / Ovo 内部 / 信任≥3 的类型 → 直接执行 + 弹透明回执
  //   - 过期超过 SCHED_STALE_MS 的跳过（停机回来不补发陈旧动作）
  //   - 单 tick 限流 SCHED_MAX_PER_TICK 条
  scheduler.register({
    id: "scheduled-actions-fire",
    intervalMs: 60_000,
    task: async () => {
      const due = kg.listDueScheduledActions();
      if (due.length === 0) return;
      let processed = 0;
      for (const row of due) {
        if (processed >= SCHED_MAX_PER_TICK) break;
        processed++;
        const now = Date.now();

        // 过期太久 → 跳过（recurrence=daily/weekly 时 settle(ok) 会重排到下个周期）
        if (now - row.fireAt > SCHED_STALE_MS) {
          kg.settleScheduledAction(
            row.id, true,
            `已过期跳过（到期于约 ${Math.round((now - row.fireAt) / 3600000)}h 前）`
          );
          logSystem("info", "sched.fire", "跳过过期调度动作", { id: row.id, title: row.title });
          continue;
        }

        // 用户/agent 之前已显式安排 → direct 意图，绕过 evidence gating
        //（到点没有实时屏幕证据，否则会被 grounder 误判 speculative 拒掉）
        const action: AgentAction = { ...row.action, evidence_level: "direct" };
        const type = action.type ?? "other";
        const trustLevel = preferencesStore.getTrustLevel(type);
        const mustConfirm =
          ALWAYS_CONFIRM_AT_FIRE.has(type) || action.requireConfirm === true || trustLevel < 3;
        const pipelineId = `scheduled:${row.id}`;

        try {
          if (mustConfirm) {
            registerPendingAction(action, pipelineId);
            broadcast("action:pending", { pipelineId, actions: [action] });
            toastManager?.enqueueActions?.([action], pipelineId);
            kg.settleScheduledAction(row.id, true, "已到点 → 弹出待确认");
            logSystem("info", "sched.fire", "到点动作转待确认", { id: row.id, type });
          } else {
            const result = await actionExecutor.execute(action, {});
            const ok = result.status === "success";
            kg.settleScheduledAction(row.id, ok, summarizeActionResult(result));
            // 透明回执：让用户知道 Ovo 到点替他做了什么（即使控制台没开）
            toastManager?.enqueueReceipts?.([{
              id: `sched_${row.id}_${now.toString(36)}`,
              type: ok ? "info" : "risk",
              title: ok ? `已到点执行：${row.title}` : `到点执行失败：${row.title}`,
              content: ok ? (action.description || "") : (result.error || "执行失败"),
              priority: 80
            }]);
            logSystem(ok ? "info" : "warning", "sched.fire", "到点动作执行完成", { id: row.id, type, ok });
          }
        } catch (e) {
          kg.settleScheduledAction(row.id, false, e instanceof Error ? e.message : String(e));
          logSystem("error", "sched.fire", "到点动作执行异常", {
            id: row.id, error: e instanceof Error ? e.message : String(e)
          });
        }
      }
    },
    onError: (error) => {
      errorLogger.alert("warn", "scheduled-actions-fire", "到期执行调度异常", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 启动后立即跑一次健康检查（异步），不阻塞 IPC 注册
  void safeExecuteAsync(
    async () => {
      const report = await autoCaptureService.runHealthCheck();
      setLatestHealth(report);
      broadcast("health:update", report);
    },
    "ipc.initial-health-check",
    undefined,
    "warn"
  );

  return { startupGcTimer };
}
