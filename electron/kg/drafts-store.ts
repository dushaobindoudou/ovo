/**
 * kg/drafts-store.ts —— 草稿台 (drafts) + 反向校准 (evidence_inflation)
 *
 * 从 knowledge-graph.ts 抽出（E1/#3 god module 拆分）。反思 #2 的"第三种状态"：
 *   - 草稿台：Ovo 准备好但 evidence 未验证的 action 落这里，用户决定是否真执行
 *   - evidence_inflation：用户拒绝（弃用草稿/取消 action）→ bump，合成 prompt 据此保守化
 *
 * 这些函数以 db 为入参（不依赖 KnowledgeGraphEngine 实例），KnowledgeGraphEngine 的同名
 * public 方法只做薄委托，调用方零改动。
 */
import type Database from "better-sqlite3";

export interface DraftRow {
  id: string;
  createdAt: number;
  actionId: string;
  actionType: string;
  description: string;
  params: Record<string, unknown>;
  evidenceLevel: string;
  evidence: string[];
  groundingStatus: string;
  groundingReason: string;
  appName?: string;
  windowTitle?: string;
  pipelineId?: string;
}

interface DraftDbRow {
  id: string; created_at: number; pipeline_id: string | null;
  action_id: string; action_type: string; description: string;
  params: string; evidence_level: string; evidence: string;
  grounding_status: string; grounding_reason: string;
  app_name: string | null; window_title: string | null;
}

function parseJson<T>(s: string | undefined, fallback: T): T {
  try { return JSON.parse(s ?? "") as T; } catch { return fallback; }
}

function mapDraft(r: DraftDbRow): DraftRow {
  return {
    id: r.id,
    createdAt: r.created_at,
    actionId: r.action_id,
    actionType: r.action_type,
    description: r.description,
    params: parseJson<Record<string, unknown>>(r.params, {}),
    evidenceLevel: r.evidence_level,
    evidence: parseJson<string[]>(r.evidence, []),
    groundingStatus: r.grounding_status,
    groundingReason: r.grounding_reason,
    appName: r.app_name ?? undefined,
    windowTitle: r.window_title ?? undefined,
    pipelineId: r.pipeline_id ?? undefined
  };
}

const DRAFT_COLS =
  "id, created_at, pipeline_id, action_id, action_type, description, params, " +
  "evidence_level, evidence, grounding_status, grounding_reason, app_name, window_title";

export function addDraft(db: Database.Database, payload: {
  id: string; actionId: string; actionType: string; description: string;
  params: Record<string, unknown>; evidenceLevel: string; evidence: string[];
  groundingStatus: string; groundingReason: string;
  appName?: string; windowTitle?: string; pipelineId?: string;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO drafts
     (id, created_at, pipeline_id, action_id, action_type, description, params,
      evidence_level, evidence, grounding_status, grounding_reason,
      app_name, window_title, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    payload.id, Date.now(), payload.pipelineId ?? null, payload.actionId,
    payload.actionType, payload.description, JSON.stringify(payload.params ?? {}),
    payload.evidenceLevel, JSON.stringify(payload.evidence ?? []),
    payload.groundingStatus, payload.groundingReason,
    payload.appName ?? null, payload.windowTitle ?? null
  );
}

export function listDrafts(db: Database.Database, limit = 20): DraftRow[] {
  const rows = db.prepare(
    `SELECT ${DRAFT_COLS} FROM drafts WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as DraftDbRow[];
  return rows.map(mapDraft);
}

export function promoteDraft(db: Database.Database, id: string): { ok: boolean; draft?: DraftRow } {
  const row = db.prepare(
    `SELECT ${DRAFT_COLS} FROM drafts WHERE id = ? AND status = 'pending'`
  ).get(id) as DraftDbRow | undefined;
  if (!row) return { ok: false };
  db.prepare("UPDATE drafts SET status = 'promoted' WHERE id = ?").run(id);
  return { ok: true, draft: mapDraft(row) };
}

/** 标 dismissed。onBump：dismiss 成功时回调 (app, action_type) 供反向校准。 */
export function dismissDraft(
  db: Database.Database,
  id: string,
  onBump?: (ctx: { appName?: string; actionType?: string }) => void
): { ok: boolean } {
  const row = db.prepare(
    "SELECT app_name, action_type FROM drafts WHERE id = ? AND status = 'pending'"
  ).get(id) as { app_name: string | null; action_type: string | null } | undefined;
  const r = db.prepare("UPDATE drafts SET status = 'dismissed' WHERE id = ? AND status = 'pending'").run(id);
  if (r.changes > 0 && row && onBump) {
    try { onBump({ appName: row.app_name ?? undefined, actionType: row.action_type ?? undefined }); }
    catch { /* 反向校准失败不阻断 dismiss */ }
  }
  return { ok: r.changes > 0 };
}

/** R5-2：promoted 草稿退回 pending（promote 转待确认但未执行时，避免孤儿草稿）。 */
export function revertDraft(db: Database.Database, id: string): { ok: boolean } {
  const r = db.prepare("UPDATE drafts SET status = 'pending' WHERE id = ? AND status = 'promoted'").run(id);
  return { ok: r.changes > 0 };
}

export function expireOldDrafts(db: Database.Database, olderThanMs = 7 * 24 * 3600 * 1000): { expired: number } {
  const cutoff = Date.now() - olderThanMs;
  const r = db.prepare(
    "UPDATE drafts SET status = 'expired' WHERE status = 'pending' AND created_at < ?"
  ).run(cutoff);
  return { expired: r.changes };
}

// ── 反向校准 evidence_inflation ──
/** 衰减半衰期（毫秒）：7 天前的一次拒绝权重减半。 */
export const INFLATION_HALFLIFE_MS = 7 * 24 * 3600 * 1000;

export function bumpInflation(
  db: Database.Database,
  genId: (prefix: string) => string,
  ctx: { appName?: string; actionType?: string; intent?: string },
  delta = 1
): void {
  const app = ctx.appName ?? "";
  const type = ctx.actionType ?? "";
  const intent = ctx.intent ?? "";
  if (!app && !type) return; // 无定位价值，跳过
  const now = Date.now();
  db.prepare(
    `INSERT INTO evidence_inflation (id, app_name, action_type, intent, score, last_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(app_name, action_type, intent)
     DO UPDATE SET score = score + ?, last_at = ?`
  ).run(genId("infl"), app, type, intent, delta, now, delta, now);
}

export function getInflationWarnings(
  db: Database.Database,
  ctx: { appName?: string; intent?: string },
  threshold = 3,
  limit = 5
): Array<{ appName: string; actionType: string; intent: string; effectiveScore: number }> {
  const app = ctx.appName ?? "";
  const intent = ctx.intent ?? "";
  const rows = db.prepare(
    `SELECT app_name, action_type, intent, score, last_at
       FROM evidence_inflation
      WHERE (app_name = ? OR app_name = '') AND (intent = ? OR intent = '')`
  ).all(app, intent) as Array<{
    app_name: string; action_type: string; intent: string; score: number; last_at: number;
  }>;
  const now = Date.now();
  const out: Array<{ appName: string; actionType: string; intent: string; effectiveScore: number }> = [];
  for (const r of rows) {
    const ageMs = Math.max(0, now - r.last_at);
    const decay = Math.pow(0.5, ageMs / INFLATION_HALFLIFE_MS);
    const effectiveScore = r.score * decay;
    if (effectiveScore >= threshold) {
      out.push({ appName: r.app_name, actionType: r.action_type, intent: r.intent, effectiveScore });
    }
  }
  out.sort((a, b) => b.effectiveScore - a.effectiveScore);
  return out.slice(0, limit);
}
