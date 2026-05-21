/**
 * kg/migrations.ts —— KG schema bootstrap + migration
 *
 * 拆自原 knowledge-graph.ts（BUG_REPORT A7 / REVIEW CODE-12）。
 *
 * 设计：
 *   - schema_version 表追踪当前版本（解决 A7）
 *   - 良性 migration 错误（"列已存在" / "duplicate column"）静默跳过；
 *     真错误调 errorLogger.alert("error", ...) — 不再 swallow (C9 修复)
 *   - 启动时延迟加载 error-logger 避免循环依赖
 */
import type Database from "better-sqlite3";

export const CURRENT_SCHEMA_VERSION = 4;  // v4: evidence_inflation；v3: drafts；v2: memory_events actor

/** 单条 migration 失败的统一处理：良性错误 swallow，真错误告警 */
function reportMigrationError(err: unknown, label: string) {
  const msg = err instanceof Error ? err.message : String(err);
  // "already exists" / "duplicate column" 类错误是良性的，不告警
  if (/already exists|duplicate column/i.test(msg)) return;
  // 延迟加载 errorLogger 避免循环依赖
  void import("../error-logger.js").then(({ errorLogger }) => {
    errorLogger.alert("error", "kg.migration", `KG schema 迁移失败 (${label})`, { error: msg });
  }).catch(() => { /* alert 本身失败不阻断启动 */ });
}

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as { version?: number } | undefined;
    return typeof row?.version === "number" ? row.version : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: Database.Database, v: number): void {
  db.prepare("INSERT OR REPLACE INTO schema_version (id, version, updated_at) VALUES (1, ?, ?)")
    .run(v, Date.now());
}

/**
 * KG bootstrap：建表 + 加列 + 索引 + schema_version 写入。
 * 必须幂等——重复运行无副作用。
 */
export function bootstrap(db: Database.Database): void {
  // schema_version 表本身先建（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // 老库（之前没有 schema_version 表）当作 v0，bootstrap 跑完后写入当前版本
  const startedFromVersion = getSchemaVersion(db);

  db.exec(`
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

  // user_feedback 加 intent_type 字段
  try {
    const cols = db.prepare("PRAGMA table_info(user_feedback)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "intent_type")) {
      db.exec("ALTER TABLE user_feedback ADD COLUMN intent_type TEXT");
    }
  } catch (err) {
    reportMigrationError(err, "user_feedback.intent_type");
  }

  // KG-B: entities 加 quality_score / pinned / last_referenced_at 三个字段
  try {
    const cols = db.prepare("PRAGMA table_info(entities)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("quality_score")) {
      db.exec("ALTER TABLE entities ADD COLUMN quality_score REAL DEFAULT 0.5");
    }
    if (!names.has("pinned")) {
      db.exec("ALTER TABLE entities ADD COLUMN pinned INTEGER DEFAULT 0");
    }
    if (!names.has("last_referenced_at")) {
      // 该 entity 最近一次出现在用户接受的 suggestion / offer 里的时间戳
      db.exec("ALTER TABLE entities ADD COLUMN last_referenced_at INTEGER DEFAULT 0");
    }
    // 索引：quality_score 倒序常用，pinned 用于 GC 保护
    db.exec("CREATE INDEX IF NOT EXISTS idx_entities_quality ON entities(quality_score DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_entities_pinned ON entities(pinned)");
  } catch (err) {
    reportMigrationError(err, "entities.quality_score+pinned+last_referenced_at");
  }

  // KG-G: relationships 加 inferred 字段（标记是否由二次 pass 推断的）
  try {
    const relCols = db.prepare("PRAGMA table_info(relationships)").all() as Array<{ name: string }>;
    if (!relCols.some((c) => c.name === "inferred")) {
      db.exec("ALTER TABLE relationships ADD COLUMN inferred INTEGER DEFAULT 0");
    }
  } catch (err) {
    reportMigrationError(err, "relationships.inferred");
  }

  // P7: pipeline_logs 加 outcome_score（pipeline 整体效果分），user_feedback 加 pipeline_id
  try {
    const plCols = db.prepare("PRAGMA table_info(pipeline_logs)").all() as Array<{ name: string }>;
    if (!plCols.some((c) => c.name === "outcome_score")) {
      db.exec("ALTER TABLE pipeline_logs ADD COLUMN outcome_score REAL DEFAULT NULL");
    }
    const ufCols = db.prepare("PRAGMA table_info(user_feedback)").all() as Array<{ name: string }>;
    if (!ufCols.some((c) => c.name === "pipeline_id")) {
      db.exec("ALTER TABLE user_feedback ADD COLUMN pipeline_id TEXT");
    }
  } catch (err) {
    reportMigrationError(err, "pipeline_logs.outcome_score+user_feedback.pipeline_id");
  }

  // P8: prompt_eval_suggestions 表（自评结果，待人工 review）
  db.exec(`
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

  // PHIL-1 / P0.4: negative_patterns 表 —— 玻璃管家"永远不要这样"按钮的落地点
  //   用户主动拒绝 + 给出理由 → 写一条 pattern → adaptive-prompt 注入硬约束给 LLM
  //   feedback-engine 读这张表给 action 评分降权
  db.exec(`
    CREATE TABLE IF NOT EXISTS negative_patterns (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      app_name TEXT,
      intent TEXT,
      action_type TEXT,
      pattern_text TEXT NOT NULL,
      context_signature TEXT,
      hit_count INTEGER DEFAULT 0,
      last_hit_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_negative_patterns_lookup
      ON negative_patterns(app_name, action_type, intent);
  `);

  // P2-fix: memory_events 早期写入没有带 source_window_id，召回时不该被当作"当前
  // 窗口的历史"。给所有 NULL / 空串的存量记录回填 sentinel "__legacy__"，召回路径
  // 默认排除它。新写入永远带真实 windowId（auto-capture / action-executor 已修）。
  try {
    db.prepare(
      "UPDATE memory_events SET source_window_id = '__legacy__' " +
      "WHERE source_window_id IS NULL OR source_window_id = ''"
    ).run();
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_memory_events_window ON memory_events(source_window_id, timestamp DESC)"
    );
  } catch (err) {
    reportMigrationError(err, "memory_events.source_window_id");
  }

  // v2 迁移：memory_events 加 5W 模型的 actor / actor_name（区分"我"做的 vs "别人"做的）
  try {
    const meCols = db.prepare("PRAGMA table_info(memory_events)").all() as Array<{ name: string }>;
    const meNames = new Set(meCols.map((c) => c.name));
    if (!meNames.has("actor")) {
      db.exec("ALTER TABLE memory_events ADD COLUMN actor TEXT DEFAULT 'unknown'");
    }
    if (!meNames.has("actor_name")) {
      db.exec("ALTER TABLE memory_events ADD COLUMN actor_name TEXT");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_memory_events_actor ON memory_events(actor, timestamp DESC)");
  } catch (err) {
    reportMigrationError(err, "memory_events.actor+actor_name");
  }

  // v3 迁移：drafts 表 —— inferred-unverified 级别 action 的"准备区"（反思 #2 草稿台）
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      pipeline_id TEXT,
      action_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      params TEXT NOT NULL,
      evidence_level TEXT NOT NULL,
      evidence TEXT NOT NULL,
      grounding_status TEXT NOT NULL,
      grounding_reason TEXT,
      app_name TEXT,
      window_title TEXT,
      status TEXT NOT NULL DEFAULT 'pending'  -- pending | promoted | dismissed | expired
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_status_created ON drafts(status, created_at DESC);
  `);

  // v4 迁移：evidence_inflation 表 —— 反向校准（反思 #2 / T8）
  //   用户反复弃用某 (app, intent, action_type) 的草稿 / 取消其 action 时 score += 1，
  //   合成 prompt 在该场景注入"请保守"软约束。score 读取时按时间衰减，自我纠正。
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_inflation (
      id TEXT PRIMARY KEY,
      app_name TEXT,
      action_type TEXT,
      intent TEXT,
      score REAL NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL,
      UNIQUE(app_name, action_type, intent)
    );
    CREATE INDEX IF NOT EXISTS idx_inflation_lookup
      ON evidence_inflation(app_name, action_type, intent);
  `);

  // T15 / C9 / A7: bootstrap 全部走完，写入当前 schema 版本号
  // 升级路径：CURRENT_SCHEMA_VERSION ++ 后，运维通过 SELECT version FROM schema_version 一眼看到当前版本
  try {
    if (startedFromVersion !== CURRENT_SCHEMA_VERSION) {
      void import("../error-logger.js").then(({ errorLogger }) => {
        errorLogger.alert(
          "info",
          "kg.migration",
          startedFromVersion === 0 ? "KG schema 初始化" : "KG schema 升级",
          { from: startedFromVersion, to: CURRENT_SCHEMA_VERSION }
        );
      }).catch(() => { /* */ });
      setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
    }
  } catch { /* schema_version 写入失败不阻断启动 */ }
}

/** 当前 schema 版本（用于诊断 / 设置面板显示） */
export function getSchemaVersionInfo(db: Database.Database): { current: number; expected: number } {
  return { current: getSchemaVersion(db), expected: CURRENT_SCHEMA_VERSION };
}
