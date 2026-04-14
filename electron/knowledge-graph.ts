import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import Database from "better-sqlite3";
import type { ExtractedEntity, ExtractedRelation } from "./types.js";
import type { GraphContext } from "./prompt-engine.js";

export class KnowledgeGraphEngine {
  private db: Database.Database;

  constructor() {
    const dataDir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "ovo.sqlite");
    this.db = new Database(dbPath);
    this.bootstrap();
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
    `);
  }

  private id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  upsertEntity(entity: ExtractedEntity) {
    const now = Date.now();
    const existed = this.db.prepare("SELECT id, mention_count FROM entities WHERE name = ?").get(entity.name) as
      | { id: string; mention_count: number }
      | undefined;
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
          JSON.stringify([]),
          now,
          now
        );
      return id;
    }
    this.db
      .prepare("UPDATE entities SET last_seen=?, mention_count=?, updated_at=strftime('%s','now') WHERE id=?")
      .run(now, existed.mention_count + 1, existed.id);
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

  getEvents(limit = 100) {
    return this.db.prepare("SELECT * FROM memory_events ORDER BY timestamp DESC LIMIT ?").all(limit);
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
    this.db.exec("DELETE FROM entities; DELETE FROM relationships; DELETE FROM memory_events; DELETE FROM pipeline_logs;");
  }

  savePipelineLog(id: string, duration: number, status: string, stages: unknown, overallRating?: string) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pipeline_logs (id,timestamp,duration,status,stages,overall_rating)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, Date.now(), duration, status, JSON.stringify(stages), overallRating ?? null);
  }

  getPipelines(limit = 50) {
    return this.db.prepare("SELECT * FROM pipeline_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  getPipelineById(id: string) {
    return this.db.prepare("SELECT * FROM pipeline_logs WHERE id = ?").get(id);
  }
}
