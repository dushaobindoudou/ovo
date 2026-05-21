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
    runPromptSelfEval
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
