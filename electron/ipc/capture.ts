/**
 * ipc/capture.ts —— capture:* + windows:* + health:* IPC handler
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 控制自动捕获、窗口监控、自检健康——3 个紧耦合的域合并在一起。
 */
import { scheduler } from "../scheduler.js";
import { errorLogger } from "../error-logger.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerCaptureHandlers(deps: IpcHandlerDeps) {
  const {
    ipcMain,
    autoCaptureService,
    windowManager,
    screenshotManager,
    healthConfig,
    setLatestHealth,
    getLatestHealth,
    broadcast,
    startBizNode,
    finishBizNode,
    logSystem,
    setAgentIntervalSeconds,
    getAgentIntervalSeconds
  } = deps;

  // windows
  ipcMain.handle("windows:get-all", async () => windowManager.getAllWindows());
  ipcMain.handle("windows:get-active", async () => windowManager.getActiveWindow());
  ipcMain.handle("windows:set-monitored", (_event, windowKeys: string[]) => {
    autoCaptureService.setMonitoredWindowKeys(windowKeys);
    return { ok: true };
  });
  ipcMain.handle("windows:get-monitored", () => autoCaptureService.getMonitoredWindowKeys());
  ipcMain.handle("windows:get-capture-stats", () => autoCaptureService.getWindowCaptureStats());
  ipcMain.handle("windows:get-thumbnails", async () => windowManager.getWindowThumbnails());

  // capture
  ipcMain.handle("capture:start", (_event, payload?: { intervalSeconds?: number }) => {
    logSystem("info", "capture", "启动自动捕获", { intervalSeconds: payload?.intervalSeconds });
    if (payload?.intervalSeconds) autoCaptureService.setInterval(payload.intervalSeconds);
    autoCaptureService.start();
    return { ok: true };
  });
  ipcMain.handle("capture:stop", () => {
    logSystem("info", "capture", "停止自动捕获");
    autoCaptureService.stop();
    return { ok: true };
  });
  ipcMain.handle("capture:set-interval", (_event, seconds: number) => {
    autoCaptureService.setInterval(seconds);
    return { ok: true };
  });
  ipcMain.handle("capture:set-bg-monitoring", (_event, enabled: boolean) => {
    autoCaptureService.setBackgroundMonitoring(!!enabled);
    logSystem("info", "capture", "后台监控开关", { enabled: !!enabled });
    return { ok: true, enabled: !!enabled };
  });
  ipcMain.handle("capture:get-bg-monitoring", () => autoCaptureService.isBackgroundMonitoring());
  ipcMain.handle("capture:set-agent-interval", (_event, seconds: number) => {
    const safeSeconds = Math.max(3, Math.min(600, Math.floor(Number(seconds) || 15)));
    setAgentIntervalSeconds(safeSeconds);
    scheduler.setInterval("agent-pipeline", safeSeconds * 1000);
    logSystem("info", "capture", "Agent 调用间隔已更新", { seconds: safeSeconds });
    return { ok: true, seconds: safeSeconds };
  });
  ipcMain.handle("capture:get-agent-interval", () => getAgentIntervalSeconds());
  ipcMain.handle("capture:get-buffers", () => deps.eventProcessor.getBuffers());
  ipcMain.handle("capture:clear-cache", () => {
    autoCaptureService.clearAllCaches();
    return { ok: true, clearedAt: Date.now() };
  });
  ipcMain.handle("capture:take-screenshot", async () => {
    const bizLogId = startBizNode(null, "capture.manual", { source: "console.screenshot-test" });
    try {
      const image = await screenshotManager.captureScreen();
      const result = {
        dataUrl: `data:image/png;base64,${image.toString("base64")}`,
        mimeType: "image/png",
        byteLength: image.byteLength,
        capturedAt: Date.now()
      };
      finishBizNode(bizLogId, "success", {
        output: { byteLength: result.byteLength, mimeType: result.mimeType }
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "截图失败";
      finishBizNode(bizLogId, "failed", { error: message });
      logSystem("error", "capture", "手动截图失败", { error: message });
      throw error;
    }
  });

  // health
  ipcMain.handle("health:get-latest", () => getLatestHealth());
  ipcMain.handle("health:get-config", () => healthConfig);
  ipcMain.handle("health:set-config", (_event, payload: { enabled?: boolean; intervalSeconds?: number }) => {
    if (typeof payload.enabled === "boolean") healthConfig.enabled = payload.enabled;
    if (typeof payload.intervalSeconds === "number") {
      healthConfig.intervalSeconds = Math.max(10, Math.floor(payload.intervalSeconds));
      scheduler.setInterval("health-check", healthConfig.intervalSeconds * 1000);
    }
    if (!healthConfig.enabled) {
      scheduler.unregister("health-check");
    } else if (!scheduler.has("health-check")) {
      scheduler.register({
        id: "health-check",
        intervalMs: healthConfig.intervalSeconds * 1000,
        task: async () => {
          if (!healthConfig.enabled) return;
          const report = await autoCaptureService.runHealthCheck();
          setLatestHealth(report);
          broadcast("health:update", report);
        },
        onError: (error) => {
          errorLogger.alert("warn", "health-check", "自检任务异常", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    }
    return { ok: true, config: healthConfig };
  });
}
