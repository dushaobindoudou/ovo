/**
 * 3 场景端到端日志测试
 *
 * 从 OCR 结果后开始，模拟真实用户场景，调用真实 LLM，验证完整日志输出
 *
 * 使用方式:
 *   # 方式1: 使用 Claude Code CLI (需要安装)
 *   pnpm test:e2e:scenarios
 *
 *   # 方式2: 使用 API (需要设置环境变量)
 *   OVO_API_BASE_URL=https://api.anthropic.com \
 *   OVO_API_KEY=sk-... \
 *   OVO_API_MODEL=claude-sonnet-4-20250514 \
 *   pnpm test:e2e:scenarios
 */
import path from "node:path";
import { KnowledgeGraphEngine } from "../electron/knowledge-graph.js";
import { Logger } from "../electron/logger.js";
import { EventProcessor } from "../electron/event-processor.js";
import { buildIntentPrompt } from "../electron/prompt-engine.js";
import { AgentBridge } from "../electron/agent-bridge.js";
import { SuggestionEngine } from "../electron/suggestion-engine.js";
import { ActionExecutor } from "../electron/action-executor.js";

// 模拟 3 个用户常见场景
const SCENARIOS = [
  {
    id: 1,
    name: "微信工作群讨论",
    appName: "WeChat",
    windowTitle: "项目排期 - 工作群",
    ocrText: `产品: 这个需求这周能完成吗？
开发: 预计周三可以提测
产品: 好的，记得更新 Jira 状态
开发: 没问题，今天下午更新`
  },
  {
    id: 2,
    name: "浏览器搜索技术文档",
    appName: "Chrome",
    windowTitle: "React useEffect best practices - Google 搜索",
    ocrText: `搜索: React useEffect best practices

结果 1: useEffect 的正确使用方式 - React 官方文档
useEffect(fn) - 每次渲染后执行
useEffect(fn, []) - 仅首次渲染执行
useEffect(fn, [a, b]) - 当 a 或 b 变化时执行

结果 2: 避免常见陷阱
- 永远不要在 effect 中更新组件状态导致无限循环
- 记得在 effect 中返回清理函数`
  },
  {
    id: 3,
    name: "IDE 代码错误",
    appName: "VSCode",
    windowTitle: "src/components/App.tsx - TypeScript Error",
    ocrText: `错误 (TS2345): Type 'string | null' is not assignable to type 'string'.
  --> src/components/App.tsx:42:15
     | const name: string
     | const userName: string | null

建议: 使用可选链或空值合并
  userName ?? 'unknown'
  userName?.toUpperCase()`
  }
];

async function runScenario(
  scenario: (typeof SCENARIOS)[0],
  kg: KnowledgeGraphEngine,
  logger: Logger,
  eventProcessor: EventProcessor,
  agentBridge: AgentBridge,
  suggestionEngine: SuggestionEngine,
  actionExecutor: ActionExecutor
) {
  const pipelineId = `pipe_${Date.now()}_${scenario.id}`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`场景 ${scenario.id}: ${scenario.name}`);
  console.log(`应用: ${scenario.appName}`);
  console.log("=".repeat(60));

  // ========== 阶段 1: 模拟 OCR 结果并缓冲 ==========
  const ocrStart = Date.now();
  logger.info("test:scenario", `场景 ${scenario.id} 开始: ${scenario.name}`, {
    appName: scenario.appName,
    textLength: scenario.ocrText.length
  });

  // 添加到事件处理器
  eventProcessor.append(
    `window_${scenario.id}`,
    scenario.appName,
    scenario.windowTitle,
    {
      timestamp: Date.now(),
      text: scenario.ocrText,
      confidence: 0.95
    }
  );

  const drained = eventProcessor.drainBuffers();
  console.log(`[1/6] OCR 缓冲: ${drained.length} 窗口, ${drained[0]?.entries.length} 条记录`);

  logger.logBusiness({
    timestamp: ocrStart,
    pipelineId,
    stage: "ocr.result",
    status: "success",
    input: { appName: scenario.appName, textLength: scenario.ocrText.length },
    output: { windowCount: drained.length, entryCount: drained[0]?.entries.length ?? 0 },
    durationMs: Date.now() - ocrStart
  });

  // ========== 阶段 2: 构建 Prompt ==========
  const promptStart = Date.now();
  const graphContext = kg.getRelevantContext();
  const personality = "技术爱好者，喜欢学习新技术，注重代码质量";

  const prompt = buildIntentPrompt(drained, graphContext, personality);
  console.log(`[2/6] Prompt 构建: ${prompt.length} 字符`);

  logger.logBusiness({
    timestamp: promptStart,
    pipelineId,
    stage: "prompt.build",
    status: "success",
    input: {
      windows: drained.map(w => ({ windowId: w.windowId, appName: w.appName, entries: w.entries.length })),
      graphEntities: graphContext.relevantEntities.length,
      personalityLength: personality.length
    },
    output: { promptLength: prompt.length },
    durationMs: Date.now() - promptStart
  });

  // ========== 阶段 3: 调用 LLM ==========
  const agentStart = Date.now();
  console.log(`[3/6] LLM 调用中...`);

  const response = await agentBridge.call({
    prompt,
    outputFormat: "json",
    timeout: 60_000
  });

  if (!response.ok || !response.parsed) {
    console.error(`[3/6] LLM 调用失败: ${response.error}`);

    logger.logBusiness({
      timestamp: agentStart,
      pipelineId,
      stage: "agent.call",
      status: "failed",
      input: { promptLength: prompt.length, backend: response.backend },
      output: { error: response.error },
      durationMs: Date.now() - agentStart,
      error: response.error
    });

    logger.error("test:scenario", `场景 ${scenario.id} LLM 调用失败`, { error: response.error });
    return;
  }

  console.log(`[3/6] LLM 响应: intent="${response.parsed.intent}", actions=${response.parsed.actions.length}, suggestions=${response.parsed.suggestions.length}`);

  logger.logBusiness({
    timestamp: agentStart,
    pipelineId,
    stage: "agent.call",
    status: "success",
    input: { promptLength: prompt.length, backend: response.backend },
    output: {
      intent: response.parsed.intent,
      prediction: response.parsed.prediction,
      actionsCount: response.parsed.actions.length,
      suggestionsCount: response.parsed.suggestions.length,
      entitiesCount: response.parsed.entities.length,
      relationshipsCount: response.parsed.relationships.length,
      schemaMeta: response.schemaMeta
    },
    durationMs: Date.now() - agentStart
  });

  // ========== 阶段 4: 建议生成 ==========
  const suggestStart = Date.now();
  const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
  console.log(`[4/6] 建议生成: ${suggestions.length} 条建议`);

  logger.logBusiness({
    timestamp: suggestStart,
    pipelineId,
    stage: "suggestions.generate",
    status: "success",
    input: { parsedSuggestions: response.parsed.suggestions },
    output: {
      queueSize: suggestions.length,
      suggestions: suggestions.map(s => ({ type: s.type, title: s.title }))
    },
    durationMs: Date.now() - suggestStart
  });

  // ========== 阶段 5: 动作执行 ==========
  const actionStart = Date.now();
  console.log(`[5/6] 动作执行: ${response.parsed.actions.length} 个动作`);

  const actionResults = await actionExecutor.executeBatch(response.parsed.actions);
  const successCount = actionResults.filter(r => r.status === "success").length;

  console.log(`[5/6] 动作完成: ${successCount}/${actionResults.length} 成功`);

  logger.logBusiness({
    timestamp: actionStart,
    pipelineId,
    stage: "actions.execute",
    status: "success",
    input: { actions: response.parsed.actions.map(a => ({ id: a.id, description: a.description })) },
    output: {
      results: actionResults.map(r => ({ actionId: r.actionId, status: r.status, duration: r.duration }))
    },
    durationMs: Date.now() - actionStart
  });

  // ========== 阶段 6: 知识图谱更新 ==========
  const graphStart = Date.now();

  const entityIds = response.parsed.entities.map(entity => kg.upsertEntity(entity));
  response.parsed.relationships.forEach(relation => {
    kg.upsertRelation(relation);
  });

  kg.addEvent({
    appName: scenario.appName,
    windowTitle: scenario.windowTitle,
    content: scenario.ocrText,
    summary: response.parsed.prediction,
    intent: response.parsed.intent,
    sourceWindowId: `window_${scenario.id}`,
    entityIds
  });

  console.log(`[6/6] 图谱更新: ${entityIds.length} 实体, ${response.parsed.relationships.length} 关系`);

  logger.logBusiness({
    timestamp: graphStart,
    pipelineId,
    stage: "graph.update",
    status: "success",
    input: {
      entities: response.parsed.entities,
      relationships: response.parsed.relationships
    },
    output: { entityIds, eventId: `evt_${Date.now()}` },
    durationMs: Date.now() - graphStart
  });

  // 场景完成
  logger.info("test:scenario", `场景 ${scenario.id} 完成: ${scenario.name}`, {
    pipelineId,
    totalDurationMs: Date.now() - ocrStart
  });

  console.log(`\n✅ 场景 ${scenario.id} 完成! 总耗时: ${Date.now() - ocrStart}ms`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("OVO 3 场景端到端日志测试");
  console.log("从 OCR 结果后开始，模拟真实用户场景，验证日志输出");
  console.log("=".repeat(60));

  // 设置测试数据目录
  const testDataDir = path.join(process.cwd(), "test-data");

  // 初始化组件
  const kg = new KnowledgeGraphEngine(testDataDir);
  const logger = new Logger({ logDir: testDataDir, kg });
  const eventProcessor = new EventProcessor();
  const agentBridge = new AgentBridge();
  const suggestionEngine = new SuggestionEngine();
  const actionExecutor = new ActionExecutor(agentBridge);

  // 配置 API
  const apiBaseUrl = process.env.OVO_API_BASE_URL;
  const apiKey = process.env.OVO_API_KEY;
  const apiModel = process.env.OVO_API_MODEL;

  if (apiBaseUrl && apiKey && apiModel) {
    agentBridge.setApiConfig({ baseUrl: apiBaseUrl, key: apiKey, model: apiModel });
    console.log("使用 API 模式");
  } else {
    // 尝试检测可用的后端
    const available = await agentBridge.detectAvailableBackends();
    console.log(`可用的后端: ${available.join(", ") || "无"}`);

    const preferred = available.includes("claude-code")
      ? "claude-code"
      : available.includes("hermes")
        ? "hermes"
        : available.includes("openclaw")
          ? "openclaw"
          : null;

    if (!preferred) {
      console.error("❌ 没有可用的 LLM 后端，请配置 API 密钥");
      console.log("\n配置方式:");
      console.log("  方式1: 设置环境变量");
      console.log("    export OVO_API_BASE_URL=https://api.anthropic.com");
      console.log("    export OVO_API_KEY=sk-...");
      console.log("    export OVO_API_MODEL=claude-sonnet-4-20250514");
      console.log("  方式2: 安装 Claude Code CLI");
      process.exit(1);
    }

    agentBridge.setPreferredBackend(preferred);
    console.log(`使用后端: ${preferred}`);
  }

  logger.info("test:e2e", "开始 3 场景测试", { scenarios: SCENARIOS.map(s => s.name) });

  // 清空之前的数据
  kg.clearAll();
  console.log("\n🗑️ 清空历史数据\n");

  // 执行 3 个场景
  for (const scenario of SCENARIOS) {
    await runScenario(scenario, kg, logger, eventProcessor, agentBridge, suggestionEngine, actionExecutor);
  }

  // 输出总结
  console.log("\n" + "=".repeat(60));
  console.log("测试完成!");
  console.log("=".repeat(60));

  // 读取日志文件
  const systemLogs = logger.readSystemLogs(20);
  const businessLogs = logger.readBusinessLogs(30);

  console.log(`\n📋 日志统计:`);
  console.log(`   系统日志: ${systemLogs.length} 条`);
  console.log(`   业务日志: ${businessLogs.length} 条`);

  console.log(`\n📁 日志文件位置:`);
  console.log(`   ${logger.getLogDir()}/system-${new Date().toISOString().split("T")[0]}.log`);
  console.log(`   ${logger.getLogDir()}/business-${new Date().toISOString().split("T")[0]}.jsonl`);

  console.log(`\n🔍 查看最近业务日志:`);
  console.log(`   tail -5 "${logger.getLogDir()}/business-${new Date().toISOString().split("T")[0]}.jsonl"`);

  // 输出统计信息
  const stats = kg.getStats();
  console.log(`\n📊 知识图谱统计:`);
  console.log(`   实体: ${stats.entities}`);
  console.log(`   关系: ${stats.relationships}`);
  console.log(`   事件: ${stats.events}`);
}

main().catch(err => {
  console.error("测试失败:", err);
  process.exit(1);
});
