/**
 * ipc/dev.ts —— dev:* IPC handler
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 仅 dev 模式（!app.isPackaged）开放——生产环境调用直接拒绝。
 * SEC-15 守卫：防止生产 build 被 XSS 后污染真实数据 + 消耗 LLM 配额。
 */
import { errorLogger } from "../error-logger.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerDevHandlers(deps: IpcHandlerDeps) {
  const { ipcMain, eventProcessor, kg, isDevMode, runAgentPipelineOnce, options } = deps;

  // 调试入口：注入 3 段假 OCR 后立即跑一次 agent-pipeline
  // 用户可以在不依赖屏幕录制权限的情况下立刻看到 KG / 建议 / 日志填充
  ipcMain.handle("dev:run-sample-pipeline", async () => {
    if (!isDevMode) {
      errorLogger.alert("warn", "dev.run-sample-pipeline.blocked", "生产环境拒绝执行 dev 入口");
      return { ok: false, error: "dev 入口仅 dev 模式开放" };
    }
    const FIXTURES = [
      {
        windowId: "sample_wechat",
        appName: "WeChat",
        windowTitle: "工作群 - 项目排期",
        text: "产品: 这周需求要发布吗？\n开发: 周三可以提测\n产品: 帮我把 Jira 状态改成 in-progress"
      },
      {
        windowId: "sample_chrome",
        appName: "Chrome",
        windowTitle: "React useEffect best practices",
        text: "useEffect 必须返回清理函数避免内存泄漏\n依赖数组留空只在首次渲染执行\n避免在 effect 里直接 setState 进入死循环"
      },
      {
        windowId: "sample_vscode",
        appName: "VSCode",
        windowTitle: "TS2345 error",
        text: "Type 'string | null' is not assignable to type 'string'\n建议使用 ?? 'unknown' 或可选链 userName?.toUpperCase()"
      }
    ];
    for (const f of FIXTURES) {
      eventProcessor.append(f.windowId, f.appName, f.windowTitle, {
        timestamp: Date.now(),
        text: f.text,
        confidence: 0.92
      });
    }
    options.logger?.info("dev:run-sample-pipeline", "注入 3 段假 OCR 并触发 pipeline", {
      windows: FIXTURES.length
    });
    const beforePipelines = kg.getStats().pipelines;
    const beforeEntities = kg.getStats().entities;
    await runAgentPipelineOnce();
    const afterPipelines = kg.getStats().pipelines;
    const afterEntities = kg.getStats().entities;
    return {
      ok: true,
      pipelinesAdded: afterPipelines - beforePipelines,
      entitiesAdded: afterEntities - beforeEntities
    };
  });
}
