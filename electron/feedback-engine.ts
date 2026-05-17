import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { safeExecute } from "./safe-execute.js";

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
    // CODE-6: 走 KG 公开方法 insertFeedback，不再反射拿私有 db 字段
    const id = this.kg.insertFeedback(payload);
    // P7: 反馈进来后立刻重算关联 pipeline 的 outcome_score
    if (payload.pipelineId) {
      safeExecute(
        () => this.kg.computeAndStoreOutcomeScore(payload.pipelineId!),
        "feedback.compute-outcome",
        0,
        "warn"
      );
    }
    return id;
  }
}
