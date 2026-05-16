/**
 * 不依赖 Electron UI 的端到端模拟脚本。
 *
 * 思路：直接 new 后端的 service，按 ipc-handlers.ts 中 agent-pipeline 任务的执行
 * 顺序串起来，把 3 段假 OCR 灌进 EventProcessor，跑真实的 AgentBridge.call，
 * 写 KG / pipeline_logs / business_logs / suggestions，最终断言数据流通过。
 *
 * 用途：调试 UI 问题前，先在 CLI 验证主流程是否通；CI 必跑。
 *
 * 用法：pnpm test:flow
 *   - 优先用 PATH 中可见的 hermes / claude / claude-code
 *   - 否则需要 OVO_API_BASE_URL / OVO_API_KEY / OVO_API_MODEL
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KnowledgeGraphEngine } from "../electron/knowledge-graph.js";
import { Logger } from "../electron/logger.js";
import { EventProcessor } from "../electron/event-processor.js";
import { buildIntentPrompt } from "../electron/prompt-engine.js";
import { AgentBridge } from "../electron/agent-bridge.js";
import { SuggestionEngine } from "../electron/suggestion-engine.js";
import { ActionExecutor } from "../electron/action-executor.js";
import { PipelineLogger } from "../electron/pipeline-logger.js";

const FIXTURES = [
  {
    appName: "WeChat",
    windowTitle: "工作群 - 项目排期",
    text: `产品: 这周需求要发布吗？
开发: 周三可以提测
产品: 帮我把 Jira ticket 更新成 in-progress`
  },
  {
    appName: "Chrome",
    windowTitle: "React useEffect best practices",
    text: `useEffect 必须返回清理函数防止内存泄漏
依赖数组留空只在首次渲染执行
避免在 effect 中直接 setState 触发死循环`
  },
  {
    appName: "VSCode",
    windowTitle: "TS2345 error",
    text: `Type 'string | null' is not assignable to type 'string'
建议使用 ?? 'unknown' 或可选链 userName?.toUpperCase()`
  }
];

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ovo-sim-"));
  console.log(`[simulate] data dir: ${tmpDir}`);

  const kg = new KnowledgeGraphEngine(tmpDir);
  const logger = new Logger({ kg, logDir: tmpDir });
  const eventProcessor = new EventProcessor();
  const agentBridge = new AgentBridge();
  const suggestionEngine = new SuggestionEngine();
  const actionExecutor = new ActionExecutor(agentBridge);
  const pipelineLogger = new PipelineLogger(kg);

  const detected = await agentBridge.detectAvailableBackends();
  console.log(`[simulate] detected backends: ${detected.join(", ") || "(none)"}`);
  if (detected.length === 0 && !process.env.OVO_API_KEY) {
    console.error("[simulate] FAIL: 没有可用 Agent 后端且未配置 API。请装 hermes/claude 或设置 OVO_API_*");
    process.exit(2);
  }

  let suggestionsTotal = 0;
  let actionsTotal = 0;

  for (const fixture of FIXTURES) {
    const winId = `win_${fixture.appName}_${Date.now()}`;
    eventProcessor.append(winId, fixture.appName, fixture.windowTitle, {
      timestamp: Date.now(),
      text: fixture.text,
      confidence: 0.92
    });

    const drained = eventProcessor.drainBuffers();
    if (drained.length === 0) {
      console.warn(`[simulate] ${fixture.appName}: drain 空`);
      continue;
    }

    const pipeline = pipelineLogger.startPipeline();
    pipelineLogger.updateStage(pipeline.id, "aggregate", {
      status: "success",
      startTime: Date.now(),
      duration: 0,
      data: { windows: drained.length }
    });

    const prompt = buildIntentPrompt(drained, kg.getRelevantContext(), "技术驱动型用户");
    const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 60_000 });
    if (!response.ok || !response.parsed) {
      console.error(`[simulate] ${fixture.appName}: agent 调用失败 - ${response.error}`);
      pipelineLogger.updateStage(pipeline.id, "agent", {
        status: "failed",
        startTime: Date.now(),
        duration: response.duration,
        data: { error: response.error }
      });
      pipelineLogger.complete(pipeline.id, "failed");
      continue;
    }
    pipelineLogger.updateStage(pipeline.id, "agent", {
      status: "success",
      startTime: Date.now(),
      duration: response.duration,
      data: { backend: response.backend }
    });

    const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
    pipelineLogger.updateStage(pipeline.id, "suggestions", {
      status: "success",
      startTime: Date.now(),
      duration: 0,
      data: { count: suggestions.length }
    });
    suggestionsTotal += suggestions.length;

    const actionResults = await actionExecutor.executeBatch(response.parsed.actions);
    pipelineLogger.updateStage(pipeline.id, "actions", {
      status: "success",
      startTime: Date.now(),
      duration: 0,
      data: { actions: actionResults }
    });
    actionsTotal += actionResults.length;

    const entityIds = response.parsed.entities.map((entity) => kg.upsertEntity(entity));
    response.parsed.relationships.forEach((rel) => kg.upsertRelation(rel));
    kg.addEvent({
      appName: fixture.appName,
      windowTitle: fixture.windowTitle,
      content: fixture.text,
      summary: response.parsed.prediction,
      intent: response.parsed.intent,
      sourceWindowId: winId,
      entityIds
    });
    pipelineLogger.updateStage(pipeline.id, "graphUpdate", {
      status: "success",
      startTime: Date.now(),
      duration: 0,
      data: { entityCount: entityIds.length }
    });
    pipelineLogger.complete(pipeline.id, "completed");

    logger.info("simulate", `场景 ${fixture.appName} 完成`, {
      pipelineId: pipeline.id,
      entities: entityIds.length,
      suggestions: suggestions.length,
      actions: actionResults.length
    });
    console.log(`[simulate] ${fixture.appName}: backend=${response.backend} entities=${entityIds.length} suggestions=${suggestions.length} actions=${actionResults.length}`);
  }

  // 断言阶段
  const stats = kg.getStats();
  const pipelines = kg.getPipelines(50);
  const businessLogs = kg.getBusinessLogs(200);
  const systemLogs = kg.getSystemLogs(200);

  console.log("\n=== Assertions ===");
  console.log(`KG entities=${stats.entities} relationships=${stats.relationships} events=${stats.events} pipelines=${stats.pipelines}`);
  console.log(`pipeline_logs rows=${pipelines.length}`);
  console.log(`business_logs rows=${businessLogs.length}`);
  console.log(`system_logs rows=${systemLogs.length}`);
  console.log(`suggestions ingested total=${suggestionsTotal}`);
  console.log(`actions executed total=${actionsTotal}`);

  let fail = false;
  const requireMin = (label: string, actual: number, min: number) => {
    if (actual < min) { console.error(`FAIL: ${label} 期望 >= ${min}, 实际 ${actual}`); fail = true; }
  };
  requireMin("KG entities", stats.entities, 1);
  requireMin("pipeline_logs", pipelines.length, FIXTURES.length);
  requireMin("system_logs", systemLogs.length, FIXTURES.length);
  requireMin("suggestions ingested", suggestionsTotal, 1);

  kg.close();

  if (fail) {
    console.error("\n[simulate] FAIL");
    process.exit(1);
  }
  console.log("\n[simulate] PASS");
}

main().catch((error) => {
  console.error("[simulate] uncaught:", error);
  process.exit(1);
});
