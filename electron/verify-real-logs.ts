import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { WindowManager } from "./window-manager.js";
import { ScreenshotManager } from "./screenshot.js";
import { OCREngine } from "./ocr-engine.js";
import { EventProcessor } from "./event-processor.js";
import { AgentBridge } from "./agent-bridge.js";
import { SuggestionEngine } from "./suggestion-engine.js";
import { ActionExecutor } from "./action-executor.js";
import { PersonalityAnalyzer } from "./personality-analyzer.js";
import { PipelineLogger } from "./pipeline-logger.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { buildIntentPrompt } from "./prompt-engine.js";
import { SystemLogger } from "./system-logger.js";

function getScenarioCount() {
  return Number(process.env.OVO_REAL_LOG_SCENARIOS || 30);
}

function shouldAssumeCaptured() {
  return process.env.OVO_REAL_LOG_ASSUME_CAPTURED === "1";
}

function getDailyScenarios() {
  return [
    "早上查看天气并确认是否带伞",
    "通勤路上回复同事工作消息",
    "在公司日历里安排下午会议",
    "整理今天待办事项并标注优先级",
    "搜索午餐外卖并比较配送时间",
    "在文档中撰写项目周报摘要",
    "核对银行账单与本月预算",
    "给家人发送今晚回家时间",
    "预约周末牙科复诊时间",
    "查看快递物流并确认收货地址",
    "整理相册并备份重要照片",
    "在地图里规划下班回家路线",
    "订购生活用品并核对优惠券",
    "在学习平台完成一节课程",
    "记录今天运动数据和体重",
    "更新简历并保存最新版本",
    "查看股票基金并记录波动原因",
    "准备明天会议发言提纲",
    "在社交平台回复朋友留言",
    "预约洗车并设置提醒时间",
    "管理邮箱，把重要邮件归档",
    "整理桌面文件并清理下载目录",
    "查询航班动态并确认登机时间",
    "在记账应用补录今日消费",
    "查看电费水费账单并准备缴费",
    "创建购物清单并按品类分组",
    "阅读新闻并收藏行业资讯",
    "在代码仓库处理一个 review 意见",
    "给团队同步今日进展和风险",
    "睡前设置闹钟并关闭勿扰模式"
  ];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type BizStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

function startBiz(
  kg: KnowledgeGraphEngine,
  pipelineId: string,
  node: string,
  input?: unknown
) {
  return kg.addBusinessLog({
    pipelineId,
    node,
    status: "running",
    input,
    startTime: Date.now()
  });
}

function finishBiz(
  kg: KnowledgeGraphEngine,
  id: string,
  status: BizStatus,
  payload?: { output?: unknown; error?: string; meta?: Record<string, unknown> }
) {
  kg.updateBusinessLog(id, {
    status,
    output: payload?.output,
    error: payload?.error,
    meta: payload?.meta,
    endTime: Date.now()
  });
}

async function emitRendererLogs(systemLogger: SystemLogger, index: number) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  systemLogger.captureWindowLogs(win, `verify-${index}`);
  await win.loadURL("data:text/html,<html><body>verify</body></html>");
  await win.webContents.executeJavaScript(`
    console.info("verify renderer info #${index}");
    console.warn("verify renderer warn #${index}");
    console.error("verify renderer error #${index}");
  `);
  win.destroy();
}

export async function runVerifyRealLogs() {
  const scenarioCount = getScenarioCount();
  const assumeCaptured = shouldAssumeCaptured();
  const dailyScenarios = getDailyScenarios();
  const kg = new KnowledgeGraphEngine();
  const systemLogger = new SystemLogger(kg);
  const windowManager = new WindowManager();
  const screenshotManager = new ScreenshotManager();
  const ocrEngine = new OCREngine();
  const eventProcessor = new EventProcessor();
  const agentBridge = new AgentBridge();
  const suggestionEngine = new SuggestionEngine();
  const actionExecutor = new ActionExecutor(agentBridge);
  const personalityAnalyzer = new PersonalityAnalyzer(kg);
  const pipelineLogger = new PipelineLogger(kg);

  kg.clearAll();

  systemLogger.info("verify-real-logs", "启动 30 次真实场景验证", {
    scenarioCount,
    assumeCaptured
  });

  const available = await agentBridge.detectAvailableBackends();
  const preferred = available.includes("claude-code")
    ? "claude-code"
    : available.includes("hermes")
      ? "hermes"
      : available.includes("openclaw")
        ? "openclaw"
        : null;
  assert(preferred, "未检测到可用 Agent 后端，无法做真实全链路验证");
  agentBridge.setPreferredBackend(preferred);
  systemLogger.info("verify-real-logs", "选择 Agent 后端", {
    preferred,
    available
  });

  const scenarioResults: Array<{ index: number; pipelineId: string; ok: boolean; error?: string }> = [];

  for (let i = 1; i <= scenarioCount; i += 1) {
    const pipeline = pipelineLogger.startPipeline();
    try {
      await emitRendererLogs(systemLogger, i);

      const active =
        (await windowManager.getActiveWindow()) ??
        (assumeCaptured
          ? {
              windowId: "assumed_window",
              appName: "Assumed Capture",
              windowTitle: "Daily Scenario Input",
              isActive: true
            }
          : null);
      assert(active, `第 ${i} 轮未获取到活动窗口`);
      const scenarioText = dailyScenarios[(i - 1) % dailyScenarios.length] ?? `日常场景 ${i}`;

      const captureBiz = startBiz(kg, pipeline.id, "capture.screenshot", {
        appName: active.appName,
        windowTitle: active.windowTitle,
        assumed: assumeCaptured
      });
      let ocr: { confidence: number; text: string };
      if (assumeCaptured) {
        finishBiz(kg, captureBiz, "success", {
          output: {
            bytes: 0,
            assumed: true
          }
        });
        const ocrBiz = startBiz(kg, pipeline.id, "ocr.recognize", {
          imageBytes: 0,
          assumed: true
        });
        ocr = {
          confidence: 99,
          text: `${scenarioText}\n模拟轮次: ${i}`
        };
        finishBiz(kg, ocrBiz, "success", {
          output: {
            confidence: ocr.confidence,
            textLength: ocr.text.length,
            assumed: true,
            scenario: scenarioText
          }
        });
      } else {
        const image = await screenshotManager.captureScreen();
        finishBiz(kg, captureBiz, "success", {
          output: {
            bytes: image.byteLength
          }
        });

        const ocrBiz = startBiz(kg, pipeline.id, "ocr.recognize", {
          imageBytes: image.byteLength
        });
        ocr = await ocrEngine.recognize(image);
        finishBiz(kg, ocrBiz, "success", {
          output: {
            confidence: ocr.confidence,
            textLength: ocr.text.length
          }
        });
      }

      eventProcessor.append(active.windowId, active.appName, active.windowTitle, {
        timestamp: Date.now(),
        text: ocr.text,
        confidence: ocr.confidence
      });
      const drained = eventProcessor.drainBuffers();
      assert(drained.length > 0, `第 ${i} 轮未产生聚合数据`);

      pipelineLogger.updateStage(pipeline.id, "aggregate", {
        status: "success",
        startTime: Date.now(),
        duration: 0,
        data: {
          windows: drained.length,
          entries: drained.reduce((acc, item) => acc + item.entries.length, 0)
        }
      });

      const promptBiz = startBiz(kg, pipeline.id, "intent.prompt.build", {
        windows: drained.length
      });
      const prompt = buildIntentPrompt(drained, kg.getRelevantContext(), personalityAnalyzer.analyze().summary);
      finishBiz(kg, promptBiz, "success", {
        output: {
          promptLength: prompt.length
        }
      });

      const predictBiz = startBiz(kg, pipeline.id, "intent.predict", {
        promptLength: prompt.length
      });
      const response = await agentBridge.call({
        prompt,
        outputFormat: "json",
        timeout: 60_000
      });
      if (!response.ok || !response.parsed) {
        finishBiz(kg, predictBiz, "failed", {
          error: response.error ?? "解析失败",
          output: {
            backend: response.backend
          }
        });
        throw new Error(`第 ${i} 轮 Agent 失败: ${response.error ?? "parsed empty"}`);
      }
      finishBiz(kg, predictBiz, "success", {
        output: {
          backend: response.backend,
          intent: response.parsed.intent,
          prediction: response.parsed.prediction
        }
      });

      const schemaBiz = startBiz(kg, pipeline.id, "intent.schema", {
        rawLength: response.raw.length
      });
      finishBiz(kg, schemaBiz, response.schemaMeta?.degraded ? "skipped" : "success", {
        output: response.schemaMeta ?? {}
      });

      const suggestionBiz = startBiz(kg, pipeline.id, "suggestions.generate", {
        inputCount: response.parsed.suggestions.length
      });
      const suggestions = suggestionEngine.ingest(response.parsed.suggestions);
      finishBiz(kg, suggestionBiz, "success", {
        output: {
          queueSize: suggestions.length
        }
      });

      const actionBiz = startBiz(kg, pipeline.id, "actions.execute", {
        total: response.parsed.actions.length
      });
      const actionResults = await actionExecutor.executeBatch(response.parsed.actions);
      finishBiz(kg, actionBiz, "success", {
        output: actionResults
      });

      const graphBiz = startBiz(kg, pipeline.id, "graph.update", {
        entities: response.parsed.entities.length,
        relationships: response.parsed.relationships.length
      });
      const entityIds = response.parsed.entities.map((entity) => kg.upsertEntity(entity));
      response.parsed.relationships.forEach((relation) => {
        kg.upsertRelation(relation);
      });
      kg.addEvent({
        appName: drained[0].appName,
        windowTitle: drained[0].windowTitle,
        content: drained.flatMap((item) => item.entries.map((entry) => entry.text)).join("\n"),
        summary: response.parsed.prediction,
        intent: response.parsed.intent,
        sourceWindowId: drained[0].windowId,
        entityIds
      });
      finishBiz(kg, graphBiz, "success", {
        output: {
          entityIds: entityIds.length
        }
      });

      pipelineLogger.complete(pipeline.id, "completed");
      scenarioResults.push({
        index: i,
        pipelineId: pipeline.id,
        ok: true
      });
      systemLogger.info("verify-real-logs", "单轮通过", {
        index: i,
        pipelineId: pipeline.id
      });
    } catch (error) {
      pipelineLogger.complete(pipeline.id, "failed");
      const message = error instanceof Error ? error.message : "unknown error";
      scenarioResults.push({
        index: i,
        pipelineId: pipeline.id,
        ok: false,
        error: message
      });
      systemLogger.error("verify-real-logs", "单轮失败", {
        index: i,
        pipelineId: pipeline.id,
        error: message
      });
    }
  }

  const requiredNodes = [
    "capture.screenshot",
    "ocr.recognize",
    "intent.prompt.build",
    "intent.predict",
    "intent.schema",
    "suggestions.generate",
    "actions.execute",
    "graph.update"
  ];
  const allBiz = kg.getBusinessLogs(scenarioCount * 30);
  const allSys = kg.getSystemLogs(3000);
  const successScenarios = scenarioResults.filter((x) => x.ok);
  const failedScenarios = scenarioResults.filter((x) => !x.ok);

  const missingByPipeline: Array<{ pipelineId: string; missing: string[] }> = [];
  for (const s of successScenarios) {
    const logs = allBiz.filter((row: any) => row.pipeline_id === s.pipelineId);
    const nodes = new Set(logs.map((row: any) => String(row.node)));
    const missing = requiredNodes.filter((node) => !nodes.has(node));
    if (missing.length > 0) {
      missingByPipeline.push({
        pipelineId: s.pipelineId,
        missing
      });
    }
  }

  const summary = {
    total: scenarioCount,
    success: successScenarios.length,
    failed: failedScenarios.length,
    failedScenarios,
    missingByPipeline,
    businessLogCount: allBiz.length,
    systemLogCount: allSys.length,
    requiredNodes
  };

  console.log("=== 30次真实场景验证结果 ===");
  console.log(JSON.stringify(summary, null, 2));
  const reportPath = path.join(process.cwd(), "scripts", "verify-real30-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`report: ${reportPath}`);

  const ok =
    failedScenarios.length === 0 &&
    missingByPipeline.length === 0 &&
    allSys.length > 0 &&
    allBiz.length > 0;
  if (!ok) {
    throw new Error("真实场景验证未通过，请查看 summary");
  }

  await ocrEngine.terminate();
}

