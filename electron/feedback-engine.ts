import { KnowledgeGraphEngine } from "./knowledge-graph.js";

export class FeedbackEngine {
  constructor(private readonly kg: KnowledgeGraphEngine) {}

  submitSuggestionFeedback(payload: {
    suggestionId: string;
    suggestionType: string;
    action: "accepted" | "rejected" | "ignored";
    personalityContext?: string;
    appContext?: string;
  }) {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = (this.kg as unknown as { db?: unknown }).db;
    if (!db) return id;
    // 此处复用 KG 内部数据库，避免引入额外数据层。
    (
      db as {
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
      }
    )
      .prepare(
        `INSERT INTO user_feedback (id,suggestion_id,suggestion_type,action,personality_context,app_context,timestamp)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        id,
        payload.suggestionId,
        payload.suggestionType,
        payload.action,
        payload.personalityContext ?? "",
        payload.appContext ?? "",
        Date.now()
      );
    return id;
  }
}
