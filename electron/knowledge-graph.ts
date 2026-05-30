import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { ExtractedEntity, ExtractedRelation } from "./types.js";
import type { GraphContext } from "./prompt-engine.js";
import { getUserDataPath } from "./electron-loader.js";
import { redactSensitive } from "./sensitive-filter.js";
import { secretsStore } from "./secrets-store.js";
import { safeExecute } from "./safe-execute.js";
import { bootstrap as bootstrapSchema, getSchemaVersionInfo as schemaVersionInfo } from "./kg/migrations.js";
import * as draftsStore from "./kg/drafts-store.js";
import type { DraftRow } from "./kg/drafts-store.js";
import * as schedStore from "./kg/scheduled-actions-store.js";

// NEW-1 + DATA-7: memory_events.content 入库截断长度（足够保留上下文，避免无界增长）
const MEMORY_CONTENT_MAX_CHARS = 8000;
const MEMORY_SUMMARY_MAX_CHARS = 1000;
const MEMORY_TITLE_MAX_CHARS = 200;

// 产出物策展：这些 action 不是"用户能用的成品"——log_note 是内部归档，
// open_url/search_web 是导航动作而非交付物。产出物页只展真正的交付物
// （草稿/总结/提醒/待办/日历/复制内容），归档与导航留在「动作清单」里。
const NON_DELIVERABLE_OUTPUT_TYPES = new Set(["log_note", "open_url", "search_web"]);

/** 同义词表：用于实体去重的人工映射，lowercase 键 → 规范化名称。 */
const ENTITY_SYNONYMS: Record<string, string> = {
  "vs code": "visual studio code",
  vscode: "visual studio code",
  "chatgpt": "chatgpt",
  "gpt-4": "gpt-4",
  "claude code": "claude code",
  "企业微信": "企业微信",
  "wecom": "企业微信",
  "钉钉": "钉钉",
  "dingtalk": "钉钉",
  "飞书": "飞书",
  lark: "飞书"
};

export function normalizeEntityName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return ENTITY_SYNONYMS[trimmed] ?? trimmed;
}

/**
 * DATA-5 / DATA-13: 实体入库前脱敏 — name / description / attributes 都过一遍
 * 防止 LLM 抽出的 entity 含 sk-xxx / user@host.com / 卡号等敏感字面量被永久持久化
 */
function sanitizeEntityForKg<T extends { name: string; description?: string; attributes?: Record<string, unknown> }>(entity: T): T {
  const name = redactSensitive(entity.name).cleaned;
  const description = entity.description ? redactSensitive(entity.description).cleaned : entity.description;
  let attributes = entity.attributes;
  if (attributes && typeof attributes === "object") {
    try {
      const json = JSON.stringify(attributes);
      const cleaned = redactSensitive(json).cleaned;
      attributes = JSON.parse(cleaned);
    } catch {
      // attributes 反序列化失败保留原值
    }
  }
  return { ...entity, name, description, attributes };
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "with", "from", "this", "that", "you", "your",
  "用户", "正在", "进行", "目前", "屏幕", "当前", "需要", "可以", "应该", "尝试", "查看",
  "intent", "scene", "activity", "unknown"
]);

/**
 * 从 LLM 给的自由文本 intent 里抽取关键词，用于 KG 二级索引聚合。
 * 规则：
 *  - 老格式 "${scene}::${detail}" 时把 scene 部分当一个关键词
 *  - 中文按 2-gram 切片，过滤停用词
 *  - 英文按空格分词，过滤短词与停用词
 *  - 单条最多取 top-3
 */
function extractIntentKeywords(intent: string): string[] {
  if (!intent) return [];
  const text = intent.trim();
  const out = new Set<string>();
  // 老格式兼容
  if (text.includes("::")) {
    const head = text.split("::")[0].trim();
    if (head) out.add(head);
  }
  // 英文 token
  const enTokens = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
  for (const t of enTokens) {
    if (t.length >= 4 && !STOP_WORDS.has(t)) out.add(t);
  }
  // 中文 2-gram（连续中文字符）
  const cjkMatches = text.match(/[一-龥]{2,}/g) ?? [];
  for (const seg of cjkMatches) {
    for (let i = 0; i + 2 <= seg.length; i++) {
      const bigram = seg.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) out.add(bigram);
    }
  }
  return Array.from(out).slice(0, 3);
}

export class KnowledgeGraphEngine {
  private db: Database.Database;

  constructor(dataDir?: string) {
    const userDataPath = dataDir ?? this.getDefaultUserDataPath();
    const actualDataDir = path.join(userDataPath, "data");
    fs.mkdirSync(actualDataDir, { recursive: true });
    const dbPath = path.join(actualDataDir, "ovo.sqlite");
    this.db = new Database(dbPath);
    // schema bootstrap + migration 已抽到 kg/migrations.ts（REVIEW CODE-12 / KG 拆分）
    bootstrapSchema(this.db);
    // SEC-8: 多重防御——
    //   ① userData 整个目录 chmod 700，阻止同机其他用户读取
    //   ② data/ 子目录 chmod 700
    //   ③ ovo.sqlite 单文件 chmod 600
    // memory_events 的高敏感字段已经走 safeStorage 字段级加密（addEvent）
    // 即便文件被偷走，攻击者拿到的也是 enc:v1:... 密文，没 Keychain 解不开
    try { fs.chmodSync(userDataPath, 0o700); } catch { /* 不影响功能 */ }
    try { fs.chmodSync(actualDataDir, 0o700); } catch { /* */ }
    try { fs.chmodSync(dbPath, 0o600); } catch { /* */ }
  }

  private getDefaultUserDataPath() {
    return getUserDataPath();
  }


  /** T15: 暴露当前 schema 版本（用于诊断 / 设置面板显示）。委托给 kg/migrations.ts */
  getSchemaVersionInfo(): { current: number; expected: number } {
    return schemaVersionInfo(this.db);
  }

  /**
   * P7: 计算并写回单条 pipeline 的 outcome_score（0-1）。
   * 规则（在没有用户反馈时也能给出有意义的"内在质量分"）：
   *   质量信号（pipeline 输出本身，0-0.7）：
   *     +0.20  intent 不为 "unknown"
   *     +0.10  抽到 ≥ 2 个非 application entity
   *     +0.10  抽到 ≥ 1 个 relationship
   *     +0.15  user_role_hypothesis 存在且 confidence ≥ 0.5
   *     +0.15  offers 数组非空（每个 offer 都有 value_prop）
   *   反馈信号（仅当 pipeline_id 关联了 user_feedback，0-0.3）：
   *     +0.30  累计 accepted >= 1
   *     -0.20  累计 rejected >= 1
   * 没有 user_feedback 的 pipeline，分数纯由质量信号决定（最高 0.7）。
   */
  computeAndStoreOutcomeScore(pipelineId: string): number {
    const row = this.db
      .prepare("SELECT stages FROM pipeline_logs WHERE id = ? LIMIT 1")
      .get(pipelineId) as { stages: string } | undefined;
    if (!row) return 0;
    let stages: Record<string, { output?: Record<string, unknown> }> = {};
    // 历史 row 可能是空字符串或半截 JSON，parse 失败就当无 stages（合理 silent）
    try { stages = JSON.parse(row.stages); } catch { /* legitimate: 默认空对象 */ }
    const agentOut = stages.agent?.output as Record<string, unknown> | undefined;
    const intent = (agentOut?.intent as string | undefined) ?? "";
    const role = agentOut?.role as string | undefined;
    const entitiesCount = (agentOut?.entities as number | undefined) ?? 0;
    const relsCount = (agentOut?.relations as number | undefined) ?? 0;
    const offersCount = (agentOut?.offers as number | undefined) ?? 0;

    let score = 0;
    if (intent && intent !== "unknown") score += 0.20;
    if (entitiesCount >= 2) score += 0.10;
    if (relsCount >= 1) score += 0.10;
    if (role) score += 0.15;
    if (offersCount > 0) score += 0.15;

    // 反馈信号
    const fb = this.db
      .prepare(
        `SELECT action, COUNT(*) as cnt FROM user_feedback
           WHERE pipeline_id = ? GROUP BY action`
      )
      .all(pipelineId) as Array<{ action: string; cnt: number }>;
    let accepted = 0; let rejected = 0;
    for (const r of fb) {
      if (r.action === "accepted") accepted = r.cnt;
      else if (r.action === "rejected") rejected = r.cnt;
    }
    if (accepted >= 1) score += 0.30;
    if (rejected >= 1) score -= 0.20;

    score = Math.max(0, Math.min(1, score));
    this.db.prepare("UPDATE pipeline_logs SET outcome_score = ? WHERE id = ?").run(score, pipelineId);
    return score;
  }

  /**
   * P8: 取最近 N 小时低分 pipeline，给自评 prompt 用。
   * 默认拉 24h 内 outcome_score < 0.4 的，最多 N 条。
   */
  getLowOutcomePipelines(windowHours = 24, limit = 8): Array<{ id: string; timestamp: number; outcome_score: number; stages_summary: string }> {
    const since = Date.now() - windowHours * 3600_000;
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, COALESCE(outcome_score, 0.5) as outcome_score, stages
           FROM pipeline_logs
           WHERE timestamp >= ? AND COALESCE(outcome_score, 0.5) < 0.4
           ORDER BY outcome_score ASC, timestamp DESC
           LIMIT ?`
      )
      .all(since, limit) as Array<{ id: string; timestamp: number; outcome_score: number; stages: string }>;
    return rows.map((r) => {
      let summary = "";
      // 单行 stages JSON 解析失败时 summary 留空，不影响其他 row 的 self-eval（合理 silent）
      try {
        const stages = JSON.parse(r.stages) as Record<string, { output?: Record<string, unknown> }>;
        const out = stages.agent?.output as Record<string, unknown> | undefined;
        summary = JSON.stringify({
          intent: out?.intent,
          role: out?.role,
          offers: out?.offers,
          actions: out?.actions,
          suggestions: out?.suggestions
        });
      } catch { /* legitimate: row 无 stages 时跳过 summary */ }
      return {
        id: r.id,
        timestamp: r.timestamp,
        outcome_score: r.outcome_score,
        stages_summary: summary.slice(0, 800)
      };
    });
  }

  /** P8: 写入一条 prompt_eval_suggestion */
  insertPromptEvalSuggestion(payload: {
    scope: string;
    problem: string;
    proposedChange: string;
    evidence: string;
    confidence: number;
  }): string {
    const id = this.id("ps");
    this.db
      .prepare(
        `INSERT INTO prompt_eval_suggestions (id, created_at, scope, problem, proposed_change, evidence, confidence, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(id, Date.now(), payload.scope, payload.problem, payload.proposedChange, payload.evidence.slice(0, 800), Math.max(0, Math.min(1, payload.confidence)));
    return id;
  }

  /** P8: 列出所有 prompt 自评建议（最新优先） */
  listPromptEvalSuggestions(limit = 30): Array<{
    id: string; created_at: number; scope: string; problem: string;
    proposed_change: string; evidence: string; confidence: number; status: string;
  }> {
    return this.db
      .prepare(
        `SELECT id, created_at, scope, problem, proposed_change, evidence, confidence, status
           FROM prompt_eval_suggestions ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as Array<{ id: string; created_at: number; scope: string; problem: string; proposed_change: string; evidence: string; confidence: number; status: string }>;
  }

  /**
   * P8 闭环：取出用户已**采纳**（status='applied'）的自评建议，按 scope 返回 proposed_change。
   * 这些会被 buildObservationPrompt / buildSynthesisPrompt 自动注入为"已学到的改进规则"，
   * 让"点应用"真正生效——无需人肉抄进源码重编译。confidence 倒序，最多 limit 条防膨胀。
   */
  getAppliedPromptEvalRules(limit = 8): Array<{ scope: string; rule: string }> {
    const rows = this.db
      .prepare(
        `SELECT scope, proposed_change FROM prompt_eval_suggestions
          WHERE status = 'applied'
          ORDER BY confidence DESC, created_at DESC LIMIT ?`
      )
      .all(limit) as Array<{ scope: string; proposed_change: string }>;
    return rows
      .map((r) => ({ scope: r.scope, rule: (r.proposed_change ?? "").trim() }))
      .filter((r) => r.rule.length > 0);
  }

  // ============================================================
  // PHIL-1 / P0.4: 玻璃管家 negative patterns
  // ============================================================

  /**
   * 用户点"永远不要这样"时调用。把禁忌写入 KG，下次 LLM prompt 会注入这些约束。
   * pattern_text 是用户原话；context_signature 是 Ovo 抽取的"以后碰到这种情况"特征。
   */
  insertNegativePattern(payload: {
    appName?: string;
    intent?: string;
    actionType?: string;
    patternText: string;
    contextSignature?: string;
  }): string {
    const id = this.id("np");
    this.db
      .prepare(
        `INSERT INTO negative_patterns
           (id, created_at, app_name, intent, action_type, pattern_text, context_signature, hit_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        id,
        Date.now(),
        payload.appName ?? null,
        payload.intent ?? null,
        payload.actionType ?? null,
        payload.patternText.slice(0, 500),
        (payload.contextSignature ?? "").slice(0, 500)
      );
    return id;
  }

  /**
   * 查询当前上下文相关的 negative patterns（用于注入 prompt 或 feedback 降权）。
   * 匹配规则：app_name 精确匹配 + action_type 精确匹配（任一为 NULL 视为通配）
   */
  getRelevantNegativePatterns(ctx: {
    appName?: string;
    actionType?: string;
    intent?: string;
  }, limit = 20): Array<{
    id: string; pattern_text: string; app_name: string | null;
    action_type: string | null; intent: string | null;
    context_signature: string | null; hit_count: number; created_at: number;
  }> {
    return this.db
      .prepare(
        `SELECT id, pattern_text, app_name, action_type, intent, context_signature, hit_count, created_at
           FROM negative_patterns
          WHERE (app_name IS NULL OR app_name = ?)
            AND (action_type IS NULL OR action_type = ?)
            AND (intent IS NULL OR intent = ?)
          ORDER BY created_at DESC
          LIMIT ?`
      )
      .all(
        ctx.appName ?? "",
        ctx.actionType ?? "",
        ctx.intent ?? "",
        limit
      ) as Array<{ id: string; pattern_text: string; app_name: string | null; action_type: string | null; intent: string | null; context_signature: string | null; hit_count: number; created_at: number }>;
  }

  /** 列出全部 negative patterns（用于 SettingsPanel "教过 Ovo 的禁忌"列表） */
  listNegativePatterns(limit = 100): Array<{
    id: string; created_at: number; app_name: string | null;
    intent: string | null; action_type: string | null;
    pattern_text: string; context_signature: string | null;
    hit_count: number; last_hit_at: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT id, created_at, app_name, intent, action_type, pattern_text, context_signature, hit_count, last_hit_at
           FROM negative_patterns ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as Array<{ id: string; created_at: number; app_name: string | null; intent: string | null; action_type: string | null; pattern_text: string; context_signature: string | null; hit_count: number; last_hit_at: number | null }>;
  }

  /** 命中时调用（adaptive-prompt 注入了某条 pattern 后） */
  markNegativePatternHit(id: string): void {
    this.db
      .prepare(`UPDATE negative_patterns SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?`)
      .run(Date.now(), id);
  }

  /** 用户取消某条 pattern */
  deleteNegativePattern(id: string): void {
    this.db.prepare(`DELETE FROM negative_patterns WHERE id = ?`).run(id);
  }

  /** P8: 标记自评建议状态（applied/dismissed） */
  setPromptEvalStatus(id: string, status: "applied" | "dismissed" | "pending") {
    this.db.prepare("UPDATE prompt_eval_suggestions SET status = ? WHERE id = ?").run(status, id);
  }

  /**
   * F4-A: 流程 tab 进度条数据——动态 phases，反映真实跑了什么。
   * Phase 数量 1-5+：失败 1-2 段；没动作没记忆 2 段；标准完整 4-5 段。
   * F4-C: detail.understand 携带 promptPreview + rawResponse，给透明日志用。
   */
  getPipelineProgress(limit = 50): Array<{
    id: string;
    timestamp: number;
    duration: number;
    status: "completed" | "failed" | "running";
    appName: string;
    windowTitle: string;
    summary: string;
    /** 动态阶段——真实跑了几段就几段 */
    phases: Array<{
      key: string;
      label: string;
      status: "done" | "failed" | "skipped" | "pending";
      brief: string;
      durationMs?: number;
    }>;
    detail: {
      capture: { ocrPreview: string; charCount: number; appName: string; windowTitle: string };
      understand: {
        intent: string;
        prediction: string;
        role: string;
        roleConfidence: number;
        latentIntent: string;
        risk: string;
        offerCount: number;
        suggestionCount: number;
        durationSec: number;
        /** F4-C: 发给 LLM 的 prompt 预览（截 1500 字） */
        promptPreview: string;
        /** F4-C: LLM 原始返回预览（截 1500 字） */
        rawResponse: string;
      };
      act: {
        executed: number;
        pending: number;
        items: Array<{ description: string; status: string; output: string }>;
      };
      remember: {
        newEntities: number;
        newRelationships: number;
        topEntityNames: string[];
      };
      relate: {
        added: number;
        reinforced: number;
        durationMs: number;
      };
    };
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, duration, status, stages
           FROM pipeline_logs
           ORDER BY timestamp DESC
           LIMIT ?`
      )
      .all(limit) as Array<{ id: string; timestamp: number; duration: number; status: string; stages: string }>;

    // 批查关系推断 business_logs（一次查全部，按 pipeline_id 映射）
    const pipelineIds = rows.map((r) => r.id);
    const relationLogs = pipelineIds.length === 0 ? [] : this.db
      .prepare(
        `SELECT pipeline_id, status, output, end_time, start_time FROM business_logs
           WHERE node = 'kg.relation-inference'
             AND pipeline_id IN (${pipelineIds.map(() => "?").join(",")})`
      )
      .all(...pipelineIds) as Array<{ pipeline_id: string; status: string; output: string; end_time: number; start_time: number }>;
    const relationByPipe = new Map<string, { added: number; reinforced: number; status: string; durationMs: number }>();
    for (const r of relationLogs) {
      let added = 0; let reinforced = 0;
      try {
        const out = JSON.parse(r.output ?? "{}");
        added = Number(out.added ?? 0);
        reinforced = Number(out.reinforced ?? 0);
      } catch { /* */ }
      relationByPipe.set(r.pipeline_id, {
        added,
        reinforced,
        status: r.status,
        durationMs: Math.max(0, (r.end_time ?? 0) - (r.start_time ?? 0))
      });
    }

    return rows.map((row) => {
      let stages: Record<string, { status?: string; duration?: number; input?: Record<string, unknown>; output?: Record<string, unknown>; data?: Record<string, unknown> }> = {};
      try { stages = JSON.parse(row.stages); } catch { /* */ }

      const stageStatusOf = (s?: { status?: string }): "done" | "failed" | "skipped" | "pending" => {
        if (!s) return "pending";
        if (s.status === "success") return "done";
        if (s.status === "failed") return "failed";
        if (s.status === "skipped") return "skipped";
        return "pending";
      };

      // 各段元数据
      const aggIn = (stages.aggregate?.input ?? {}) as Record<string, unknown>;
      const aggOut = (stages.aggregate?.output ?? {}) as Record<string, unknown>;
      const agentIn = (stages.agent?.input ?? {}) as Record<string, unknown>;
      const agentOut = (stages.agent?.output ?? {}) as Record<string, unknown>;
      const agentData = (stages.agent?.data ?? {}) as Record<string, unknown>;
      const actionsIn = (stages.actions?.input ?? {}) as Record<string, unknown>;
      const actionsOut = (stages.actions?.output ?? {}) as Record<string, unknown>;
      const graphIn = (stages.graphUpdate?.input ?? {}) as Record<string, unknown>;
      const graphData = (stages.graphUpdate?.data ?? graphIn) as Record<string, unknown>;

      const appName = String(aggIn.appName ?? agentIn.appName ?? "");
      const windowTitle = String(aggIn.windowTitle ?? "");
      const intent = String(agentOut.intent ?? "");
      const prediction = String(agentOut.prediction ?? "");
      const role = String(agentOut.role ?? "");
      const offers = Number(agentOut.offers ?? 0);
      const suggs = Number(agentOut.suggestions ?? 0);
      const newEnts = Number(graphIn.entitiesProposed ?? graphData.entitiesProposed ?? 0);
      const newRels = Number((graphIn.relationships ?? graphData.relationships) ?? 0);
      const executed = Number(actionsOut.executed ?? 0);
      const pendingActs = Number(actionsIn.pending ?? 0);

      // F4-C: prompt + raw response 预览（用于透明日志展开）
      const promptPreview = String(agentData.promptSent ?? "").slice(0, 1500);
      const rawResponse = String(agentOut.rawPreview ?? "").slice(0, 1500);

      // 关系推断元数据——必须在第一次可能 assemblePipeline() 之前初始化，
      // 否则 if (agentStatus === "failed") return assemblePipeline() 这条路径会触发
      // "Cannot access 'rel' before initialization" TDZ 错误（assemblePipeline 内部捕获了 rel）
      const rel = relationByPipe.get(row.id);

      // action 项展开（最多 5 条）
      const actionResults = Array.isArray(actionsOut.results) ? (actionsOut.results as Array<{ type?: string; status?: string; output?: string; description?: string }>) : [];
      const actItems = actionResults.slice(0, 5).map((a) => {
        const desc = a.description ?? a.type ?? "动作";
        let outText = "";
        if (typeof a.output === "string") {
          try {
            const parsed = JSON.parse(a.output);
            outText = parsed.summary ?? a.output.slice(0, 100);
          } catch { outText = a.output.slice(0, 100); }
        }
        return {
          description: String(desc),
          status: a.status === "success" ? "✓" : a.status === "failed" ? "✗" : a.status === "pending" ? "等用户确认" : (a.status ?? "—"),
          output: outText
        };
      });

      // 人话一句话总结
      const parts: string[] = [];
      if (appName) parts.push(appName);
      if (intent) parts.push(intent);
      else if (role) parts.push(`角色：${role}`);
      const summary = parts.length > 0 ? parts.join(" · ") : "没识别到明显活动";

      // 让"ovo 做过的事"回放页能展示更完整的 OCR——上限 2000，与写入端保持一致
      const ocrPreview = String(aggOut.preview ?? "").slice(0, 2000);
      const charCount = Number(aggOut.mergedTextLength ?? 0);
      const agentDur = Number(stages.agent?.duration ?? 0);
      const aggDur = Number(stages.aggregate?.duration ?? 0);
      const actDur = Number(stages.actions?.duration ?? 0);
      const graphDur = Number(stages.graphUpdate?.duration ?? 0);

      // ───── 动态 phases 生成 ─────
      const phases: Array<{ key: string; label: string; status: "done" | "failed" | "skipped" | "pending"; brief: string; durationMs?: number }> = [];

      // ① 看屏幕 —— 总是有
      const captureStatus = stageStatusOf(stages.aggregate);
      phases.push({
        key: "capture",
        label: "看屏幕",
        status: captureStatus,
        brief: appName ? `${appName}${charCount ? ` · ${charCount} 字` : ""}` : "等待截图",
        durationMs: aggDur
      });

      // ② 理解 —— 总是有（即使失败也展示）
      const agentStatus = stageStatusOf(stages.agent);
      let understandBrief = "";
      if (agentStatus === "failed") {
        understandBrief = "理解失败";
      } else if (intent) {
        understandBrief = role ? `${intent} · 角色 ${role}` : intent;
      } else if (role) {
        understandBrief = `角色 ${role}`;
      } else if (agentStatus === "done") {
        understandBrief = "已理解但内容不明";
      } else {
        understandBrief = "等待理解";
      }
      phases.push({
        key: "understand",
        label: "理解",
        status: agentStatus,
        brief: understandBrief,
        durationMs: agentDur
      });

      // 失败到此为止
      if (agentStatus === "failed") {
        return assemblePipeline();
      }

      // ③ 执行 —— 仅当真有动作（执行 > 0 或 等确认 > 0）
      if (executed > 0 || pendingActs > 0) {
        const actStatus = stageStatusOf(stages.actions);
        const actLabel = pendingActs > 0
          ? `执行 ${executed} 个 · 等确认 ${pendingActs} 个`
          : `执行 ${executed} 个动作`;
        const actBrief = actItems.length > 0
          ? actItems.map((i) => `${i.status} ${i.description}`).slice(0, 2).join(" / ")
          : "";
        phases.push({
          key: "act",
          label: actLabel,
          status: actStatus,
          brief: actBrief,
          durationMs: actDur
        });
      }

      // ④ 记忆 —— 仅当有新的实体或关系
      if (newEnts > 0 || newRels > 0) {
        const memStatus = stageStatusOf(stages.graphUpdate);
        const memParts: string[] = [];
        if (newEnts > 0) memParts.push(`${newEnts} 个新概念`);
        if (newRels > 0) memParts.push(`${newRels} 个新关联`);
        phases.push({
          key: "remember",
          label: `记下${memParts.length > 0 ? " " + memParts.join(" / ") : "新内容"}`,
          status: memStatus,
          brief: "",
          durationMs: graphDur
        });
      }

      // ⑤ 补关系 —— 仅当真触发过（business_logs 里有 kg.relation-inference）
      // 注意：rel 已在 promptPreview 后初始化（防 TDZ）
      if (rel && (rel.added > 0 || rel.reinforced > 0)) {
        const relParts: string[] = [];
        if (rel.added > 0) relParts.push(`+${rel.added} 新关系`);
        if (rel.reinforced > 0) relParts.push(`${rel.reinforced} 加强`);
        phases.push({
          key: "infer_relations",
          label: `补关系 · ${relParts.join(" / ")}`,
          status: rel.status === "success" ? "done" : rel.status === "failed" ? "failed" : "pending",
          brief: "",
          durationMs: rel.durationMs
        });
      }

      function assemblePipeline() {
        return {
          id: row.id,
          timestamp: row.timestamp,
          duration: row.duration ?? 0,
          status: (row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "running") as "completed" | "failed" | "running",
          appName,
          windowTitle,
          summary,
          phases,
          detail: {
            capture: { ocrPreview, charCount, appName, windowTitle },
            understand: {
              intent,
              prediction,
              role,
              roleConfidence: Number(agentOut.roleConfidence ?? 0),
              latentIntent: String(agentOut.latentIntent ?? ""),
              risk: String(agentOut.risk ?? ""),
              offerCount: offers,
              suggestionCount: suggs,
              durationSec: Math.round(agentDur / 100) / 10,
              promptPreview,
              rawResponse
            },
            act: { executed, pending: pendingActs, items: actItems },
            remember: { newEntities: newEnts, newRelationships: newRels, topEntityNames: [] },
            relate: {
              added: rel?.added ?? 0,
              reinforced: rel?.reinforced ?? 0,
              durationMs: rel?.durationMs ?? 0
            }
          }
        };
      }

      return assemblePipeline();
    });
  }

  /**
   * F3: 流程 tab 时间线统一事件流。
   * 把 4 类事件合并按时间倒序：
   *   capture (从 system_logs 找 OCR / 截屏事件)
   *   llm_call (business_logs node='intent.predict')
   *   action (business_logs node='actions.execute' + action.confirm.execute)
   *   kg_mutation (business_logs node='graph.update' + 'kg.relation-inference')
   */
  getProcessTimeline(limit = 100): Array<{
    id: string;
    timestamp: number;
    kind: "capture" | "llm_call" | "action" | "kg_mutation" | "other";
    title: string;
    subtitle: string;
    pipelineId?: string;
    payload?: Record<string, unknown>;
  }> {
    // business_logs 是事件源，按 start_time 倒序拉
    const rows = this.db
      .prepare(
        `SELECT id, pipeline_id, node, status, input, output, error, meta, start_time, end_time
           FROM business_logs
           ORDER BY start_time DESC
           LIMIT ?`
      )
      .all(limit) as Array<{
      id: string; pipeline_id: string; node: string; status: string;
      input: string; output: string; error: string; meta: string;
      start_time: number; end_time: number;
    }>;

    return rows.map((r) => {
      let kind: "capture" | "llm_call" | "action" | "kg_mutation" | "other" = "other";
      let title = r.node;
      let subtitle = `${r.status}`;
      let parsedInput: Record<string, unknown> | undefined;
      let parsedOutput: Record<string, unknown> | undefined;
      try { parsedInput = r.input ? JSON.parse(r.input) : undefined; } catch { /* */ }
      try { parsedOutput = r.output ? JSON.parse(r.output) : undefined; } catch { /* */ }

      if (r.node === "intent.predict") {
        kind = "llm_call";
        title = "🧠 ovo 想了想";
        const passes = (parsedInput?.passes as number | undefined) ?? 1;
        const intent = (parsedOutput?.intent as string | undefined) ?? "";
        const role = (parsedOutput?.role as string | undefined) ?? "";
        const dur = (parsedOutput?.durationMs as number | undefined)
          ?? ((parsedInput?.pass1Duration as number ?? 0) + (parsedInput?.pass2Duration as number ?? 0));
        subtitle = `${passes} 段推断 · ${dur > 0 ? `${(dur / 1000).toFixed(1)}s` : "—"}${intent ? ` · ${intent}` : ""}${role ? ` · 角色: ${role}` : ""}`;
      } else if (r.node === "actions.execute" || r.node === "action.confirm.execute") {
        kind = "action";
        title = "⚡ ovo 做了事";
        const total = (parsedInput?.total as number | undefined) ?? 0;
        const executed = (parsedOutput?.executed as number | undefined) ?? 0;
        subtitle = total > 0 ? `${executed}/${total} 个动作 · ${r.status}` : r.status;
      } else if (r.node === "graph.update") {
        kind = "kg_mutation";
        title = "📚 ovo 学到了";
        const ents = (parsedInput?.entitiesProposed as number | undefined) ?? 0;
        const rels = (parsedInput?.relationships as number | undefined) ?? 0;
        subtitle = `+${ents} 实体 · +${rels} 关系`;
      } else if (r.node === "kg.relation-inference") {
        kind = "kg_mutation";
        title = "🔗 ovo 补关系";
        const added = (parsedOutput?.added as number | undefined) ?? 0;
        const reinforced = (parsedOutput?.reinforced as number | undefined) ?? 0;
        subtitle = `+${added} 新关系 · ${reinforced} 加强`;
      } else if (r.node === "aggregate" || r.node === "capture.manual") {
        kind = "capture";
        title = "🖥️ ovo 看了看屏幕";
        const winId = (parsedInput?.windowId as string | undefined) ?? "";
        const app = (parsedInput?.appName as string | undefined) ?? winId.split("_")[0] ?? "";
        const len = (parsedOutput?.mergedTextLength as number | undefined) ?? (parsedOutput?.byteLength as number | undefined) ?? 0;
        subtitle = `${app} · ${len} 字符`;
      } else if (r.node === "suggestions.generate") {
        kind = "llm_call";
        title = "💡 ovo 给建议";
        const ingested = (parsedOutput?.ingested as number | undefined) ?? 0;
        subtitle = `${ingested} 条建议`;
      } else if (r.node === "prompt.self-eval" || r.node === "kg.gc") {
        kind = "kg_mutation";
        title = r.node === "kg.gc" ? "🧹 ovo 整理记忆" : "🪞 ovo 反思 prompt";
        subtitle = r.status;
      }

      return {
        id: r.id,
        timestamp: r.start_time,
        kind,
        title,
        subtitle,
        pipelineId: r.pipeline_id,
        payload: { input: parsedInput, output: parsedOutput, error: r.error || undefined, meta: r.meta || undefined }
      };
    });
  }

  /**
   * 给用户看的「ovo 做过什么」清单——按动作维度而不是按 pipeline 维度。
   * 把 business_logs 里 actions.execute / action.confirm.execute 的 output.results 展开，
   * 每条 ActionResult 一行，配上人类可读的描述。
   */
  getActionHistory(limit = 100): Array<{
    id: string;
    timestamp: number;
    type: string;
    actionId: string;
    status: "success" | "failed" | "cancelled" | "timeout" | "pending";
    description: string;
    preview: string;
    error?: string;
    confirmedByUser: boolean;
    pipelineId?: string;
    appName?: string;
    windowTitle?: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, pipeline_id, node, input, output, end_time, start_time
           FROM business_logs
           WHERE node = 'actions.execute' OR node = 'action.confirm.execute'
           ORDER BY start_time DESC
           LIMIT ?`
      )
      .all(limit * 4) as Array<{
      id: string; pipeline_id: string; node: string;
      input: string; output: string;
      start_time: number; end_time: number;
    }>;

    const TYPE_LABEL: Record<string, string> = {
      log_note: "记笔记",
      create_todo: "建待办",
      copy_to_clipboard: "复制到剪贴板",
      send_email: "发邮件",
      send_imessage: "发 iMessage",
      set_reminder: "设提醒",
      add_calendar: "加日历",
      open_url: "打开网址",
      open_app: "打开应用",
      search_web: "搜索",
      summarize: "总结",
      index_path: "扫描目录",
      other: "动作"
    };

    type ActionResultRow = {
      actionId: string;
      type?: string;
      status: "success" | "failed" | "cancelled" | "timeout" | "pending";
      output?: string;
      error?: string;
    };

    const flat: Array<{
      id: string; timestamp: number; type: string; actionId: string;
      status: "success" | "failed" | "cancelled" | "timeout" | "pending";
      description: string; preview: string; error?: string;
      confirmedByUser: boolean; pipelineId?: string;
      appName?: string; windowTitle?: string;
    }> = [];

    for (const r of rows) {
      let parsedInput: Record<string, unknown> | undefined;
      let parsedOutput: Record<string, unknown> | undefined;
      try { parsedInput = r.input ? JSON.parse(r.input) : undefined; } catch { /* */ }
      try { parsedOutput = r.output ? JSON.parse(r.output) : undefined; } catch { /* */ }

      const confirmedByUser = r.node === "action.confirm.execute";
      const results = (parsedOutput?.results as ActionResultRow[] | undefined) ?? [];
      const inputActions = (parsedInput?.actions as Array<{ id?: string; type?: string; description?: string; params?: Record<string, unknown> }> | undefined) ?? [];
      const actionById = new Map<string, { description?: string; params?: Record<string, unknown> }>();
      for (const a of inputActions) {
        if (a?.id) actionById.set(a.id, { description: a.description, params: a.params });
      }
      // confirm 路径只有单条 action（在 input.actionId/description 上）
      if (r.node === "action.confirm.execute" && parsedInput?.actionId) {
        actionById.set(String(parsedInput.actionId), {
          description: typeof parsedInput.description === "string" ? parsedInput.description : undefined
        });
      }

      for (const res of results) {
        const info = actionById.get(res.actionId);
        const type = res.type ?? "other";
        const label = TYPE_LABEL[type] ?? "动作";
        // preview: 根据 type 提炼人类可读片段
        const params = info?.params ?? {};
        let preview = "";
        if (type === "copy_to_clipboard") {
          preview = String(params.text ?? "").slice(0, 120);
        } else if (type === "send_email") {
          const to = String(params.to ?? "");
          const subject = String(params.subject ?? "");
          preview = subject ? `${to ? `→ ${to} ` : ""}${subject}` : to;
        } else if (type === "send_imessage") {
          preview = `${params.to ? `→ ${params.to} ` : ""}${String(params.body ?? "").slice(0, 100)}`;
        } else if (type === "open_url") {
          preview = String(params.url ?? "");
        } else if (type === "search_web") {
          preview = String(params.query ?? "");
        } else if (type === "set_reminder" || type === "add_calendar") {
          preview = `${String(params.title ?? "")}${params.startsAt ? ` @ ${params.startsAt}` : params.dueAt ? ` @ ${params.dueAt}` : ""}`;
        }

        flat.push({
          id: `${r.id}_${res.actionId}`,
          timestamp: r.start_time,
          type,
          actionId: res.actionId,
          status: res.status,
          description: info?.description || label,
          preview,
          error: res.error,
          confirmedByUser,
          pipelineId: r.pipeline_id
        });
      }
    }

    // Bug 6 修复：同一 actionId 可能在 business_logs 里有多条（先 "actions.execute" 写 pending，
    // 后 "action.confirm.execute" 写 success/failed）。按 actionId dedupe，保留最新 status。
    // 排序优先级：success/failed/cancelled/timeout > pending（已确认结果覆盖等待中）。
    const STATUS_PRIO: Record<string, number> = {
      success: 4, failed: 4, cancelled: 4, timeout: 4, pending: 1
    };
    const byActionId = new Map<string, typeof flat[number]>();
    for (const f of flat) {
      const existing = byActionId.get(f.actionId);
      if (!existing) {
        byActionId.set(f.actionId, f);
        continue;
      }
      // 偏好 confirmedByUser=true（明确用户操作的结果）
      // 偏好高优先级 status
      // 偏好更新的 timestamp
      const existingPrio = (existing.confirmedByUser ? 10 : 0) + (STATUS_PRIO[existing.status] ?? 0);
      const newPrio = (f.confirmedByUser ? 10 : 0) + (STATUS_PRIO[f.status] ?? 0);
      if (newPrio > existingPrio || (newPrio === existingPrio && f.timestamp > existing.timestamp)) {
        byActionId.set(f.actionId, f);
      }
    }
    const deduped = Array.from(byActionId.values()).sort((a, b) => b.timestamp - a.timestamp);

    // pipeline_logs 表没有 app_name / window_title 列（schema 见 bootstrap）；
    // 这些信息在 stages JSON 的 aggregate.input 里。一次批量查 + 解析。
    const pipelineIds = Array.from(new Set(deduped.map((f) => f.pipelineId).filter(Boolean))) as string[];
    if (pipelineIds.length) {
      const placeholders = pipelineIds.map(() => "?").join(",");
      const ctxRows = this.db
        .prepare(`SELECT id, stages FROM pipeline_logs WHERE id IN (${placeholders})`)
        .all(...pipelineIds) as Array<{ id: string; stages: string }>;
      const ctxMap = new Map<string, { appName: string; windowTitle: string }>();
      for (const c of ctxRows) {
        let appName = "";
        let windowTitle = "";
        // parse 失败时 appName/windowTitle 留空——下游会用空串兜底（合理 silent）
        try {
          const stages = JSON.parse(c.stages ?? "{}") as Record<string, { input?: Record<string, unknown> }>;
          const aggIn = stages.aggregate?.input ?? {};
          appName = String((aggIn as Record<string, unknown>).appName ?? "");
          windowTitle = String((aggIn as Record<string, unknown>).windowTitle ?? "");
        } catch { /* legitimate: 历史脏数据 row */ }
        ctxMap.set(c.id, { appName, windowTitle });
      }
      for (const f of deduped) {
        if (f.pipelineId) {
          const c = ctxMap.get(f.pipelineId);
          if (c) {
            f.appName = c.appName;
            f.windowTitle = c.windowTitle;
          }
        }
      }
    }

    return deduped.slice(0, limit);
  }

  /**
   * R8: 本周 vs 上周 ovo 建议接受率（"越来越懂你"指标）。
   * 取近 7 天 vs 之前 7 天的 user_feedback 接受率。
   */
  getWeeklyAcceptanceTrend(): {
    thisWeek: { total: number; accepted: number; rate: number };
    prevWeek: { total: number; accepted: number; rate: number };
    delta: number; // 本周 - 上周（正向 = 进步）
    confidenceLevel: "low" | "ok" | "good"; // 数据多少
  } {
    const now = Date.now();
    const week = 7 * 86_400_000;
    const thisStart = now - week;
    const prevStart = now - 2 * week;

    const fetch = (since: number, until: number) => {
      const rows = this.db
        .prepare(
          `SELECT action, COUNT(*) as cnt FROM user_feedback
             WHERE timestamp >= ? AND timestamp < ?
             GROUP BY action`
        )
        .all(since, until) as Array<{ action: string; cnt: number }>;
      let total = 0; let accepted = 0;
      for (const r of rows) {
        total += r.cnt;
        if (r.action === "accepted") accepted += r.cnt;
      }
      return { total, accepted, rate: total === 0 ? 0 : accepted / total };
    };

    const thisWeek = fetch(thisStart, now);
    const prevWeek = fetch(prevStart, thisStart);
    const delta = thisWeek.rate - prevWeek.rate;
    let confidenceLevel: "low" | "ok" | "good" = "low";
    if (thisWeek.total >= 20) confidenceLevel = "good";
    else if (thisWeek.total >= 5) confidenceLevel = "ok";

    return { thisWeek, prevWeek, delta, confidenceLevel };
  }

  /**
   * KG-G: 取最近 N 小时被提到的 + top quality 的 entity，作为二次 pass 的"上下文池"。
   * 让 LLM 在更大范围内找跨 pipeline 的关系。
   */
  getEntitiesForInference(limit = 12, recentHours = 1): Array<{ id: string; name: string; type: string; description: string }> {
    const since = Date.now() - recentHours * 3600_000;
    // 优先：最近被提到 + 高质量；混合两种信号
    const rows = this.db
      .prepare(
        `SELECT id, name, type, description FROM entities
           WHERE last_seen >= ?
             AND COALESCE(quality_score, 0.5) >= 0.4
           ORDER BY pinned DESC, quality_score DESC, last_seen DESC
           LIMIT ?`
      )
      .all(since, limit) as Array<{ id: string; name: string; type: string; description: string }>;
    return rows;
  }

  /**
   * KG-G: 检查一个关系是否已存在；存在则 strength+delta 并返回 false 表示"未新增"
   * 不存在则插入并返回 true。
   */
  upsertInferredRelation(payload: {
    sourceId: string;
    targetId: string;
    relation: string;
    context: string;
    confidence: number;
  }): { added: boolean; reinforced: boolean } {
    const existing = this.db
      .prepare("SELECT id, strength, inferred FROM relationships WHERE source_id = ? AND target_id = ? AND relation = ? LIMIT 1")
      .get(payload.sourceId, payload.targetId, payload.relation) as { id: string; strength: number; inferred: number } | undefined;
    if (existing) {
      // 已存在：strength +1（推断值，比直接观察弱），更新 context
      this.db
        .prepare("UPDATE relationships SET strength = MIN(10, strength + 1), context = ?, updated_at = strftime('%s','now') WHERE id = ?")
        .run(payload.context.slice(0, 240), existing.id);
      return { added: false, reinforced: true };
    }
    const id = this.id("rel");
    this.db
      .prepare(
        `INSERT INTO relationships (id, source_id, target_id, relation, context, strength, inferred, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`
      )
      .run(id, payload.sourceId, payload.targetId, payload.relation, payload.context.slice(0, 240), Math.max(2, Math.round(payload.confidence * 5)));
    return { added: true, reinforced: false };
  }

  /**
   * KG-B: 计算单个 entity 的 quality_score（0-1）。
   * 公式：
   *   0.40 × normalize(mention_count, 1, 20)   recurrence
   * + 0.20 × normalize(importance, 1, 10)       LLM-给的重要度
   * + 0.20 × connectivity_score                 关联关系数（>=5 满分）
   * + 0.20 × recency_score                      14 天半衰期
   * + 0.30 if pinned (bonus, 不计入分母)
   * + 0.20 if recently referenced in accepted suggestion (bonus)
   */
  private computeQualityScore(row: {
    mention_count?: number;
    importance?: number;
    last_seen?: number;
    last_referenced_at?: number;
    pinned?: number;
    relation_count?: number;
  }): number {
    const norm = (v: number, lo: number, hi: number) =>
      Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
    const recurrence = norm(Math.min(20, row.mention_count ?? 1), 1, 20);
    const importanceN = norm(Math.min(10, row.importance ?? 5), 1, 10);
    const connectivity = norm(Math.min(5, row.relation_count ?? 0), 0, 5);
    const ageDays = ((Date.now() - (row.last_seen ?? Date.now())) / 86_400_000);
    const recency = Math.max(0, Math.exp(-ageDays / 14));
    let score = 0.4 * recurrence + 0.2 * importanceN + 0.2 * connectivity + 0.2 * recency;
    if (row.pinned) score += 0.3;
    if (row.last_referenced_at && Date.now() - row.last_referenced_at < 7 * 86_400_000) {
      score += 0.2;
    }
    return Math.max(0, Math.min(1, score));
  }

  /**
   * KG-B: 重算所有 entity 的 quality_score。GC 任务和首次迁移时调用。
   */
  recomputeAllQualityScores(): { updated: number } {
    const rows = this.db
      .prepare(`
        SELECT e.id, e.mention_count, e.importance, e.last_seen, e.last_referenced_at, e.pinned,
               (SELECT COUNT(*) FROM relationships r WHERE r.source_id = e.id OR r.target_id = e.id) as relation_count
        FROM entities e
      `).all() as Array<{
      id: string; mention_count: number; importance: number; last_seen: number;
      last_referenced_at: number; pinned: number; relation_count: number;
    }>;
    const update = this.db.prepare("UPDATE entities SET quality_score = ? WHERE id = ?");
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const row of batch) {
        const s = this.computeQualityScore(row);
        update.run(s, row.id);
      }
    });
    tx(rows);
    return { updated: rows.length };
  }

  /**
   * KG-B: 用户在 KG UI 上钉住一个 entity，永不衰减、永不被 GC 清。
   */
  setPinned(entityId: string, pinned: boolean) {
    this.db.prepare("UPDATE entities SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, entityId);
  }

  /**
   * DATA-10: 数据 retention——定期清掉过期的事件 / 日志，保留实体图谱。
   *
   * 默认保留 30 天的：
   *   - memory_events（OCR 内容）
   *   - business_logs / pipeline_logs（pipeline 执行日志）
   *   - system_logs（系统日志）
   * 但不删 entities / relationships——那是用户的"长期记忆"，应该跟着 quality_score
   * 衰减由 runEntityGC 单独处理（pinned entity 永保留）。
   *
   * 用户主动 clearAll 不影响这个；这是后台被动清理。
   */
  runRetentionGC(retentionDays = 30): {
    memoryEventsDeleted: number;
    pipelineLogsDeleted: number;
    businessLogsDeleted: number;
    systemLogsDeleted: number;
  } {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const tx = this.db.transaction(() => {
      const r1 = this.db.prepare("DELETE FROM memory_events WHERE timestamp < ?").run(cutoff);
      const r2 = this.db.prepare("DELETE FROM pipeline_logs WHERE timestamp < ?").run(cutoff);
      const r3 = this.db.prepare("DELETE FROM business_logs WHERE start_time < ?").run(cutoff);
      const r4 = this.db.prepare("DELETE FROM system_logs WHERE timestamp < ?").run(cutoff);
      return {
        memoryEventsDeleted: Number(r1.changes ?? 0),
        pipelineLogsDeleted: Number(r2.changes ?? 0),
        businessLogsDeleted: Number(r3.changes ?? 0),
        systemLogsDeleted: Number(r4.changes ?? 0)
      };
    });
    return tx();
  }

  /**
   * KG-D: 用户主权——删除一个 entity 及其所有 relation。
   * 不删 memory_events（事件级历史保留），但事件 entity_ids JSON 里的引用会失效（无关紧要）。
   */
  deleteEntity(entityId: string): { ok: boolean; relationsDeleted: number } {
    const r1 = this.db.prepare("DELETE FROM relationships WHERE source_id = ? OR target_id = ?").run(entityId, entityId);
    const r2 = this.db.prepare("DELETE FROM entities WHERE id = ?").run(entityId);
    return { ok: Number(r2.changes ?? 0) > 0, relationsDeleted: Number(r1.changes ?? 0) };
  }

  /**
   * P1-2 记忆纠错：实体改名。把旧名并入 aliases，保证历史引用 / 后续匹配仍能命中。
   */
  renameEntity(entityId: string, newName: string): { ok: boolean; error?: string } {
    const name = newName.trim();
    if (!name) return { ok: false, error: "新名称不能为空" };
    const row = this.db
      .prepare("SELECT name, aliases FROM entities WHERE id = ? LIMIT 1")
      .get(entityId) as { name: string; aliases: string | null } | undefined;
    if (!row) return { ok: false, error: "实体不存在" };
    if (row.name === name) return { ok: true };
    const aliases: string[] = row.aliases ? (JSON.parse(row.aliases) as string[]) : [];
    if (row.name && !aliases.includes(row.name)) aliases.push(row.name);
    this.db
      .prepare("UPDATE entities SET name = ?, aliases = ? WHERE id = ?")
      .run(name, JSON.stringify(aliases.slice(0, 20)), entityId);
    return { ok: true };
  }

  /**
   * KG-D: 取单个 entity 的完整详情：自身字段 + 关系 + 最近事件
   * UI 用，比 getEntity 更全。
   */
  getEntityDetail(entityId: string): {
    entity: {
      id: string; name: string; type: string; description: string;
      attributes: Record<string, unknown>;
      mentionCount: number; importance: number;
      qualityScore: number; pinned: boolean;
      firstSeen: number; lastSeen: number; lastReferencedAt: number;
    } | null;
    relations: Array<{ direction: "out" | "in"; relation: string; otherId: string; otherName: string; otherType: string; strength: number; context: string }>;
    eventCount: number;
  } {
    const e = this.db.prepare(`
      SELECT id, name, type, description, attributes,
             mention_count, importance,
             COALESCE(quality_score, 0.5) as quality_score,
             COALESCE(pinned, 0) as pinned,
             first_seen, last_seen,
             COALESCE(last_referenced_at, 0) as last_referenced_at
      FROM entities WHERE id = ? LIMIT 1
    `).get(entityId) as undefined | {
      id: string; name: string; type: string; description: string; attributes: string;
      mention_count: number; importance: number;
      quality_score: number; pinned: number;
      first_seen: number; last_seen: number; last_referenced_at: number;
    };
    if (!e) return { entity: null, relations: [], eventCount: 0 };

    const outRows = this.db.prepare(`
      SELECT r.relation, r.context, r.strength, t.id as otherId, t.name as otherName, t.type as otherType
      FROM relationships r JOIN entities t ON t.id = r.target_id
      WHERE r.source_id = ?
      ORDER BY r.strength DESC, r.updated_at DESC LIMIT 30
    `).all(entityId) as Array<{ relation: string; context: string; strength: number; otherId: string; otherName: string; otherType: string }>;
    const inRows = this.db.prepare(`
      SELECT r.relation, r.context, r.strength, s.id as otherId, s.name as otherName, s.type as otherType
      FROM relationships r JOIN entities s ON s.id = r.source_id
      WHERE r.target_id = ?
      ORDER BY r.strength DESC, r.updated_at DESC LIMIT 30
    `).all(entityId) as Array<{ relation: string; context: string; strength: number; otherId: string; otherName: string; otherType: string }>;

    const eventCount = (this.db.prepare(`
      SELECT COUNT(*) as c FROM memory_events WHERE entity_ids LIKE ?
    `).get(`%${entityId}%`) as { c: number } | undefined)?.c ?? 0;

    return {
      entity: {
        id: e.id, name: e.name, type: e.type, description: e.description,
        attributes: JSON.parse(e.attributes || "{}"),
        mentionCount: e.mention_count, importance: e.importance,
        qualityScore: e.quality_score, pinned: e.pinned === 1,
        firstSeen: e.first_seen, lastSeen: e.last_seen, lastReferencedAt: e.last_referenced_at
      },
      relations: [
        ...outRows.map((r) => ({ direction: "out" as const, ...r })),
        ...inRows.map((r) => ({ direction: "in" as const, ...r }))
      ],
      eventCount
    };
  }

  /**
   * KG-B: 标记一个 entity 出现在用户接受的 suggestion 里，更新 last_referenced_at。
   * 用于 quality_score 加权（强正反馈）。
   */
  markEntityReferenced(entityName: string) {
    this.db
      .prepare("UPDATE entities SET last_referenced_at = ? WHERE name = ?")
      .run(Date.now(), entityName);
  }

  /**
   * KG-C: 每日 GC。删除符合下列条件的 entity（pinned 永远豁免）：
   *   1. mention_count <= 1 && age > 7 天 && 无任何 relation
   *   2. quality_score < 0.15 && age > 14 天
   *   3. name 命中明显 UI 标签黑名单（防御性，prompt 兜不住时）
   */
  runEntityGC(): { deleted: number; rescored: number } {
    const blacklistPatterns = [
      // 中英常见 UI 标签
      "^(new chat|send|reply|submit|cancel|close|menu|home|back)$",
      "^(发送|提交|取消|关闭|菜单|主页|返回|新建|新对话)$",
      // 通用动词
      "^(browsing|looking|scrolling|loading|searching)$",
      "^(浏览|查看|打开|搜索|加载)$"
    ];

    let deleted = 0;
    const cutoff7 = Date.now() - 7 * 86_400_000;
    const cutoff14 = Date.now() - 14 * 86_400_000;

    // pass 1: 黑名单命中（含 case insensitive）
    const blacklistRow = this.db
      .prepare(`
        SELECT id FROM entities
        WHERE pinned = 0
          AND (
            ${blacklistPatterns.map(() => "LOWER(name) GLOB ?").join(" OR ")}
            OR LOWER(name) GLOB '* button'
            OR LOWER(name) GLOB 'btn *'
          )
      `);
    // SQLite GLOB 没有正则；改用直接小写比对的 IN 列表
    const fixedBlacklist = new Set([
      "new chat", "send", "reply", "submit", "cancel", "close", "menu", "home", "back",
      "发送", "提交", "取消", "关闭", "菜单", "主页", "返回", "新建", "新对话",
      "browsing", "looking", "scrolling", "loading", "searching",
      "浏览", "查看", "打开", "搜索", "加载",
      // R3: ovo 自身相关都不该进 KG
      "ovo", "ovo控制台", "ovo 控制台", "ovo悬浮球", "ovo 悬浮球",
      "ovo 报告", "ovo 健康报告", "ovo 设置", "ovo 状态", "ovo 用户",
      "ovo console", "ovo settings", "ovo report"
    ]);
    // 额外按 substring 包含 "ovo" + 短词的 entity 也清（防止变体）
    const allRows = this.db.prepare("SELECT id, name FROM entities WHERE pinned = 0").all() as Array<{ id: string; name: string }>;
    const fuzzyOvoIds = allRows
      .filter((r) => {
        const n = r.name.toLowerCase().trim();
        if (n === "ovo小程序") return false; // 用户真实项目，保留
        if (n.length > 30) return false;
        return /(^|\s)ovo(\s|$|控制台|悬浮球|报告|状态|设置|用户|console|app|tool)/i.test(n);
      })
      .map((r) => r.id);
    if (fuzzyOvoIds.length > 0) {
      const ph = fuzzyOvoIds.map(() => "?").join(",");
      this.db.prepare(`DELETE FROM relationships WHERE source_id IN (${ph}) OR target_id IN (${ph})`).run(...fuzzyOvoIds, ...fuzzyOvoIds);
      const r = this.db.prepare(`DELETE FROM entities WHERE id IN (${ph})`).run(...fuzzyOvoIds);
      deleted += Number(r.changes ?? 0);
    }
    const blacklistedIds = (this.db
      .prepare("SELECT id, name FROM entities WHERE pinned = 0")
      .all() as Array<{ id: string; name: string }>)
      .filter((r) => fixedBlacklist.has(r.name.trim().toLowerCase()))
      .map((r) => r.id);
    if (blacklistedIds.length > 0) {
      const placeholders = blacklistedIds.map(() => "?").join(",");
      this.db.prepare(`DELETE FROM relationships WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`)
        .run(...blacklistedIds, ...blacklistedIds);
      const r = this.db.prepare(`DELETE FROM entities WHERE id IN (${placeholders})`).run(...blacklistedIds);
      deleted += Number(r.changes ?? 0);
    }
    void blacklistRow; // suppress unused

    // pass 2: 一次性低质量孤儿 entity
    const orphanIds = (this.db
      .prepare(`
        SELECT e.id FROM entities e
        LEFT JOIN relationships r ON r.source_id = e.id OR r.target_id = e.id
        WHERE e.pinned = 0 AND e.mention_count <= 1 AND e.last_seen < ?
        GROUP BY e.id HAVING COUNT(r.id) = 0
      `)
      .all(cutoff7) as Array<{ id: string }>).map((x) => x.id);
    if (orphanIds.length > 0) {
      const placeholders = orphanIds.map(() => "?").join(",");
      const r = this.db.prepare(`DELETE FROM entities WHERE id IN (${placeholders})`).run(...orphanIds);
      deleted += Number(r.changes ?? 0);
    }

    // pass 3: 极低 quality_score 且过期
    const lowQualityIds = (this.db
      .prepare(`SELECT id FROM entities WHERE pinned = 0 AND quality_score < 0.15 AND last_seen < ?`)
      .all(cutoff14) as Array<{ id: string }>).map((x) => x.id);
    if (lowQualityIds.length > 0) {
      const placeholders = lowQualityIds.map(() => "?").join(",");
      this.db.prepare(`DELETE FROM relationships WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`)
        .run(...lowQualityIds, ...lowQualityIds);
      const r = this.db.prepare(`DELETE FROM entities WHERE id IN (${placeholders})`).run(...lowQualityIds);
      deleted += Number(r.changes ?? 0);
    }

    // 清理后重算所有质量分
    const { updated } = this.recomputeAllQualityScores();
    return { deleted, rescored: updated };
  }

  /** 取最近 N 条反馈，按 intent_type 分组算赞踩比例。返回每个 intent 的 (good ratio, total count)。 */
  getFeedbackStatsByIntent(windowMs = 7 * 86_400_000): Array<{ intentType: string; total: number; good: number; ratio: number }> {
    const since = Date.now() - windowMs;
    const rows = this.db
      .prepare(
        `SELECT intent_type as intentType, action, COUNT(*) as cnt
           FROM user_feedback
           WHERE timestamp >= ? AND intent_type IS NOT NULL AND intent_type != ''
           GROUP BY intent_type, action`
      )
      .all(since) as Array<{ intentType: string; action: string; cnt: number }>;
    const map = new Map<string, { total: number; good: number }>();
    for (const r of rows) {
      const cur = map.get(r.intentType) ?? { total: 0, good: 0 };
      cur.total += r.cnt;
      if (r.action === "accepted") cur.good += r.cnt;
      map.set(r.intentType, cur);
    }
    return Array.from(map.entries()).map(([intentType, v]) => ({
      intentType,
      total: v.total,
      good: v.good,
      ratio: v.total === 0 ? 0 : v.good / v.total
    }));
  }

  /** 写入一条 insight_summary entity（事件聚合摘要触发时使用） */
  insertInsightSummary(name: string, description: string, importance = 8): string {
    const id = this.upsertEntity({
      name,
      type: "insight_summary",
      description,
      attributes: { generatedAt: Date.now() }
    });
    safeExecute(
      () => this.db.prepare("UPDATE entities SET importance = ? WHERE id = ?").run(importance, id),
      "kg.insight-summary.set-importance",
      undefined,
      "warn"
    );
    return id;
  }

  /**
   * O1 二级索引：实体在某活动里的角色。
   * 由于 intent 现在是自由文本，用关键词共现做轻量聚类：
   *  - 中文按 2-gram 分词 + 简单停用词
   *  - 英文按空格分词
   *  - 每条 event 取 top-3 关键词
   *  - 统计 (entityId, keyword) 共现 ≥ minHits 即建 (entity)-[plays_role_in]-(activity::keyword) 关系
   *  - 老格式 intent 含 "::" 时把前缀也当一个关键词
   */
  rebuildSceneRoles(opts: { sinceDays?: number; minHits?: number } = {}): { pairs: number; relations: number } {
    const sinceDays = opts.sinceDays ?? 14;
    const minHits = opts.minHits ?? 3;
    const since = Date.now() - sinceDays * 86_400_000;
    const events = this.db
      .prepare(
        `SELECT entity_ids as entityIds, intent
           FROM memory_events
           WHERE timestamp >= ?`
      )
      .all(since) as Array<{ entityIds: string; intent: string }>;

    const counter = new Map<string, number>();
    for (const ev of events) {
      const keywords = extractIntentKeywords(ev.intent || "");
      if (keywords.length === 0) continue;
      const ids = (() => {
        try { return JSON.parse(ev.entityIds || "[]") as string[]; }
        catch { return []; }
      })();
      for (const id of ids) {
        for (const kw of keywords) {
          const key = `${id}\t${kw}`;
          counter.set(key, (counter.get(key) ?? 0) + 1);
        }
      }
    }

    const idToName = new Map<string, string>();
    const allRows = this.db.prepare("SELECT id, name FROM entities").all() as Array<{ id: string; name: string }>;
    for (const r of allRows) idToName.set(r.id, r.name);

    let relations = 0;
    let pairs = 0;
    for (const [key, hits] of counter) {
      pairs += 1;
      if (hits < minHits) continue;
      const [entityId, kw] = key.split("\t");
      const entityName = idToName.get(entityId);
      if (!entityName) continue;
      const activityEntityName = `activity::${kw}`;
      this.upsertEntity({
        name: activityEntityName,
        type: "concept",
        description: `活动关键词：${kw}`,
        attributes: { isActivityRoot: true, keyword: kw }
      });
      const ok = safeExecute(
        () => {
          this.upsertRelation({
            source: entityName,
            target: activityEntityName,
            relation: "plays_role_in",
            context: `近 ${sinceDays} 天共现 ${hits} 次`
          });
          return true;
        },
        "kg.scene-role.upsert-relation",
        false,
        "warn"
      );
      if (ok) relations += 1;
    }
    return { pairs, relations };
  }

  /**
   * M4 三级索引：行为模式。扫最近 30 天 events 时间戳，按 (day-of-week, hour-of-day, entity) 分组，
   * 同组 ≥ 4 次出现的 entity 生成 behavior_pattern entity（importance=8）。
   */
  detectBehaviorPatterns(opts: { sinceDays?: number; minHits?: number } = {}): { patterns: number } {
    const sinceDays = opts.sinceDays ?? 30;
    const minHits = opts.minHits ?? 4;
    const since = Date.now() - sinceDays * 86_400_000;
    const events = this.db
      .prepare(
        `SELECT timestamp, entity_ids as entityIds, intent
           FROM memory_events
           WHERE timestamp >= ?`
      )
      .all(since) as Array<{ timestamp: number; entityIds: string; intent: string }>;
    // key = `${dow}|${hourBucket}|${entityId}` ; hourBucket 用 4 小时窗口
    const counter = new Map<string, number>();
    for (const ev of events) {
      const d = new Date(ev.timestamp);
      const dow = d.getDay();
      const hourBucket = Math.floor(d.getHours() / 4); // 0..5
      const ids = (() => {
        try { return JSON.parse(ev.entityIds || "[]") as string[]; }
        catch { return []; }
      })();
      for (const id of ids) {
        const key = `${dow}|${hourBucket}|${id}`;
        counter.set(key, (counter.get(key) ?? 0) + 1);
      }
    }
    const idToName = new Map<string, string>();
    const allRows = this.db.prepare("SELECT id, name FROM entities").all() as Array<{ id: string; name: string }>;
    for (const r of allRows) idToName.set(r.id, r.name);

    const dowNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const hourLabels = ["凌晨", "清晨", "上午", "下午", "傍晚", "深夜"];
    let patterns = 0;
    for (const [key, hits] of counter) {
      if (hits < minHits) continue;
      const [dowStr, hourStr, entityId] = key.split("|");
      const entityName = idToName.get(entityId);
      if (!entityName) continue;
      const dow = Number(dowStr);
      const hour = Number(hourStr);
      const patternName = `pattern::${dowNames[dow]}${hourLabels[hour]}::${entityName}`;
      const desc = `近 ${sinceDays} 天里，${dowNames[dow]}${hourLabels[hour]}时段共 ${hits} 次涉及 "${entityName}"`;
      const ok = safeExecute(
        () => {
          const id = this.upsertEntity({
            name: patternName,
            type: "behavior_pattern",
            description: desc,
            attributes: { dow, hourBucket: hour, hits, relatedEntity: entityName, generatedAt: Date.now() }
          });
          // importance=8 让它在 getUserContext 加权排序里靠前
          this.db.prepare("UPDATE entities SET importance = ? WHERE id = ?").run(8, id);
          return true;
        },
        "kg.behavior-pattern.upsert",
        false,
        "warn"
      );
      if (ok) patterns += 1;
    }
    return { patterns };
  }

  /**
   * 取最近 N 条 memory_events，用于 H10 聚合摘要。
   * 默认排除 source_window_id = '__legacy__' 的存量脏数据，避免污染聚合。
   */
  getRecentEvents(limit = 50, opts: { includeLegacy?: boolean } = {}) {
    const includeLegacy = opts.includeLegacy ?? false;
    // 5W: 加 actor / actor_name 字段，让 UI 时间线展示"谁做了什么"
    const sql = includeLegacy
      ? `SELECT id, timestamp, app_name as appName, window_title as windowTitle,
                content, summary, intent, importance, source_window_id as sourceWindowId,
                actor, actor_name as actorName
           FROM memory_events
           ORDER BY timestamp DESC
           LIMIT ?`
      : `SELECT id, timestamp, app_name as appName, window_title as windowTitle,
                content, summary, intent, importance, source_window_id as sourceWindowId,
                actor, actor_name as actorName
           FROM memory_events
           WHERE source_window_id != '__legacy__'
           ORDER BY timestamp DESC
           LIMIT ?`;
    // SEC-8: 读取时统一过解密
    const rows = this.db.prepare(sql).all(limit) as Array<{
      id: string;
      timestamp: number;
      appName: string;
      windowTitle: string;
      content: string;
      summary: string;
      intent: string;
      importance: number;
      sourceWindowId: string;
      actor?: string | null;
      actorName?: string | null;
    }>;
    return rows.map((r) => this.decryptEventRow(r));
  }

  /**
   * 按 source_window_id 拉最近 events，给 prompt-engine 召回当前窗口历史用。
   * 永远排除 __legacy__。空字符串 windowId 直接返回空（防误用）。
   */
  getRecentEventsByWindow(windowId: string, limit = 20) {
    if (!windowId || windowId === "__legacy__") return [];
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, app_name as appName, window_title as windowTitle,
                content, summary, intent, importance
           FROM memory_events
           WHERE source_window_id = ?
           ORDER BY timestamp DESC
           LIMIT ?`
      )
      .all(windowId, limit) as Array<{
      id: string;
      timestamp: number;
      appName: string;
      windowTitle: string;
      content: string;
      summary: string;
      intent: string;
      importance: number;
    }>;
    return rows.map((r) => this.decryptEventRow(r));
  }

  private id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  upsertEntity(entity: ExtractedEntity) {
    // DATA-5 / DATA-13: 入库前对 name / description / attributes 跑 redactSensitive
    // 避免 LLM 把"user@host.com"或代码片段当 entity 抽出 + 持久化为明文
    try {
      entity = sanitizeEntityForKg(entity);
    } catch {
      /* 脱敏失败 → 用原值入库（保命） */
    }
    const now = Date.now();
    const normalized = normalizeEntityName(entity.name);
    // 先按 normalized 名精确匹配；再检查 aliases 数组中是否已有该 normalized 值。
    const nameHit = this.db
      .prepare("SELECT id, name, aliases, mention_count FROM entities WHERE LOWER(TRIM(name)) = ?")
      .get(normalized) as
      | { id: string; name: string; aliases: string | null; mention_count: number }
      | undefined;
    const aliasHit = nameHit
      ? undefined
      : (this.db
          .prepare("SELECT id, name, aliases, mention_count FROM entities WHERE aliases LIKE ?")
          .get(`%${JSON.stringify(normalized).slice(1, -1)}%`) as
          | { id: string; name: string; aliases: string | null; mention_count: number }
          | undefined);
    const existed = nameHit ?? aliasHit;
    if (!existed) {
      const id = this.id("ent");
      this.db
        .prepare(
          `INSERT INTO entities (id,name,type,description,attributes,aliases,first_seen,last_seen,mention_count)
           VALUES (?,?,?,?,?,?,?, ?,1)`
        )
        .run(
          id,
          entity.name,
          entity.type,
          entity.description ?? "",
          JSON.stringify(entity.attributes ?? {}),
          JSON.stringify([normalized]),
          now,
          now
        );
      return id;
    }
    const existingAliases = existed.aliases ? (JSON.parse(existed.aliases) as string[]) : [];
    const incomingAlias = entity.name.trim().toLowerCase();
    const mergedAliases = Array.from(new Set([...existingAliases, normalized, incomingAlias]));
    this.db
      .prepare(
        `UPDATE entities
           SET last_seen=?,
               mention_count=?,
               aliases=?,
               updated_at=strftime('%s','now')
         WHERE id=?`
      )
      .run(now, existed.mention_count + 1, JSON.stringify(mergedAliases), existed.id);
    return existed.id;
  }

  upsertRelation(relation: ExtractedRelation) {
    const source = this.db.prepare("SELECT id FROM entities WHERE name = ?").get(relation.source) as
      | { id: string }
      | undefined;
    const target = this.db.prepare("SELECT id FROM entities WHERE name = ?").get(relation.target) as
      | { id: string }
      | undefined;
    if (!source || !target) return null;
    const id = this.id("rel");
    // DATA-6: relationship 的 context 可能含 LLM 引用的原文片段，入库前过脱敏
    const safeContext = relation.context ? redactSensitive(relation.context).cleaned.slice(0, 500) : "";
    this.db
      .prepare(
        `INSERT INTO relationships (id,source_id,target_id,relation,context,valid_from)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(source_id,target_id,relation) DO UPDATE SET
          context=excluded.context,
          strength=MIN(10, relationships.strength + 1),
          updated_at=strftime('%s','now')`
      )
      .run(id, source.id, target.id, relation.relation, safeContext, Date.now());
    return id;
  }

  addEvent(payload: {
    appName: string;
    windowTitle: string;
    content: string;
    summary?: string;
    intent?: string;
    sourceWindowId?: string;
    entityIds?: string[];
    /** OCR 整体置信度 0-1，低于 0.5 直接拒绝入库（DATA-11） */
    confidence?: number;
    /** 5W: 谁做的 — self（用户）/ other（别人）/ system（系统）/ ovo（Ovo 自身）/ unknown */
    actor?: "self" | "other" | "system" | "ovo" | "unknown";
    /** 5W: 当 actor=other 时存对方名字（如群成员 / 邮件发件人） */
    actorName?: string;
  }) {
    // DATA-11: OCR confidence < 0.5 当作乱码丢弃，不污染 KG
    if (typeof payload.confidence === "number" && payload.confidence > 0 && payload.confidence < 0.5) {
      return "";
    }
    // NEW-1 + DATA-7: 入库前二次脱敏 + 截断
    const contentRedacted = redactSensitive(payload.content || "").cleaned;
    const summaryRedacted = redactSensitive(payload.summary || "").cleaned;
    const titleRedacted = redactSensitive(payload.windowTitle || "").cleaned;
    const appRedacted = redactSensitive(payload.appName || "").cleaned;
    // SEC-8: 高敏感字段（OCR 正文 + LLM 总结）走 safeStorage 字段级加密。
    const content = secretsStore.encryptField(contentRedacted.slice(0, MEMORY_CONTENT_MAX_CHARS));
    const summary = secretsStore.encryptField(summaryRedacted.slice(0, MEMORY_SUMMARY_MAX_CHARS));
    const windowTitle = titleRedacted.slice(0, MEMORY_TITLE_MAX_CHARS);
    const appName = appRedacted.slice(0, MEMORY_TITLE_MAX_CHARS);
    // 5W: actor 默认 "unknown"，actor_name 脱敏限长
    const actor = payload.actor ?? "unknown";
    const actorName = payload.actorName
      ? redactSensitive(payload.actorName).cleaned.slice(0, 120)
      : null;

    const id = this.id("evt");
    this.db
      .prepare(
        `INSERT INTO memory_events
           (id,timestamp,app_name,window_title,content,summary,intent,entity_ids,source_window_id,actor,actor_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        id,
        Date.now(),
        appName,
        windowTitle,
        content,
        summary,
        payload.intent ?? "",
        JSON.stringify(payload.entityIds ?? []),
        payload.sourceWindowId ?? "",
        actor,
        actorName
      );
    return id;
  }

  /**
   * SEC-8: 读 memory_events 时统一过解密层。
   * 历史明文数据（enc:v1: 前缀缺失）原样返回，向前兼容。
   */
  private decryptEventRow<T extends { content?: string; summary?: string }>(row: T): T {
    if (row.content) row.content = secretsStore.decryptField(row.content);
    if (row.summary) row.summary = secretsStore.decryptField(row.summary);
    return row;
  }

  /**
   * 加权排序的图谱上下文：mention_count*0.4 + importance*0.3 + recency*0.3。
   * 同时单独取 importance ≥ 7 的 insight_summary entity 作为高密度记忆。
   */
  getUserContext(opts: { limit?: number; recencyHalfLifeDays?: number } = {}): GraphContext & {
    insightSummaries: Array<{ name: string; description: string; importance: number }>;
  } {
    const limit = opts.limit ?? 20;
    // KG-B: 直接用持久化的 quality_score 排序；pinned 永远第一档
    // 排序权重：pinned 强 boost；quality_score 主排序；recency 仅作小补偿避免完全过期
    const halfLifeMs = (opts.recencyHalfLifeDays ?? 7) * 86_400_000;
    const now = Date.now();
    const rawEntities = this.db
      .prepare(
        `SELECT name, type, description, attributes, mention_count, importance, last_seen,
                quality_score, pinned
           FROM entities
           WHERE COALESCE(quality_score, 0.5) >= 0.2  -- 直接过滤掉一部分明显垃圾
              OR pinned = 1
           ORDER BY pinned DESC, quality_score DESC, last_seen DESC
           LIMIT ?`
      )
      .all(Math.max(limit * 3, 60)) as Array<{
      name: string;
      type: ExtractedEntity["type"];
      description: string;
      attributes: string;
      mention_count: number;
      importance: number;
      last_seen: number;
      quality_score: number;
      pinned: number;
    }>;
    const scored = rawEntities.map((row) => {
      const recency = Math.exp(-((now - (row.last_seen || now)) / halfLifeMs));
      // pinned 直接 +1.0；quality_score 是主成分；recency 用作平局打破
      const score = (row.pinned ? 1.0 : 0) + (row.quality_score ?? 0.5) + recency * 0.05;
      return { row, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const relevantEntities: ExtractedEntity[] = scored.slice(0, limit).map(({ row }) => ({
      name: row.name,
      type: row.type,
      description: row.description,
      attributes: JSON.parse(row.attributes || "{}")
    }));

    const relationships = this.db
      .prepare(
        `SELECT s.name as source, t.name as target, r.relation, r.context, r.strength
           FROM relationships r
           JOIN entities s ON s.id = r.source_id
           JOIN entities t ON t.id = r.target_id
           ORDER BY r.strength DESC, r.updated_at DESC
           LIMIT ?`
      )
      .all(limit) as Array<ExtractedRelation & { strength: number }>;

    const insightSummaries = (
      this.db
        .prepare(
          `SELECT name, description, importance FROM entities
             WHERE type = 'insight_summary' AND importance >= 7
             ORDER BY importance DESC, last_seen DESC
             LIMIT 5`
        )
        .all() as Array<{ name: string; description: string; importance: number }>
    ).map((r) => ({ name: r.name, description: r.description ?? "", importance: r.importance }));

    return { relevantEntities, relevantRelations: relationships, insightSummaries };
  }

  /**
   * Q2: 取已建立的用户角色画像（type=interest_profile），按 confidence 排序。
   * confidence 存在 attributes.confidence；lastSeen 用 last_seen。
   */
  getKnownRoles(limit = 5): Array<{ role: string; confidence: number; lastSeen: number }> {
    const rows = this.db
      .prepare(
        `SELECT name, attributes, last_seen
           FROM entities
           WHERE type = 'interest_profile'
           ORDER BY last_seen DESC
           LIMIT ?`
      )
      .all(limit * 2) as Array<{ name: string; attributes: string; last_seen: number }>;
    const out = rows.map((r) => {
      let confidence = 0.5;
      // attributes 为半截 JSON 时 confidence 走默认 0.5（合理 silent）
      try {
        const attrs = JSON.parse(r.attributes || "{}") as { confidence?: unknown };
        if (typeof attrs.confidence === "number") confidence = Math.max(0, Math.min(1, attrs.confidence));
      } catch { /* legitimate: 默认 confidence=0.5 */ }
      return { role: r.name, confidence, lastSeen: r.last_seen ?? 0 };
    });
    out.sort((a, b) => b.confidence - a.confidence);
    return out.slice(0, limit);
  }

  /**
   * Q2: LLM 这一轮推断了一个角色，写进 KG 累加 confidence。
   * 同名角色已存在 → 软更新 confidence (EWMA: 0.7*old + 0.3*new)
   * 不存在 → 直接以新 confidence 写入
   */
  recordRoleHypothesis(role: string, confidence: number) {
    if (!role || !Number.isFinite(confidence)) return;
    const c = Math.max(0, Math.min(1, confidence));
    const existing = this.db
      .prepare(`SELECT id, attributes FROM entities WHERE type='interest_profile' AND name = ? LIMIT 1`)
      .get(role) as { id: string; attributes: string } | undefined;
    let newConfidence = c;
    if (existing) {
      let oldConf = 0.5;
      // attributes 半截 JSON 时按 0.5 起算（合理 silent）
      try {
        const a = JSON.parse(existing.attributes || "{}") as { confidence?: number };
        if (typeof a.confidence === "number") oldConf = a.confidence;
      } catch { /* legitimate: oldConf 用默认 0.5 */ }
      newConfidence = 0.7 * oldConf + 0.3 * c;
    }
    this.upsertEntity({
      name: role,
      type: "interest_profile",
      description: `用户在某些屏幕活动里被推断扮演的角色：${role}`,
      attributes: { confidence: newConfidence, lastConfidence: c }
    });
  }

  /**
   * Q2: 把过去 14 天的 user_feedback 聚合成一段给 LLM 看的"反馈画像"文字。
   * 包含：
   *   - 按 suggestion_type 算接受率（accepted / total）
   *   - 区分高接受 (≥70%)、低接受 (≤30%)
   *   - 总反馈数太少（< 5）时返回空字符串，避免噪音
   */
  getUserFeedbackProfile(windowMs = 14 * 86_400_000): string {
    const since = Date.now() - windowMs;
    const rows = this.db
      .prepare(
        `SELECT suggestion_type as type, action, COUNT(*) as cnt
           FROM user_feedback
           WHERE timestamp >= ? AND suggestion_type IS NOT NULL AND suggestion_type != ''
           GROUP BY suggestion_type, action`
      )
      .all(since) as Array<{ type: string; action: string; cnt: number }>;
    if (rows.length === 0) return "";
    const map = new Map<string, { accepted: number; rejected: number; ignored: number; total: number }>();
    for (const r of rows) {
      const cur = map.get(r.type) ?? { accepted: 0, rejected: 0, ignored: 0, total: 0 };
      cur.total += r.cnt;
      if (r.action === "accepted") cur.accepted += r.cnt;
      else if (r.action === "rejected") cur.rejected += r.cnt;
      else if (r.action === "ignored") cur.ignored += r.cnt;
      map.set(r.type, cur);
    }
    const stats = Array.from(map.entries())
      .map(([type, v]) => ({ type, ...v, ratio: v.total === 0 ? 0 : v.accepted / v.total }))
      .filter((s) => s.total >= 2);
    if (stats.length === 0) return "";
    const totalFeedback = stats.reduce((s, x) => s + x.total, 0);
    if (totalFeedback < 5) return "";
    const liked = stats.filter((s) => s.ratio >= 0.7).sort((a, b) => b.ratio - a.ratio);
    const disliked = stats.filter((s) => s.ratio <= 0.3).sort((a, b) => a.ratio - b.ratio);
    const lines: string[] = [];
    if (liked.length > 0) {
      lines.push(`- 用户**喜欢**这些类型（接受率高，多出）：${liked.map((s) => `${s.type}(${(s.ratio * 100).toFixed(0)}%, n=${s.total})`).join(", ")}`);
    }
    if (disliked.length > 0) {
      lines.push(`- 用户**不喜欢**这些类型（接受率低，避免出，除非真的有价值）：${disliked.map((s) => `${s.type}(${(s.ratio * 100).toFixed(0)}%, n=${s.total})`).join(", ")}`);
    }
    if (lines.length === 0) return "";
    return lines.join("\n");
  }

  getRelevantContext(limit = 20): GraphContext {
    const entities = this.db
      .prepare("SELECT name,type,description,attributes FROM entities ORDER BY last_seen DESC LIMIT ?")
      .all(limit) as Array<{
      name: string;
      type: ExtractedEntity["type"];
      description: string;
      attributes: string;
    }>;
    const relevantEntities: ExtractedEntity[] = entities.map((entity) => ({
      name: entity.name,
      type: entity.type,
      description: entity.description,
      attributes: JSON.parse(entity.attributes || "{}")
    }));

    const relationships = this.db
      .prepare(
        `SELECT s.name as source, t.name as target, r.relation, r.context
         FROM relationships r
         JOIN entities s ON s.id = r.source_id
         JOIN entities t ON t.id = r.target_id
         ORDER BY r.updated_at DESC LIMIT ?`
      )
      .all(limit) as ExtractedRelation[];
    return { relevantEntities, relevantRelations: relationships };
  }

  searchEntities(query: string, limit = 200): Array<ExtractedEntity & { id: string; qualityScore: number; pinned: boolean; mentionCount: number }> {
    // KG-D: 默认 limit 200（让 UI 列表能显示更多），多带 quality_score / pinned / mention_count
    const keyword = query.trim();
    const all = !keyword;
    // CODE-5: LIKE 通配符 % / _ / \ 必须转义，否则用户搜 "100%" / "a_b" 会全表 scan 且语义错乱
    const escaped = keyword.replace(/[%_\\]/g, (m) => `\\${m}`);
    const needle = all ? "" : `%${escaped}%`;
    const rows = all
      ? (this.db
          .prepare(
            `SELECT id, name, type, description, attributes,
                    COALESCE(quality_score, 0.5) as quality_score,
                    COALESCE(pinned, 0) as pinned,
                    COALESCE(mention_count, 1) as mention_count
               FROM entities
              ORDER BY pinned DESC, quality_score DESC, last_seen DESC
              LIMIT ?`
          )
          .all(limit) as Array<{
          id: string; name: string; type: ExtractedEntity["type"]; description: string; attributes: string;
          quality_score: number; pinned: number; mention_count: number;
        }>)
      : (this.db
          .prepare(
            `SELECT id, name, type, description, attributes,
                    COALESCE(quality_score, 0.5) as quality_score,
                    COALESCE(pinned, 0) as pinned,
                    COALESCE(mention_count, 1) as mention_count
               FROM entities
              WHERE name LIKE ? ESCAPE '\\' OR type LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
              ORDER BY pinned DESC, quality_score DESC, last_seen DESC
              LIMIT ?`
          )
          .all(needle, needle, needle, limit) as Array<{
          id: string; name: string; type: ExtractedEntity["type"]; description: string; attributes: string;
          quality_score: number; pinned: number; mention_count: number;
        }>);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      attributes: JSON.parse(row.attributes || "{}"),
      qualityScore: row.quality_score,
      pinned: row.pinned === 1,
      mentionCount: row.mention_count
    }));
  }

  getEvents(limit = 100) {
    const rows = this.db.prepare("SELECT * FROM memory_events ORDER BY timestamp DESC LIMIT ?").all(limit) as Array<{
      content?: string; summary?: string;
    }>;
    return rows.map((r) => this.decryptEventRow(r));
  }

  /** 取整张图的快照：节点 + 边，限制规模避免渲染爆炸。 */
  getGraphSnapshot(limit = 80) {
    // KG-F: 多带 quality_score / pinned，让前端做视觉权重 + 孤立节点判定
    const entities = this.db
      .prepare(
        `SELECT id, name, type, description, mention_count, last_seen,
                COALESCE(quality_score, 0.5) as quality_score,
                COALESCE(pinned, 0) as pinned
           FROM entities
           ORDER BY pinned DESC, quality_score DESC, mention_count DESC, last_seen DESC
           LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      name: string;
      type: ExtractedEntity["type"];
      description: string;
      mention_count: number;
      last_seen: number;
      quality_score: number;
      pinned: number;
    }>;
    const ids = new Set(entities.map((entity) => entity.id));
    const relationships = this.db
      .prepare(
        `SELECT id, source_id as sourceId, target_id as targetId, relation, strength, updated_at
           FROM relationships
           ORDER BY strength DESC, updated_at DESC
           LIMIT ?`
      )
      .all(limit * 3) as Array<{
      id: string;
      sourceId: string;
      targetId: string;
      relation: string;
      strength: number;
      updated_at: number;
    }>;
    // 只保留两端都在节点集合里的关系
    const filtered = relationships.filter((r) => ids.has(r.sourceId) && ids.has(r.targetId));
    return {
      nodes: entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        mentionCount: entity.mention_count,
        lastSeen: entity.last_seen,
        qualityScore: entity.quality_score,
        pinned: entity.pinned === 1
      })),
      edges: filtered.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        targetId: r.targetId,
        relation: r.relation,
        strength: r.strength,
        updatedAt: r.updated_at
      }))
    };
  }

  /** 按实体 id 查询最近相关的 memory_events。entity_ids 是 JSON 数组字符串，使用 LIKE 匹配。 */
  getEventsByEntity(entityId: string, limit = 50) {
    const needle = `%"${entityId}"%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_events
         WHERE entity_ids LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(needle, limit) as Array<{ content?: string; summary?: string }>;
    return rows.map((r) => this.decryptEventRow(r));
  }

  /**
   * 关系强度时效衰减：按最近一次 `updated_at` 与 now 的天数差，对 strength 做几何衰减。
   * 每日定时调用一次即可；衰减率 0.95/天。
   */
  decayRelationships(decayPerDay = 0.95) {
    const rows = this.db
      .prepare("SELECT id, strength, updated_at FROM relationships")
      .all() as Array<{ id: string; strength: number; updated_at: number }>;
    const now = Math.floor(Date.now() / 1000);
    const update = this.db.prepare(
      "UPDATE relationships SET strength = ?, updated_at = strftime('%s','now') WHERE id = ?"
    );
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const daysIdle = Math.max(0, (now - (row.updated_at ?? now)) / 86400);
        if (daysIdle < 1) continue;
        const next = Math.max(1, Math.round(row.strength * Math.pow(decayPerDay, daysIdle)));
        if (next !== row.strength) update.run(next, row.id);
      }
    });
    tx();
    return rows.length;
  }

  /**
   * CODE-6: feedback-engine 不再反射访问私有 db；走这个公开方法插入用户反馈记录。
   */
  insertFeedback(payload: {
    suggestionId: string;
    suggestionType: string;
    action: "accepted" | "rejected" | "ignored";
    personalityContext?: string;
    appContext?: string;
    intentType?: string;
    pipelineId?: string;
  }): string {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        `INSERT INTO user_feedback (id,suggestion_id,suggestion_type,action,personality_context,app_context,intent_type,pipeline_id,timestamp)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        id,
        payload.suggestionId,
        payload.suggestionType,
        payload.action,
        payload.personalityContext ?? "",
        payload.appContext ?? "",
        payload.intentType ?? "",
        payload.pipelineId ?? null,
        Date.now()
      );
    return id;
  }

  getStats() {
    const entities = this.db.prepare("SELECT COUNT(1) as total FROM entities").get() as { total: number };
    const relationships = this.db.prepare("SELECT COUNT(1) as total FROM relationships").get() as { total: number };
    const events = this.db.prepare("SELECT COUNT(1) as total FROM memory_events").get() as { total: number };
    const pipeline = this.db.prepare("SELECT COUNT(1) as total FROM pipeline_logs").get() as { total: number };
    return {
      entities: entities.total,
      relationships: relationships.total,
      events: events.total,
      pipelines: pipeline.total
    };
  }

  /**
   * CODE-15: 用户点"删除所有数据"应该清光，不能有任何残留。
   * 用 transaction 保证原子性 — 中途失败不留半截脏数据。
   */
  clearAll() {
    const tx = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM entities;
        DELETE FROM relationships;
        DELETE FROM memory_events;
        DELETE FROM pipeline_logs;
        DELETE FROM business_logs;
        DELETE FROM system_logs;
        DELETE FROM user_feedback;
        DELETE FROM prompt_eval_suggestions;
        DELETE FROM negative_patterns;
        DELETE FROM drafts;
        DELETE FROM evidence_inflation;
      `);
    });
    tx();
  }

  savePipelineLog(id: string, duration: number, status: string, stages: unknown, overallRating?: string) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pipeline_logs (id,timestamp,duration,status,stages,overall_rating)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, Date.now(), duration, status, JSON.stringify(stages), overallRating ?? null);
  }

  /** 更新已存在 pipeline 的 stages（用于 pending Action 确认后回写等），不修改首条 timestamp */
  updatePipelineStages(id: string, duration: number, status: string, stages: unknown, overallRating?: string | null) {
    this.db
      .prepare(
        `UPDATE pipeline_logs SET duration = ?, status = ?, stages = ?, overall_rating = COALESCE(?, overall_rating) WHERE id = ?`
      )
      .run(duration, status, JSON.stringify(stages), overallRating ?? null, id);
  }

  getPipelines(limit = 50) {
    return this.db.prepare("SELECT * FROM pipeline_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  getPipelineById(id: string) {
    return this.db.prepare("SELECT * FROM pipeline_logs WHERE id = ?").get(id);
  }

  addBusinessLog(payload: {
    pipelineId?: string | null;
    node: string;
    status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
    input?: unknown;
    output?: unknown;
    error?: string;
    meta?: Record<string, unknown>;
    startTime?: number;
    endTime?: number;
  }) {
    const id = this.id("biz");
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO business_logs (id,pipeline_id,node,status,input,output,error,meta,start_time,end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        payload.pipelineId ?? null,
        payload.node,
        payload.status,
        JSON.stringify(payload.input ?? null),
        JSON.stringify(payload.output ?? null),
        payload.error ?? null,
        JSON.stringify(payload.meta ?? {}),
        payload.startTime ?? now,
        payload.endTime ?? null
      );
    return id;
  }

  updateBusinessLog(
    id: string,
    patch: Partial<{
      status: "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
      output: unknown;
      error: string;
      meta: Record<string, unknown>;
      endTime: number;
    }>
  ) {
    const row = this.db
      .prepare("SELECT status, output, error, meta, end_time FROM business_logs WHERE id = ?")
      .get(id) as
      | { status: string; output: string | null; error: string | null; meta: string | null; end_time: number | null }
      | undefined;
    if (!row) return false;
    const nextMeta = patch.meta ?? (row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {});
    const nextOutput = patch.output !== undefined ? patch.output : row.output ? JSON.parse(row.output) : null;
    const nextError = patch.error !== undefined ? patch.error : row.error;
    const endTime = patch.endTime ?? row.end_time ?? null;
    this.db
      .prepare(
        `UPDATE business_logs
           SET status = ?, output = ?, error = ?, meta = ?, end_time = ?, updated_at = strftime('%s','now')
         WHERE id = ?`
      )
      .run(patch.status ?? row.status, JSON.stringify(nextOutput), nextError, JSON.stringify(nextMeta), endTime, id);
    return true;
  }

  getBusinessLogs(limit = 100, pipelineId?: string) {
    if (pipelineId) {
      return this.db
        .prepare("SELECT * FROM business_logs WHERE pipeline_id = ? ORDER BY start_time DESC LIMIT ?")
        .all(pipelineId, limit);
    }
    return this.db.prepare("SELECT * FROM business_logs ORDER BY start_time DESC LIMIT ?").all(limit);
  }

  addSystemLog(payload: {
    level: "info" | "warning" | "error";
    source: string;
    message: string;
    context?: Record<string, unknown>;
    timestamp?: number;
  }) {
    const id = this.id("sys");
    this.db
      .prepare(`INSERT INTO system_logs (id,timestamp,level,source,message,context) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        payload.timestamp ?? Date.now(),
        payload.level,
        payload.source,
        payload.message,
        JSON.stringify(payload.context ?? {})
      );
    return id;
  }

  /**
   * 取单个 action 的完整上下文——给主控台 ActionDetailDrawer 用。
   * 整合 business_logs 中所有相关节点 + 关联 pipeline 的 OCR / LLM 推理片段。
   */
  getActionDetail(actionId: string): {
    actionId: string;
    found: boolean;
    type: string;
    description: string;
    params: Record<string, unknown>;
    requireConfirm: boolean;
    status: string;
    output: string;
    error?: string;
    confirmedByUser: boolean;
    startedAt: number;
    durationMs: number;
    pipelineId?: string;
    pipelineStartedAt?: number;
    appName?: string;
    windowTitle?: string;
    /** OCR 看到的原文片段（脱敏后） */
    ocrPreview?: string;
    /** LLM 推断意图 */
    intent?: string;
    /** LLM 给出的总结 */
    summary?: string;
    /** LLM 给出的"接下来你可能..."预测，区别于 summary */
    prediction?: string;
    /** 同次 pipeline 里 LLM 提出的其他 action（不含当前这条） */
    siblingActions?: Array<{
      id: string;
      type: string;
      description: string;
      status: string;
    }>;
    /** 同次 pipeline 里 LLM 给出的 suggestion 标题（限 5 条） */
    siblingSuggestions?: Array<{ title: string }>;
    /** 该 action 在 pipeline 中的所有 business_logs 节点 */
    timeline: Array<{
      node: string;
      status: string;
      startTime: number;
      endTime: number;
      durationMs: number;
      error?: string;
    }>;
  } | null {
    // 1) 在 business_logs 中找 actions.execute 或 action.confirm.execute，其 input.actions 或 input.actionId 包含 actionId
    // 用 LIKE 粗筛——这里 LIKE 转义不重要（actionId 是内部 id 不会含 % 或 _）
    const escaped = String(actionId).replace(/[%_]/g, (m) => `\\${m}`);
    const candidates = this.db
      .prepare(
        `SELECT id, pipeline_id, node, input, output, error, start_time, end_time
           FROM business_logs
           WHERE (node = 'actions.execute' OR node = 'action.confirm.execute')
             AND (input LIKE '%' || ? || '%' ESCAPE '\\' OR output LIKE '%' || ? || '%' ESCAPE '\\')
           ORDER BY start_time DESC
           LIMIT 5`
      )
      .all(escaped, escaped) as Array<{
      id: string; pipeline_id: string; node: string;
      input: string; output: string; error: string;
      start_time: number; end_time: number;
    }>;

    if (candidates.length === 0) return { actionId, found: false } as ReturnType<KnowledgeGraphEngine["getActionDetail"]> & { found: false };

    let foundType = "";
    let foundDescription = "";
    let foundParams: Record<string, unknown> = {};
    let foundRequireConfirm = false;
    let foundStatus = "";
    let foundOutput = "";
    let foundError: string | undefined;
    let foundConfirmed = false;
    let foundStartedAt = 0;
    let foundDurationMs = 0;
    let foundPipelineId: string | undefined;
    let foundSiblingActions: Array<{ id: string; type: string; description: string; status: string }> = [];

    for (const c of candidates) {
      try {
        const inp = JSON.parse(c.input ?? "{}") as Record<string, unknown>;
        const out = JSON.parse(c.output ?? "{}") as Record<string, unknown>;
        // 在 actions.execute 里 input.actions 是数组
        const inputActions = (inp.actions as Array<Record<string, unknown>> | undefined) ?? [];
        const inputAction = inputActions.find((a) => a.id === actionId);
        // 在 action.confirm.execute 里 input 直接是 {actionId, description}
        const isConfirm = c.node === "action.confirm.execute" && inp.actionId === actionId;
        // 在 output.results 找对应 result
        const results = (out.results as Array<Record<string, unknown>> | undefined) ?? [];
        const result = results.find((r) => r.actionId === actionId) ?? (isConfirm ? out : undefined);
        if (!inputAction && !isConfirm && !result) continue;

        const a = inputAction ?? {};
        foundType = String(a.type ?? (result?.type) ?? "");
        foundDescription = String(a.description ?? inp.description ?? "");
        foundParams = (a.params as Record<string, unknown>) ?? {};
        foundRequireConfirm = Boolean(a.requireConfirm ?? isConfirm);
        if (result) {
          foundStatus = String(result.status ?? "");
          foundOutput = String(result.output ?? "");
          foundError = result.error ? String(result.error) : undefined;
          foundDurationMs = Number(result.duration ?? 0);
        }
        foundConfirmed = isConfirm || foundConfirmed;
        foundStartedAt = c.start_time;
        foundPipelineId = c.pipeline_id;
        // sibling actions — 同 batch 里除了自己之外的 action（只在 actions.execute 路径有）
        if (inputActions.length > 1) {
          foundSiblingActions = inputActions
            .filter((other) => other.id && other.id !== actionId)
            .map((other) => {
              const rid = String(other.id);
              const r = results.find((rr) => rr.actionId === rid);
              return {
                id: rid,
                type: String(other.type ?? ""),
                description: String(other.description ?? ""),
                status: String(r?.status ?? "pending")
              };
            });
        }
        break;
      } catch { /* skip malformed row */ }
    }

    // 关联 pipeline_logs 取上下文（app / window / OCR 预览 / 意图 / 总结）
    let appName: string | undefined;
    let windowTitle: string | undefined;
    let ocrPreview: string | undefined;
    let intent: string | undefined;
    let summary: string | undefined;
    let pipelineStartedAt: number | undefined;
    let prediction: string | undefined;
    let siblingSuggestions: Array<{ title: string }> = [];
    if (foundPipelineId) {
      const plRow = this.db
        .prepare(`SELECT timestamp, stages FROM pipeline_logs WHERE id = ?`)
        .get(foundPipelineId) as { timestamp: number; stages: string } | undefined;
      if (plRow) {
        pipelineStartedAt = plRow.timestamp;
        try {
          const stages = JSON.parse(plRow.stages ?? "{}") as Record<string, { input?: Record<string, unknown>; output?: Record<string, unknown>; data?: Record<string, unknown> }>;
          const aggIn = stages.aggregate?.input ?? {};
          const aggOut = stages.aggregate?.output ?? {};
          const agentOut = (stages.agent?.output ?? {}) as Record<string, unknown>;
          appName = String((aggIn as Record<string, unknown>).appName ?? "");
          windowTitle = String((aggIn as Record<string, unknown>).windowTitle ?? "");
          ocrPreview = String((aggOut as Record<string, unknown>).preview ?? "").slice(0, 500);
          intent = String(agentOut.intent ?? "");
          // summary 和 prediction 分开存（C: 因果链增强）
          const rawSummary = String(agentOut.summary ?? "");
          const rawPrediction = String(agentOut.prediction ?? "");
          summary = rawSummary || rawPrediction; // 兼容老数据
          prediction = rawPrediction && rawPrediction !== rawSummary ? rawPrediction : undefined;
          // sibling suggestions — 从 stages.suggestions.data.suggestions 拿（限 5 条）
          const suggData = (stages.suggestions?.data ?? {}) as Record<string, unknown>;
          const suggList = (suggData.suggestions as Array<Record<string, unknown>> | undefined) ?? [];
          siblingSuggestions = suggList.slice(0, 5)
            .map((s) => ({ title: String(s.title ?? "").trim() }))
            .filter((s) => s.title);
        } catch { /* */ }
      }
    }

    // 整条 timeline——同 pipeline 里所有 business_logs 节点
    let timeline: ReturnType<KnowledgeGraphEngine["getActionDetail"]> extends infer T
      ? T extends { timeline: infer L } ? L : never
      : never = [];
    if (foundPipelineId) {
      const rows = this.db
        .prepare(
          `SELECT node, status, error, start_time, end_time
             FROM business_logs
             WHERE pipeline_id = ?
             ORDER BY start_time ASC`
        )
        .all(foundPipelineId) as Array<{
        node: string; status: string; error: string;
        start_time: number; end_time: number;
      }>;
      timeline = rows.map((r) => ({
        node: r.node,
        status: r.status,
        startTime: r.start_time,
        endTime: r.end_time ?? r.start_time,
        durationMs: Math.max(0, (r.end_time ?? r.start_time) - r.start_time),
        error: r.error || undefined
      }));
    }

    return {
      actionId,
      found: true,
      type: foundType,
      description: foundDescription,
      params: foundParams,
      requireConfirm: foundRequireConfirm,
      status: foundStatus,
      output: foundOutput,
      error: foundError,
      confirmedByUser: foundConfirmed,
      startedAt: foundStartedAt,
      durationMs: foundDurationMs,
      pipelineId: foundPipelineId,
      pipelineStartedAt,
      appName,
      windowTitle,
      ocrPreview,
      intent,
      summary,
      prediction,
      siblingActions: foundSiblingActions.length ? foundSiblingActions : undefined,
      siblingSuggestions: siblingSuggestions.length ? siblingSuggestions : undefined,
      timeline
    };
  }

  /**
   * 拉 toast 弹窗历史——给主控台「通知历史」面板用。
   * 复用 system_logs 表，source LIKE "toast.%" 过滤。
   */
  getToastHistory(limit = 100): Array<{
    id: string;
    timestamp: number;
    title: string;
    type: string;
    priority: number;
    tier: string;
    content: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, message, context
           FROM system_logs
           WHERE source = 'toast.shown'
           ORDER BY timestamp DESC
           LIMIT ?`
      )
      .all(limit) as Array<{ id: string; timestamp: number; message: string; context: string }>;
    return rows.map((r) => {
      let ctx: Record<string, unknown> = {};
      try { ctx = JSON.parse(r.context ?? "{}"); } catch { /* */ }
      return {
        id: r.id,
        timestamp: r.timestamp,
        title: r.message ?? "",
        type: String(ctx.type ?? ""),
        priority: Number(ctx.priority ?? 0),
        tier: String(ctx.tier ?? ""),
        content: String(ctx.content ?? "")
      };
    });
  }

  getSystemLogs(limit = 200) {
    return this.db.prepare("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  // ============================================================================
  // 产出物看板 —— 用户反馈："Ovo 替我做的事我在哪看？"
  // 聚合各种 ovo 产出物：笔记 / 已复制 / 已发邮件 / 已设提醒等
  // ============================================================================

  /**
   * 拉最近 N 条"已发生"的产出物（不含 drafts，drafts 单独走 listDrafts）。
   * 数据源：business_logs 中 node=actions.execute 或 action.confirm.execute 的 success 结果。
   * 每条产出物按 actionId 去重，保留最新 status。
   */
  getRecentOutputs(limit = 50): Array<{
    actionId: string;
    type: string;
    description: string;
    status: string;
    timestamp: number;
    pipelineId?: string;
    params?: Record<string, unknown>;
    output?: string;
  }> {
    // 拉最近的 actions.execute / action.confirm.execute business_log
    const rows = this.db.prepare(
      `SELECT id, pipeline_id, node, input, output, status, start_time
         FROM business_logs
        WHERE node IN ('actions.execute','action.confirm.execute')
        ORDER BY start_time DESC
        LIMIT ?`
    ).all(limit * 3) as Array<{
      id: string; pipeline_id: string | null; node: string;
      input: string; output: string; status: string; start_time: number;
    }>;

    const seen = new Set<string>();
    const out: Array<{
      actionId: string; type: string; description: string; status: string;
      timestamp: number; pipelineId?: string; params?: Record<string, unknown>; output?: string;
    }> = [];

    for (const r of rows) {
      if (out.length >= limit) break;
      try {
        const inp = JSON.parse(r.input ?? "{}") as Record<string, unknown>;
        const outp = JSON.parse(r.output ?? "{}") as Record<string, unknown>;
        const inputActions = (inp.actions as Array<Record<string, unknown>> | undefined) ?? [];
        const results = (outp.results as Array<Record<string, unknown>> | undefined) ?? [];
        // confirm 路径 input 直接是 {actionId, description}
        const isConfirm = r.node === "action.confirm.execute";
        if (isConfirm) {
          const actionId = String(inp.actionId ?? "");
          if (!actionId || seen.has(actionId)) continue;
          // 从 results[0] 取实际结果（confirm 路径的格式）
          const firstResult = results[0] ?? {};
          const status = String(firstResult.status ?? r.status ?? "");
          if (status !== "success") continue;
          const ctype = String(firstResult.type ?? "other");
          if (NON_DELIVERABLE_OUTPUT_TYPES.has(ctype)) continue; // 策展：跳过归档/导航
          seen.add(actionId);
          out.push({
            actionId,
            type: ctype,
            description: String(inp.description ?? ""),
            status,
            timestamp: r.start_time,
            pipelineId: r.pipeline_id ?? undefined,
            output: typeof firstResult.output === "string" ? firstResult.output : undefined
          });
          continue;
        }
        // actions.execute 路径：input.actions[] 跟 output.results[] 一一对应
        for (const a of inputActions) {
          const actionId = String(a.id ?? "");
          if (!actionId || seen.has(actionId)) continue;
          const result = results.find((rr) => rr.actionId === actionId);
          if (!result) continue;
          const status = String(result.status ?? "");
          if (status !== "success") continue;
          const atype = String(a.type ?? "other");
          if (NON_DELIVERABLE_OUTPUT_TYPES.has(atype)) continue; // 策展：跳过归档/导航
          seen.add(actionId);
          out.push({
            actionId,
            type: atype,
            description: String(a.description ?? ""),
            status,
            timestamp: r.start_time,
            pipelineId: r.pipeline_id ?? undefined,
            params: (a.params as Record<string, unknown>) ?? {},
            output: typeof result.output === "string" ? result.output : undefined
          });
          if (out.length >= limit) break;
        }
      } catch { /* skip malformed row */ }
    }
    return out;
  }

  // ── 草稿台 + 反向校准：实现在 kg/drafts-store.ts，这里薄委托（调用方零改动）──
  addDraft(payload: Parameters<typeof draftsStore.addDraft>[1]): void {
    draftsStore.addDraft(this.db, payload);
  }
  listDrafts(limit = 20): DraftRow[] {
    return draftsStore.listDrafts(this.db, limit);
  }
  promoteDraft(id: string): { ok: boolean; draft?: DraftRow } {
    return draftsStore.promoteDraft(this.db, id);
  }
  dismissDraft(id: string): { ok: boolean } {
    // dismiss 时回调 bumpInflation 做反向校准（T8）
    return draftsStore.dismissDraft(this.db, id, (ctx) => this.bumpInflation(ctx));
  }
  revertDraft(id: string): { ok: boolean } {
    return draftsStore.revertDraft(this.db, id);
  }
  expireOldDrafts(olderThanMs?: number): { expired: number } {
    return draftsStore.expireOldDrafts(this.db, olderThanMs);
  }
  bumpInflation(ctx: { appName?: string; actionType?: string; intent?: string }, delta = 1): void {
    draftsStore.bumpInflation(this.db, (p) => this.id(p), ctx, delta);
  }
  getInflationWarnings(
    ctx: { appName?: string; intent?: string },
    threshold = 3,
    limit = 5
  ): Array<{ appName: string; actionType: string; intent: string; effectiveScore: number }> {
    return draftsStore.getInflationWarnings(this.db, ctx, threshold, limit);
  }

  // ── 到期执行调度：实现在 kg/scheduled-actions-store.ts，这里薄委托 ──
  addScheduledAction(payload: Omit<Parameters<typeof schedStore.addScheduledAction>[1], "id"> & { id?: string }): string {
    const id = payload.id ?? this.id("sched");
    schedStore.addScheduledAction(this.db, { ...payload, id });
    return id;
  }
  listDueScheduledActions(now?: number): schedStore.ScheduledActionRow[] {
    return schedStore.listDueScheduledActions(this.db, now);
  }
  listScheduledActions(limit = 50): schedStore.ScheduledActionRow[] {
    return schedStore.listScheduledActions(this.db, limit);
  }
  settleScheduledAction(id: string, ok: boolean, resultSummary: string): void {
    schedStore.settleScheduledAction(this.db, id, ok, resultSummary);
  }
  cancelScheduledAction(id: string): { ok: boolean } {
    return schedStore.cancelScheduledAction(this.db, id);
  }
  purgeOldScheduledActions(olderThanMs?: number): { purged: number } {
    return schedStore.purgeOldScheduledActions(this.db, olderThanMs);
  }

  /** Close the database connection - should be called on app quit */
  close() {
    this.db.close();
  }
}
