import type { AgentSuggestion, AgentAction } from "./types.js";

export class SuggestionEngine {
  private queue: AgentSuggestion[] = [];

  ingest(suggestions: AgentSuggestion[]) {
    this.queue = [...suggestions, ...this.queue].slice(0, 100);
    return this.queue;
  }

  getAll() {
    return this.queue;
  }

  popTopActions(actions: AgentAction[]) {
    return [...actions].sort((a, b) => b.priority - a.priority);
  }
}
