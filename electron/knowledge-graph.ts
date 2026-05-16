import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { ExtractedEntity, ExtractedRelation } from "./types.js";
import type { GraphContext } from "./prompt-engine.js";
import { getUserDataPath } from "./electron-loader.js";

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
    this.bootstrap();
  }

  private getDefaultUserDataPath() {
    return getUserDataPath();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        description TEXT,
        attributes TEXT,
        aliases TEXT,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        mention_count INTEGER DEFAULT 1,
        importance INTEGER DEFAULT 5,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        context TEXT,
        strength INTEGER DEFAULT 5,
        valid_from INTEGER,
        valid_until INTEGER,
        evidence TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(source_id,target_id,relation)
      );
      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT,
        content TEXT NOT NULL,
        summary TEXT,
        intent TEXT,
        importance INTEGER DEFAULT 5,
        tags TEXT,
        entity_ids TEXT,
        source_window_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT NOT NULL,
        suggestion_type TEXT,
        action TEXT NOT NULL,
        personality_context TEXT,
        app_context TEXT,
        timestamp INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS pipeline_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        duration INTEGER,
        status TEXT NOT NULL,
        stages TEXT NOT NULL,
        overall_rating TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS business_logs (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT,
        node TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT,
        output TEXT,
        error TEXT,
        meta TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS system_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);
    // 兼容老库：user_feedback 加 intent_type 字段
    try {
      const cols = this.db
        .prepare("PRAGMA table_info(user_feedback)")
        .all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === "intent_type")) {
        this.db.exec("ALTER TABLE user_feedback ADD COLUMN intent_type TEXT");
      }
    } catch {
      /* swallow migration errors */
    }

    // KG-B: entities 加 quality_score / pinned / last_referenced_at 三个字段
    try {
      const cols = this.db
        .prepare("PRAGMA table_info(entities)")
        .all() as Array<{ name: string }>;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("quality_score")) {
        this.db.exec("ALTER TABLE entities ADD COLUMN quality_score REAL DEFAULT 0.5");
      }
      if (!names.has("pinned")) {
        this.db.exec("ALTER TABLE entities ADD COLUMN pinned INTEGER DEFAULT 0");
      }
      if (!names.has("last_referenced_at")) {
        // 该 entity 最近一次出现在用户接受的 suggestion / offer 里的时间戳
        this.db.exec("ALTER TABLE entities ADD COLUMN last_referenced_at INTEGER DEFAULT 0");
      }
      // 索引：quality_score 倒序常用，pinned 用于 GC 保护
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_entities_quality ON entities(quality_score DESC)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_entities_pinned ON entities(pinned)");
    } catch {
      /* swallow migration errors */
    }

    // KG-G: relationships 加 inferred 字段（标记是否由二次 pass 推断的）
    try {
      const relCols = this.db
        .prepare("PRAGMA table_info(relationships)")
        .all() as Array<{ name: string }>;
      if (!relCols.some((c) => c.name === "inferred")) {
        this.db.exec("ALTER TABLE relationships ADD COLUMN inferred INTEGER DEFAULT 0");
      }
    } catch {
      /* swallow migration errors */
    }

    // P7: pipeline_logs 加 outcome_score（pipeline 整体效果分），user_feedback 加 pipeline_id
    try {
      const plCols = this.db.prepare("PRAGMA table_info(pipeline_logs)").all() as Array<{ name: string }>;
      if (!plCols.some((c) => c.name === "outcome_score")) {
        this.db.exec("ALTER TABLE pipeline_logs ADD COLUMN outcome_score REAL DEFAULT NULL");
      }
      const ufCols = this.db.prepare("PRAGMA table_info(user_feedback)").all() as Array<{ name: string }>;
      if (!ufCols.some((c) => c.name === "pipeline_id")) {
        this.db.exec("ALTER TABLE user_feedback ADD COLUMN pipeline_id TEXT");
      }
    } catch {
      /* swallow migration errors */
    }

    // P8: prompt_eval_suggestions 表（自评结果，待人工 review）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_eval_suggestions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        scope TEXT NOT NULL,
        problem TEXT NOT NULL,
        proposed_change TEXT NOT NULL,
        evidence TEXT,
        confidence REAL DEFAULT 0.5,
        status TEXT DEFAULT 'pending'
      );
    `);

    // P2-fix: memory_events 早期写入没有带 source_window_id，召回时不该被当作"当前
    // 窗口的历史"。给所有 NULL / 空串的存量记录回填 sentinel "__legacy__"，召回路径
    // 默认排除它。新写入永远带真实 windowId（auto-capture / action-executor 已修）。
    try {
      this.db
        .prepare(
          "UPDATE memory_events SET source_window_id = '__legacy__' " +
          "WHERE source_window_id IS NULL OR source_window_id = ''"
        )
        .run();
      this.db.exec(
        "CREATE INDEX IF NOT EXISTS idx_memory_events_window ON memory_events(source_window_id, timestamp DESC)"
      );
    } catch {
      /* swallow migration errors */
    }
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
    try { stages = JSON.parse(row.stages); } catch { /* ignore */ }
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
      } catch { /* ignore */ }
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
      const rel = relationByPipe.get(row.id);
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

    // 用 pipeline_logs 补 app/window 上下文（一次批量 LEFT JOIN 风格，避免 N+1）
    const pipelineIds = Array.from(new Set(flat.map((f) => f.pipelineId).filter(Boolean))) as string[];
    if (pipelineIds.length) {
      const placeholders = pipelineIds.map(() => "?").join(",");
      const ctxRows = this.db
        .prepare(`SELECT id, app_name, window_title FROM pipeline_logs WHERE id IN (${placeholders})`)
        .all(...pipelineIds) as Array<{ id: string; app_name: string; window_title: string }>;
      const ctxMap = new Map(ctxRows.map((c) => [c.id, c]));
      for (const f of flat) {
        if (f.pipelineId) {
          const c = ctxMap.get(f.pipelineId);
          if (c) {
            f.appName = c.app_name;
            f.windowTitle = c.window_title;
          }
        }
      }
    }

    return flat.slice(0, limit);
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
   * KG-D: 用户主权——删除一个 entity 及其所有 relation。
   * 不删 memory_events（事件级历史保留），但事件 entity_ids JSON 里的引用会失效（无关紧要）。
   */
  deleteEntity(entityId: string): { ok: boolean; relationsDeleted: number } {
    const r1 = this.db.prepare("DELETE FROM relationships WHERE source_id = ? OR target_id = ?").run(entityId, entityId);
    const r2 = this.db.prepare("DELETE FROM entities WHERE id = ?").run(entityId);
    return { ok: Number(r2.changes ?? 0) > 0, relationsDeleted: Number(r1.changes ?? 0) };
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
    try {
      this.db.prepare("UPDATE entities SET importance = ? WHERE id = ?").run(importance, id);
    } catch { /* swallow */ }
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
      try {
        this.upsertRelation({
          source: entityName,
          target: activityEntityName,
          relation: "plays_role_in",
          context: `近 ${sinceDays} 天共现 ${hits} 次`
        });
        relations += 1;
      } catch { /* swallow */ }
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
      try {
        const id = this.upsertEntity({
          name: patternName,
          type: "behavior_pattern",
          description: desc,
          attributes: { dow, hourBucket: hour, hits, relatedEntity: entityName, generatedAt: Date.now() }
        });
        // importance=8 让它在 getUserContext 加权排序里靠前
        this.db.prepare("UPDATE entities SET importance = ? WHERE id = ?").run(8, id);
        patterns += 1;
      } catch { /* swallow */ }
    }
    return { patterns };
  }

  /**
   * 取最近 N 条 memory_events，用于 H10 聚合摘要。
   * 默认排除 source_window_id = '__legacy__' 的存量脏数据，避免污染聚合。
   */
  getRecentEvents(limit = 50, opts: { includeLegacy?: boolean } = {}) {
    const includeLegacy = opts.includeLegacy ?? false;
    const sql = includeLegacy
      ? `SELECT id, timestamp, app_name as appName, window_title as windowTitle,
                content, summary, intent, importance, source_window_id as sourceWindowId
           FROM memory_events
           ORDER BY timestamp DESC
           LIMIT ?`
      : `SELECT id, timestamp, app_name as appName, window_title as windowTitle,
                content, summary, intent, importance, source_window_id as sourceWindowId
           FROM memory_events
           WHERE source_window_id != '__legacy__'
           ORDER BY timestamp DESC
           LIMIT ?`;
    return this.db.prepare(sql).all(limit) as Array<{
      id: string;
      timestamp: number;
      appName: string;
      windowTitle: string;
      content: string;
      summary: string;
      intent: string;
      importance: number;
      sourceWindowId: string;
    }>;
  }

  /**
   * 按 source_window_id 拉最近 events，给 prompt-engine 召回当前窗口历史用。
   * 永远排除 __legacy__。空字符串 windowId 直接返回空（防误用）。
   */
  getRecentEventsByWindow(windowId: string, limit = 20) {
    if (!windowId || windowId === "__legacy__") return [];
    return this.db
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
  }

  private id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  upsertEntity(entity: ExtractedEntity) {
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
    this.db
      .prepare(
        `INSERT INTO relationships (id,source_id,target_id,relation,context,valid_from)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(source_id,target_id,relation) DO UPDATE SET
          context=excluded.context,
          strength=MIN(10, relationships.strength + 1),
          updated_at=strftime('%s','now')`
      )
      .run(id, source.id, target.id, relation.relation, relation.context ?? "", Date.now());
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
  }) {
    const id = this.id("evt");
    this.db
      .prepare(
        `INSERT INTO memory_events (id,timestamp,app_name,window_title,content,summary,intent,entity_ids,source_window_id)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        id,
        Date.now(),
        payload.appName,
        payload.windowTitle,
        payload.content,
        payload.summary ?? "",
        payload.intent ?? "",
        JSON.stringify(payload.entityIds ?? []),
        payload.sourceWindowId ?? ""
      );
    return id;
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
      try {
        const attrs = JSON.parse(r.attributes || "{}") as { confidence?: unknown };
        if (typeof attrs.confidence === "number") confidence = Math.max(0, Math.min(1, attrs.confidence));
      } catch { /* ignore */ }
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
      try {
        const a = JSON.parse(existing.attributes || "{}") as { confidence?: number };
        if (typeof a.confidence === "number") oldConf = a.confidence;
      } catch { /* ignore */ }
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
    const needle = all ? "" : `%${keyword}%`;
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
              WHERE name LIKE ? OR type LIKE ? OR description LIKE ?
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
    return this.db.prepare("SELECT * FROM memory_events ORDER BY timestamp DESC LIMIT ?").all(limit);
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
    return this.db
      .prepare(
        `SELECT * FROM memory_events
         WHERE entity_ids LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(needle, limit);
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

  clearAll() {
    this.db.exec(
      "DELETE FROM entities; DELETE FROM relationships; DELETE FROM memory_events; DELETE FROM pipeline_logs; DELETE FROM business_logs; DELETE FROM system_logs;"
    );
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

  getSystemLogs(limit = 200) {
    return this.db.prepare("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  /** Close the database connection - should be called on app quit */
  close() {
    this.db.close();
  }
}
