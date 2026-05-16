import { KnowledgeGraphEngine } from "./knowledge-graph.js";

export class FeedbackEngine {
  constructor(private readonly kg: KnowledgeGraphEngine) {}

  submitSuggestionFeedback(payload: {
    suggestionId: string;
    suggestionType: string;
    action: "accepted" | "rejected" | "ignored";
    personalityContext?: string;
    appContext?: string;
    intentType?: string;
    pipelineId?: string;
  }) {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = (this.kg as unknown as { db?: unknown }).db;
    if (!db) return id;
    (
      db as {
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
      }
    )
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
    // P7: 反馈进来后立刻重算关联 pipeline 的 outcome_score
    if (payload.pipelineId) {
      try {
        (this.kg as unknown as { computeAndStoreOutcomeScore: (id: string) => number })
          .computeAndStoreOutcomeScore(payload.pipelineId);
      } catch { /* ignore */ }
    }
    return id;
  }
}
