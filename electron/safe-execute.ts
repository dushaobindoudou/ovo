/**
 * C1 + A4: 统一的 swallow 替代。
 *
 * 过去 28+ 处空 catch 把错误完全吞掉——
 * 用户感受到"Ovo 越来越不灵了"但 debug 没有线索。
 *
 * safeExecute 接管所有非致命错误的处理：
 *   - 把 error 翻译成人话写进 errorLogger（保留 raw 供 debug）
 *   - 调用方拿到一个安全的 fallback 值
 *   - 不阻断主流程
 *
 * 用法：
 *   const v = safeExecute(() => kg.upsertEntity(...), "kg.upsert", undefined);
 *   const v = await safeExecuteAsync(() => fetch(...), "agent.api-call", null);
 */
import { errorLogger } from "./error-logger.js";
import { translateError } from "./error-translator.js";

/**
 * 同步版。任意 throw 都被捕获并落日志，返回 fallback。
 */
export function safeExecute<T>(
  fn: () => T,
  source: string,
  fallback: T,
  level: "info" | "warn" | "error" = "warn"
): T {
  try {
    return fn();
  } catch (e) {
    const t = translateError(e);
    try {
      errorLogger.alert(level, source, t.title, {
        detail: t.detail,
        category: t.category,
        raw: t.raw,
        stack: e instanceof Error ? e.stack : undefined
      });
    } catch { /* errorLogger 也炸了——下一层 fallback */ }
    return fallback;
  }
}

/**
 * 异步版。
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  source: string,
  fallback: T,
  level: "info" | "warn" | "error" = "warn"
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const t = translateError(e);
    try {
      errorLogger.alert(level, source, t.title, {
        detail: t.detail,
        category: t.category,
        raw: t.raw,
        stack: e instanceof Error ? e.stack : undefined
      });
    } catch { /* */ }
    return fallback;
  }
}
