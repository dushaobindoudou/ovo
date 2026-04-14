import type { AgentAction } from "./types.js";
import { AgentBridge } from "./agent-bridge.js";
import { buildActionExecutionPrompt } from "./prompt-engine.js";

export interface ActionResult {
  actionId: string;
  status: "success" | "failed" | "cancelled" | "timeout" | "pending";
  output: string;
  duration: number;
  error?: string;
}

export class ActionExecutor {
  constructor(private readonly agentBridge: AgentBridge) {}

  async execute(action: AgentAction): Promise<ActionResult> {
    const started = Date.now();
    const response = await this.agentBridge.call({
      prompt: buildActionExecutionPrompt(action.description, action.params),
      outputFormat: "json",
      timeout: 60_000
    });
    if (!response.ok) {
      return {
        actionId: action.id,
        status: "failed",
        output: "",
        duration: Date.now() - started,
        error: response.error
      };
    }
    return {
      actionId: action.id,
      status: "success",
      output: response.raw,
      duration: Date.now() - started
    };
  }

  async executeBatch(actions: AgentAction[]): Promise<ActionResult[]> {
    const ordered = [...actions].sort((a, b) => b.priority - a.priority);
    const results: ActionResult[] = [];
    for (const action of ordered) {
      if (action.requireConfirm) {
        results.push({
          actionId: action.id,
          status: "pending",
          output: "等待用户确认",
          duration: 0
        });
        continue;
      }
      const result = await this.execute(action);
      results.push(result);
    }
    return results;
  }
}
