import { OCREngine } from "./ocr-engine.js";
import { ScreenshotManager } from "./screenshot.js";
import { WindowManager } from "./window-manager.js";
import { EventProcessor } from "./event-processor.js";

export interface CaptureConfig {
  intervalSeconds: number;
  monitoredWindowKeys: string[];
  simulationMode: boolean;
}

export interface CaptureSnapshot {
  timestamp: number;
  appName: string;
  windowId: string;
  windowTitle: string;
  text: string;
  confidence: number;
}

export interface CaptureHealthCheck {
  ok: boolean;
  timestamp: number;
  mode: "simulation" | "real";
  appName?: string;
  windowTitle?: string;
  confidence?: number;
  textLength?: number;
  sinceLastCaptureMs: number;
  error?: string;
}

export class AutoCaptureService {
  private timer: NodeJS.Timeout | null = null;
  private config: CaptureConfig = {
    intervalSeconds: 5,
    monitoredWindowKeys: [],
    simulationMode: process.env.OVO_SIMULATE_CAPTURE === "1"
  };
  private history: CaptureSnapshot[] = [];
  private lastCaptureAt = 0;

  constructor(
    private readonly windowManager: WindowManager,
    private readonly screenshotManager: ScreenshotManager,
    private readonly ocrEngine: OCREngine,
    private readonly eventProcessor: EventProcessor,
    private readonly onCapture: (data: CaptureSnapshot) => void
  ) {
    this.setSimulationMode(this.config.simulationMode);
  }

  setInterval(seconds: number) {
    this.config.intervalSeconds = Math.max(1, seconds);
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  setMonitoredWindowKeys(keys: string[]) {
    this.config.monitoredWindowKeys = keys;
  }

  getMonitoredWindowKeys() {
    return this.config.monitoredWindowKeys;
  }

  setSimulationMode(enabled: boolean) {
    this.config.simulationMode = enabled;
    this.windowManager.setSimulation(enabled);
    this.screenshotManager.setSimulation(enabled);
  }

  getSimulationMode() {
    return this.config.simulationMode;
  }

  getHistory() {
    return this.history;
  }

  getLastCaptureAt() {
    return this.lastCaptureAt;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.captureOnce();
    }, this.config.intervalSeconds * 1000);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async captureOnce() {
    const active = await this.windowManager.getActiveWindow();
    if (!active) return null;
    const timestamp = Date.now();
    let text = "";
    let confidence = 0;
    if (this.config.simulationMode) {
      text = `【模拟】${active.appName} ${active.windowTitle} @ ${new Date(timestamp).toLocaleTimeString()} - 用户正在处理任务。`;
      confidence = 99;
    } else {
      try {
        const image = await this.screenshotManager.captureScreen();
        const ocr = await this.ocrEngine.recognize(image);
        text = ocr.text;
        confidence = ocr.confidence;
      } catch {
        // 没有屏幕录制权限时自动降级到模拟，避免主流程中断。
        this.setSimulationMode(true);
        text = `【自动降级模拟】${active.appName} ${active.windowTitle} - 捕获权限不可用。`;
        confidence = 98;
      }
    }
    const snapshot: CaptureSnapshot = {
      timestamp,
      appName: active.appName,
      windowId: active.windowId,
      windowTitle: active.windowTitle,
      text,
      confidence
    };
    this.eventProcessor.append(active.windowId, active.appName, active.windowTitle, {
      timestamp: snapshot.timestamp,
      text: snapshot.text,
      confidence: snapshot.confidence
    });
    this.history.unshift(snapshot);
    this.history = this.history.slice(0, 100);
    this.lastCaptureAt = snapshot.timestamp;
    this.onCapture(snapshot);
    return snapshot;
  }

  async runHealthCheck(): Promise<CaptureHealthCheck> {
    const timestamp = Date.now();
    const sinceLastCaptureMs = this.lastCaptureAt > 0 ? timestamp - this.lastCaptureAt : -1;
    try {
      const active = await this.windowManager.getActiveWindow();
      if (!active) {
        return {
          ok: false,
          timestamp,
          mode: this.config.simulationMode ? "simulation" : "real",
          sinceLastCaptureMs,
          error: "未获取到活动窗口"
        };
      }

      if (this.config.simulationMode) {
        return {
          ok: true,
          timestamp,
          mode: "simulation",
          appName: active.appName,
          windowTitle: active.windowTitle,
          confidence: 99,
          textLength: 16,
          sinceLastCaptureMs
        };
      }

      const image = await this.screenshotManager.captureScreen();
      const ocr = await this.ocrEngine.recognize(image);
      return {
        ok: true,
        timestamp,
        mode: "real",
        appName: active.appName,
        windowTitle: active.windowTitle,
        confidence: ocr.confidence,
        textLength: ocr.text.length,
        sinceLastCaptureMs
      };
    } catch (error) {
      return {
        ok: false,
        timestamp,
        mode: this.config.simulationMode ? "simulation" : "real",
        sinceLastCaptureMs,
        error: error instanceof Error ? error.message : "自检失败"
      };
    }
  }
}
