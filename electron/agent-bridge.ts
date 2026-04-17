import { execa } from "execa";
import type { AgentBackend, AgentResponse } from "./types.js";
import {
  buildJsonRepairPrompt,
  normalizeAgentPayload,
  shouldAttemptSchemaRepair
} from "./agent-response-normalize.js";

interface AgentRequest {
  prompt: string;
  outputFormat?: "text" | "json";
  timeout?: number;
}

export class AgentBridge {
  private available: AgentBackend[] = [];
  private preferred: AgentBackend | null = null;
  private apiConfig: { baseUrl: string; key: string; model: string } | null = null;

  async detectAvailableBackends() {
    const checks: Array<{ backend: AgentBackend; cmd: string }> = [
      { backend: "claude-code", cmd: "claude" },
      { backend: "openclaw", cmd: "openclaw" },
      { backend: "hermes", cmd: "hermes" }
    ];
    const available: AgentBackend[] = [];
    for (const check of checks) {
      try {
        await execa("which", [check.cmd]);
        available.push(check.backend);
      } catch {
        // no-op
      }
    }
    if (this.apiConfig) available.push("api");
    this.available = available;
    return available;
  }

  setPreferredBackend(backend: AgentBackend) {
    this.preferred = backend;
  }

  setApiConfig(config: { baseUrl: string; key: string; model: string }) {
    this.apiConfig = config;
  }

  getStatus() {
    return {
      availableBackends: this.available,
      current: this.preferred ?? this.available[0] ?? null
    };
  }

  private pickBackend(): AgentBackend {
    if (this.preferred && this.available.includes(this.preferred)) return this.preferred;
    if (this.available.length > 0) return this.available[0];
    if (this.apiConfig) return "api";
    throw new Error("没有可用的 Agent 后端");
  }

  async call(request: AgentRequest): Promise<AgentResponse> {
    const backend = this.pickBackend();
    const start = Date.now();
    try {
      const raw = await this.callByBackend(backend, request);
      let { parsed, meta } = normalizeAgentPayload(raw);
      if (shouldAttemptSchemaRepair(parsed, meta)) {
        try {
          const repairPrompt = buildJsonRepairPrompt(raw, meta.notes.join("; ") || "结构不完整");
          const raw2 = await this.callByBackend(backend, {
            ...request,
            prompt: repairPrompt,
            outputFormat: "json"
          });
          const second = normalizeAgentPayload(raw2);
          const secondOk =
            !second.meta.degraded &&
            (Boolean(second.parsed.prediction) ||
              second.parsed.suggestions.length > 0 ||
              second.parsed.actions.length > 0);
          if (secondOk) {
            parsed = second.parsed;
            meta = {
              repaired: true,
              degraded: second.meta.degraded,
              notes: [...meta.notes, "已执行二次 schema 修复重试", ...second.meta.notes]
            };
          }
        } catch {
          meta.notes.push("schema 修复重试调用失败");
        }
      }
      return {
        ok: true,
        backend,
        duration: Date.now() - start,
        raw,
        parsed,
        schemaMeta: meta
      };
    } catch (error) {
      return {
        ok: false,
        backend,
        duration: Date.now() - start,
        raw: "",
        error: error instanceof Error ? error.message : "Agent 调用失败"
      };
    }
  }

  private async callByBackend(backend: AgentBackend, request: AgentRequest) {
    const timeout = request.timeout ?? 30_000;
    if (backend === "claude-code") {
      const { stdout } = await execa("claude", ["-p", request.prompt, "--output-format", "json"], {
        timeout
      });
      return stdout;
    }
    if (backend === "openclaw") {
      const { stdout } = await execa(
        "openclaw",
        ["agent", "--non-interactive", "--message", request.prompt, "--format", "json"],
        { timeout }
      );
      return stdout;
    }
    if (backend === "hermes") {
      const { stdout } = await execa("hermes", ["chat", "-q", request.prompt], { timeout });
      return stdout;
    }
    if (!this.apiConfig) throw new Error("API 后端未配置");
    const response = await fetch(`${this.apiConfig.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiConfig.key}`
      },
      body: JSON.stringify({
        model: this.apiConfig.model,
        messages: [{ role: "user", content: request.prompt }]
      })
    });
    const json = await response.json();
    return json.choices?.[0]?.message?.content ?? JSON.stringify(json);
  }
}
