/**
 * ipc/pending-actions.ts —— pending action registry + flush/restore 持久化
 *
 * SEC-11 + N7：renderer 永远不持有真实 AgentAction 对象（防 XSS 伪造）；
 * 主进程持有 registry，10 分钟 TTL，过期自动清理；before-quit 时落盘，
 * 下次启动恢复未决 action（避免合盖时丢决策）。
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 */
import { app } from "electron";
import fsSync from "node:fs";
import pathLib from "node:path";
import { errorLogger } from "../error-logger.js";
import { getUserDataPath } from "../electron-loader.js";
import type { AgentAction } from "../types.js";

interface PendingEntry {
  action: AgentAction;
  pipelineId?: string;
  expiresAt: number;
}

export interface PendingActionRegistry {
  register: (action: AgentAction, pipelineId?: string) => void;
  consume: (actionId: string) => { action: AgentAction; pipelineId?: string } | null;
}

export function createPendingActionRegistry(): PendingActionRegistry {
  const registry = new Map<string, PendingEntry>();
  const TTL_MS = 10 * 60_000;

  const register = (action: AgentAction, pipelineId?: string) => {
    registry.set(action.id, {
      action,
      pipelineId,
      expiresAt: Date.now() + TTL_MS
    });
  };

  const consume = (actionId: string): { action: AgentAction; pipelineId?: string } | null => {
    const entry = registry.get(actionId);
    if (!entry) return null;
    registry.delete(actionId);
    if (entry.expiresAt < Date.now()) return null;
    return { action: entry.action, pipelineId: entry.pipelineId };
  };

  // GC 过期项（每 5 分钟）
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of registry) {
      if (entry.expiresAt < now) registry.delete(id);
    }
  }, 5 * 60_000).unref?.();

  // N7: before-quit 时 flush 未确认 pending action 到磁盘，下次启动恢复
  // 避免用户合盖前看到的 pending action 重启后消失（带走未决定的操作）
  const flushPath = () => pathLib.join(getUserDataPath(), "pending-actions.json");
  const flush = () => {
    try {
      const now = Date.now();
      const entries = Array.from(registry.entries())
        .filter(([, e]) => e.expiresAt > now)
        .map(([id, e]) => ({ id, action: e.action, pipelineId: e.pipelineId, expiresAt: e.expiresAt }));
      fsSync.writeFileSync(flushPath(), JSON.stringify(entries), "utf8");
    } catch (e) {
      errorLogger.alert("warn", "pending-actions.flush", "pending action flush 失败", {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  };
  const restore = () => {
    try {
      const filePath = flushPath();
      if (!fsSync.existsSync(filePath)) return;
      const raw = fsSync.readFileSync(filePath, "utf8");
      const arr = JSON.parse(raw) as Array<{ id: string; action: AgentAction; pipelineId?: string; expiresAt: number }>;
      const now = Date.now();
      let restored = 0;
      for (const item of arr) {
        if (item.expiresAt > now) {
          registry.set(item.id, {
            action: item.action,
            pipelineId: item.pipelineId,
            expiresAt: item.expiresAt
          });
          restored++;
        }
      }
      try { fsSync.unlinkSync(filePath); } catch { /* */ }
      if (restored > 0) {
        errorLogger.alert("info", "pending-actions.restore", `恢复 ${restored} 条未决 action`);
      }
    } catch { /* 第一次启动没文件 / corrupt 都忽略 */ }
  };

  // 启动时恢复一次 + before-quit 时 flush
  restore();
  app.on("before-quit", flush);

  return { register, consume };
}
