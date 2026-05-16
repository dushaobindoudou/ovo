import { execa } from "execa";
import type { AgentBackend, AgentResponse } from "./types.js";
import {
  buildJsonRepairPrompt,
  normalizeAgentPayload,
  shouldAttemptSchemaRepair
} from "./agent-response-normalize.js";
import { getExpandedPath } from "./path-helpers.js";
import { errorLogger } from "./error-logger.js";

function execEnv() {
  return { ...process.env, PATH: getExpandedPath() };
}

/**
 * 即便 hermes -Q 也保不齐进来 ANSI / 盒线 / 盲文装饰字符。
 * 1) 去 ANSI escape；
 * 2) 去常见盒线、盲文图案、装饰指示符（╭╮╰╯─│⠀⢀⣀⣿⣦… 全 unicode 块）；
 * 3) 去掉 Resume / Session 这种尾巴元信息。
 */
function stripCliNoise(text: string): string {
  if (!text) return text;
  // ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/\[[0-?]*[ -/]*[@-~]/g, "");
  // 盒线 + 盲文图章 + 装饰区段
  out = out.replace(/[─-╿⠀-⣿]/g, "");
  // 把 banner 的多余空白行收敛
  out = out
    .split("\n")
    .map((line) => line.replace(/[│|╭╮╰╯]+/g, "").trimEnd())
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
  // 砍掉 hermes 的 session 尾巴
  out = out.replace(/\n*Resume this session with:[\s\S]*$/m, "");
  out = out.replace(/\n*Session:\s*\d+_[a-z0-9_]+[\s\S]*$/m, "");
  return out.trim();
}

interface AgentRequest {
  prompt: string;
  outputFormat?: "text" | "json";
  timeout?: number;
}

export class AgentBridge {
  private available: AgentBackend[] = [];
  private preferred: AgentBackend | null = null;
  private apiConfig: { baseUrl: string; key: string; model: string } | null = null;
  private callCount = 0;
  private failureCount = 0;
  private lastCallAt = 0;
  private lastDurationMs = 0;
  private lastError: string | null = null;

  async detectAvailableBackends() {
    const checks: Array<{ backend: AgentBackend; cmd: string }> = [
      { backend: "claude-code", cmd: "claude" },
      { backend: "openclaw", cmd: "openclaw" },
      { backend: "hermes", cmd: "hermes" }
    ];
    const available: AgentBackend[] = [];
    const env = execEnv();
    for (const check of checks) {
      try {
        await execa("which", [check.cmd], { env });
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
      current: this.preferred ?? this.available[0] ?? null,
      callCount: this.callCount,
      failureCount: this.failureCount,
      lastCallAt: this.lastCallAt,
      lastDurationMs: this.lastDurationMs,
      lastError: this.lastError,
      expandedPath: getExpandedPath()
    };
  }

  private pickBackend(): AgentBackend {
    if (this.preferred && this.available.includes(this.preferred)) return this.preferred;
    if (this.available.length > 0) return this.available[0];
    if (this.apiConfig) return "api";
    throw new Error("没有可用的 Agent 后端");
  }

  /** 按优先级返回所有可用 backend，调用失败时按顺序 fallback。 */
  private candidateBackends(): AgentBackend[] {
    const order: AgentBackend[] = [];
    if (this.preferred && this.available.includes(this.preferred)) order.push(this.preferred);
    for (const b of this.available) if (!order.includes(b)) order.push(b);
    if (this.apiConfig && !order.includes("api")) order.push("api");
    return order;
  }

  async call(request: AgentRequest): Promise<AgentResponse> {
    const candidates = this.candidateBackends();
    if (candidates.length === 0) {
      this.lastError = "没有可用的 Agent 后端";
      return { ok: false, backend: "claude-code", duration: 0, raw: "", error: this.lastError };
    }
    const start = Date.now();
    let lastErr: unknown = null;
    let lastBackend: AgentBackend = candidates[0];
    const triedNotes: string[] = [];
    for (const backend of candidates) {
      lastBackend = backend;
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
        const duration = Date.now() - start;
        this.callCount += 1;
        this.lastCallAt = Date.now();
        this.lastDurationMs = duration;
        this.lastError = null;
        if (triedNotes.length > 0) meta.notes.push(...triedNotes);
        return {
          ok: true,
          backend,
          duration,
          raw,
          parsed,
          schemaMeta: meta
        };
      } catch (error) {
        lastErr = error;
        const msg = error instanceof Error ? error.message : String(error);
        const shortMsg = msg.slice(0, 240);
        triedNotes.push(`${backend} 调用失败: ${shortMsg}`);
        // 推到 UI 让用户看到正在 fallback
        try {
          errorLogger.alert("warn", "agent-bridge", `${backend} 调用失败，尝试 fallback`, {
            error: shortMsg
          });
        } catch { /* ignore */ }
        // 继续尝试下一个 backend
      }
    }
    // 所有 backend 都失败
    const duration = Date.now() - start;
    this.callCount += 1;
    this.failureCount += 1;
    this.lastCallAt = Date.now();
    this.lastDurationMs = duration;
    this.lastError = lastErr instanceof Error ? lastErr.message : "Agent 调用失败";
    return {
      ok: false,
      backend: lastBackend,
      duration,
      raw: "",
      error: `${this.lastError}（已尝试 ${candidates.join(", ")}）`
    };
  }

  private async callByBackend(backend: AgentBackend, request: AgentRequest) {
    const timeout = request.timeout ?? 30_000;
    const env = execEnv();
    if (backend === "claude-code") {
      const { stdout } = await execa("claude", ["-p", request.prompt, "--output-format", "json"], {
        timeout,
        env
      });
      return stdout;
    }
    if (backend === "openclaw") {
      const { stdout } = await execa(
        "openclaw",
        ["agent", "--non-interactive", "--message", request.prompt, "--format", "json"],
        { timeout, env }
      );
      return stdout;
    }
    if (backend === "hermes") {
      // -Q quiet 模式：抑制 banner/spinner/tool previews，只输出最终响应。
      // NO_COLOR / FORCE_COLOR=0 双保险关掉 ANSI。
      const { stdout } = await execa(
        "hermes",
        ["chat", "-q", request.prompt, "-Q"],
        { timeout, env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" } }
      );
      return stripCliNoise(stdout);
    }
    if (!this.apiConfig) throw new Error("API 后端未配置");
    // CODE-4: fetch 必须有超时；否则后端 hang 会一路卡死 scheduler → 全 pipeline 停摆。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${this.apiConfig.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiConfig.key}`
        },
        body: JSON.stringify({
          model: this.apiConfig.model,
          messages: [{ role: "user", content: request.prompt }]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }
      // LLM API 偶尔返回非 JSON（502/限流页面），不要让 JSON.parse 直接抛栈
      const raw = await response.text();
      let json: { choices?: Array<{ message?: { content?: string } }> } | null = null;
      try { json = JSON.parse(raw); } catch { /* not json */ }
      if (!json) return raw.slice(0, 4000);
      return json.choices?.[0]?.message?.content ?? JSON.stringify(json);
    } finally {
      clearTimeout(timer);
    }
  }
}
