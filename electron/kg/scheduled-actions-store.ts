/**
 * kg/scheduled-actions-store.ts —— 「到期执行」调度表（scheduled_actions）
 *
 * action 携带未来 fire_at 时不立即执行，先落这里；scheduler 每分钟扫一次到期项
 * （status='pending' AND fire_at <= now），交给 actionExecutor.execute 执行——信任/
 * 确认规则照旧（送发类仍走待确认 toast，不会到点偷偷发）。recurrence 支持每天/每周重排。
 *
 * 与 drafts-store 一样以 db 为入参，KnowledgeGraphEngine 只做薄委托。
 */
import type Database from "better-sqlite3";
import type { AgentAction } from "../types.js";

export type Recurrence = "none" | "daily" | "weekly";
export type ScheduledStatus = "pending" | "fired" | "cancelled" | "failed";

export interface ScheduledActionRow {
  id: string;
  createdAt: number;
  fireAt: number;
  recurrence: Recurrence;
  action: AgentAction;
  title: string;
  appName?: string;
  source: string;
  status: ScheduledStatus;
  lastFiredAt?: number;
  lastResult?: string;
}

interface ScheduledDbRow {
  id: string; created_at: number; fire_at: number; recurrence: string;
  action_json: string; title: string; app_name: string | null;
  source: string; status: string; last_fired_at: number | null; last_result: string | null;
}

const COLS =
  "id, created_at, fire_at, recurrence, action_json, title, app_name, source, status, last_fired_at, last_result";

function mapRow(r: ScheduledDbRow): ScheduledActionRow {
  let action: AgentAction;
  try { action = JSON.parse(r.action_json) as AgentAction; }
  catch { action = { id: r.id, description: r.title, params: {}, requireConfirm: false, priority: 50 }; }
  return {
    id: r.id,
    createdAt: r.created_at,
    fireAt: r.fire_at,
    recurrence: (["none", "daily", "weekly"].includes(r.recurrence) ? r.recurrence : "none") as Recurrence,
    action,
    title: r.title,
    appName: r.app_name ?? undefined,
    source: r.source,
    status: r.status as ScheduledStatus,
    lastFiredAt: r.last_fired_at ?? undefined,
    lastResult: r.last_result ?? undefined
  };
}

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function addScheduledAction(db: Database.Database, payload: {
  id: string;
  fireAt: number;
  recurrence?: Recurrence;
  action: AgentAction;
  title: string;
  appName?: string;
  source?: string;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO scheduled_actions
       (id, created_at, fire_at, recurrence, action_json, title, app_name, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    payload.id, Date.now(), payload.fireAt, payload.recurrence ?? "none",
    JSON.stringify(payload.action), payload.title.slice(0, 200),
    payload.appName ?? null, payload.source ?? "agent"
  );
}

/** 到期且仍待执行的项（fire_at <= now）。 */
export function listDueScheduledActions(db: Database.Database, now = Date.now()): ScheduledActionRow[] {
  const rows = db.prepare(
    `SELECT ${COLS} FROM scheduled_actions
      WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC`
  ).all(now) as ScheduledDbRow[];
  return rows.map(mapRow);
}

/** UI 列表：默认按 fire_at 升序，含未来未到期 + 历史（最近 limit 条）。 */
export function listScheduledActions(db: Database.Database, limit = 50): ScheduledActionRow[] {
  const rows = db.prepare(
    `SELECT ${COLS} FROM scheduled_actions
      ORDER BY (status = 'pending') DESC, fire_at ASC LIMIT ?`
  ).all(limit) as ScheduledDbRow[];
  return rows.map(mapRow);
}

/**
 * 标记一次触发结果。
 *   - recurrence=none → status 落到 fired/failed（终态）
 *   - recurrence=daily/weekly 且成功 → 重排到下一个周期、status 回 pending
 */
export function settleScheduledAction(
  db: Database.Database,
  id: string,
  ok: boolean,
  resultSummary: string
): void {
  const row = db.prepare(
    "SELECT recurrence, fire_at FROM scheduled_actions WHERE id = ?"
  ).get(id) as { recurrence: string; fire_at: number } | undefined;
  if (!row) return;
  const now = Date.now();
  const result = (resultSummary ?? "").slice(0, 480);
  const recurring = ok && (row.recurrence === "daily" || row.recurrence === "weekly");
  if (recurring) {
    const step = row.recurrence === "daily" ? DAY_MS : WEEK_MS;
    // 从原 fire_at 累加 step，直到落在未来（避免停机一段时间后连发多次）
    let next = row.fire_at + step;
    while (next <= now) next += step;
    db.prepare(
      "UPDATE scheduled_actions SET status = 'pending', fire_at = ?, last_fired_at = ?, last_result = ? WHERE id = ?"
    ).run(next, now, result, id);
  } else {
    db.prepare(
      "UPDATE scheduled_actions SET status = ?, last_fired_at = ?, last_result = ? WHERE id = ?"
    ).run(ok ? "fired" : "failed", now, result, id);
  }
}

export function cancelScheduledAction(db: Database.Database, id: string): { ok: boolean } {
  const r = db.prepare(
    "UPDATE scheduled_actions SET status = 'cancelled' WHERE id = ? AND status = 'pending'"
  ).run(id);
  return { ok: r.changes > 0 };
}

/** GC：清掉很久以前的终态项（fired/cancelled/failed）。 */
export function purgeOldScheduledActions(db: Database.Database, olderThanMs = 30 * DAY_MS): { purged: number } {
  const cutoff = Date.now() - olderThanMs;
  const r = db.prepare(
    "DELETE FROM scheduled_actions WHERE status IN ('fired','cancelled','failed') AND COALESCE(last_fired_at, created_at) < ?"
  ).run(cutoff);
  return { purged: r.changes };
}
