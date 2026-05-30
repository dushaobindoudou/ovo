/**
 * kg/metrics-store.ts —— 北极星指标埋点（metric_events 表）
 *
 * backlog 定义了 6 个指标但此前全无埋点。这里记录离散事件，
 * KnowledgeGraphEngine.getMetricsSummary 再结合 user_feedback + action history
 * 算出可读的指标摘要。与 drafts-store / scheduled-actions-store 一样以 db 为入参。
 *
 * 事件类型：
 *   - app_launch          每次主进程启动
 *   - first_value         首次采纳一条建议（= 拿到第一份价值，全局只记一次）
 *   - trust_pause         用户暂停观察
 *   - trust_blacklist     用户改黑名单
 *   - trust_delete_memory 用户删记忆实体
 *   - trust_replay        用户打开技术回放看因果链
 */
import type Database from "better-sqlite3";

export type MetricKind =
  | "app_launch"
  | "first_value"
  | "trust_pause"
  | "trust_blacklist"
  | "trust_delete_memory"
  | "trust_replay";

/** 全局只记一次的事件（重复调用忽略）。 */
const ONCE_KINDS = new Set<MetricKind>(["first_value"]);

export function recordMetric(db: Database.Database, kind: MetricKind, meta?: Record<string, unknown>): void {
  if (ONCE_KINDS.has(kind)) {
    const existing = db.prepare("SELECT 1 FROM metric_events WHERE kind = ? LIMIT 1").get(kind);
    if (existing) return;
  }
  db.prepare("INSERT INTO metric_events (ts, kind, meta) VALUES (?, ?, ?)")
    .run(Date.now(), kind, meta ? JSON.stringify(meta) : null);
}

export function countMetric(db: Database.Database, kind: MetricKind): number {
  const r = db.prepare("SELECT COUNT(*) as n FROM metric_events WHERE kind = ?").get(kind) as { n: number };
  return r?.n ?? 0;
}

export function firstMetricTs(db: Database.Database, kind: MetricKind): number | null {
  const r = db.prepare("SELECT MIN(ts) as t FROM metric_events WHERE kind = ?").get(kind) as { t: number | null };
  return r?.t ?? null;
}

/** GC：清掉很久以前的指标事件（保留 trust_* / first_value 的聚合意义靠计数，明细可裁剪）。 */
export function purgeOldMetrics(db: Database.Database, olderThanMs = 180 * 24 * 3600 * 1000): { purged: number } {
  const cutoff = Date.now() - olderThanMs;
  // first_value 永不清（TTFV 锚点）；app_launch 只保留计数意义，老的可清
  const r = db.prepare(
    "DELETE FROM metric_events WHERE kind = 'app_launch' AND ts < ?"
  ).run(cutoff);
  return { purged: r.changes };
}
