import { AgentBridge } from "../electron/agent-bridge.js";

type Backend = "claude-code" | "openclaw" | "hermes" | "api";
type ResultStatus = "PASS" | "FAIL" | "SKIP";

interface SmokeResult {
  backend: Backend;
  status: ResultStatus;
  durationMs: number;
  detail: string;
}

const prompt =
  '请仅返回一个 JSON：{"intent":"smoke-test","prediction":"ok","actions":[],"suggestions":[],"content":[],"entities":[],"relationships":[]}';

async function run() {
  const bridge = new AgentBridge();

  const apiBaseUrl = process.env.OVO_API_BASE_URL;
  const apiKey = process.env.OVO_API_KEY;
  const apiModel = process.env.OVO_API_MODEL;
  if (apiBaseUrl && apiKey && apiModel) {
    bridge.setApiConfig({ baseUrl: apiBaseUrl, key: apiKey, model: apiModel });
  }

  const available = await bridge.detectAvailableBackends();
  const all: Backend[] = ["claude-code", "openclaw", "hermes", "api"];
  const results: SmokeResult[] = [];

  for (const backend of all) {
    const shouldSkip =
      backend === "api"
        ? !available.includes("api")
        : !available.includes(backend);
    if (shouldSkip) {
      results.push({
        backend,
        status: "SKIP",
        durationMs: 0,
        detail:
          backend === "api"
            ? "未配置 OVO_API_BASE_URL / OVO_API_KEY / OVO_API_MODEL"
            : "CLI 不可用（which 未找到）"
      });
      continue;
    }

    const started = Date.now();
    try {
      bridge.setPreferredBackend(backend);
      const response = await bridge.call({ prompt, outputFormat: "json", timeout: 60_000 });
      if (!response.ok) {
        results.push({
          backend,
          status: "FAIL",
          durationMs: Date.now() - started,
          detail: response.error ?? "调用失败"
        });
        continue;
      }
      results.push({
        backend,
        status: "PASS",
        durationMs: Date.now() - started,
        detail: response.parsed ? "返回可解析 JSON" : "返回文本（非 JSON）"
      });
    } catch (error) {
      results.push({
        backend,
        status: "FAIL",
        durationMs: Date.now() - started,
        detail: error instanceof Error ? error.message : "未知错误"
      });
    }
  }

  const pass = results.filter((result) => result.status === "PASS").length;
  const fail = results.filter((result) => result.status === "FAIL").length;
  const skip = results.filter((result) => result.status === "SKIP").length;

  console.log("=== ovo Agent Smoke Test ===");
  for (const result of results) {
    console.log(
      `[${result.status}] ${result.backend.padEnd(11)} ${String(result.durationMs).padStart(5)}ms  ${result.detail}`
    );
  }
  console.log(`Summary => PASS: ${pass}, FAIL: ${fail}, SKIP: ${skip}`);

  if (fail > 0) {
    process.exitCode = 1;
  }
}

void run();
