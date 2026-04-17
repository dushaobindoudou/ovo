import { OCREngine } from "./ocr-engine.js";
import { ScreenshotManager } from "./screenshot.js";
import { WindowManager } from "./window-manager.js";
import { EventProcessor } from "./event-processor.js";
import type { WindowInfo } from "./types.js";

export interface CaptureConfig {
  intervalSeconds: number;
  monitoredWindowKeys: string[];
}

export interface CaptureSnapshot {
  timestamp: number;
  appName: string;
  windowId: string;
  windowTitle: string;
  text: string;
  confidence: number;
  /** 活动窗口主通道或用户勾选的后台监听通道 */
  captureSource?: "active" | "monitored";
}

export interface CaptureHealthCheck {
  ok: boolean;
  timestamp: number;
  mode: "real";
  appName?: string;
  windowTitle?: string;
  confidence?: number;
  textLength?: number;
  sinceLastCaptureMs: number;
  error?: string;
}

export interface WindowCaptureStatRow {
  windowId: string;
  appName: string;
  windowTitle: string;
  lastSuccessAt: number;
  attempts: number;
  failures: number;
  failureRate: number;
}

export class AutoCaptureService {
  private timer: NodeJS.Timeout | null = null;
  private config: CaptureConfig = {
    intervalSeconds: 5,
    monitoredWindowKeys: []
  };
  private history: CaptureSnapshot[] = [];
  private lastCaptureAt = 0;
  private windowCaptureStats = new Map<
    string,
    { lastSuccessAt: number; attempts: number; failures: number }
  >();

  constructor(
    private readonly windowManager: WindowManager,
    private readonly screenshotManager: ScreenshotManager,
    private readonly ocrEngine: OCREngine,
    private readonly eventProcessor: EventProcessor,
    private readonly onCapture: (data: CaptureSnapshot) => void
  ) {}

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

  getHistory() {
    return this.history;
  }

  getLastCaptureAt() {
    return this.lastCaptureAt;
  }

  private recordStat(windowId: string, ok: boolean) {
    const cur = this.windowCaptureStats.get(windowId) ?? {
      lastSuccessAt: 0,
      attempts: 0,
      failures: 0
    };
    cur.attempts += 1;
    if (ok) {
      cur.lastSuccessAt = Date.now();
    } else {
      cur.failures += 1;
    }
    this.windowCaptureStats.set(windowId, cur);

    // Cleanup old entries (not seen in more than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, stats] of this.windowCaptureStats) {
      if (stats.lastSuccessAt > 0 && stats.lastSuccessAt < oneHourAgo && key !== windowId) {
        this.windowCaptureStats.delete(key);
      }
    }
  }

  async getWindowCaptureStats(): Promise<WindowCaptureStatRow[]> {
    const byId = new Map<string, WindowCaptureStatRow>();
    for (const [windowId, s] of this.windowCaptureStats) {
      const snap = this.history.find((h) => h.windowId === windowId);
      byId.set(windowId, {
        windowId,
        appName: snap?.appName ?? "",
        windowTitle: snap?.windowTitle ?? "",
        lastSuccessAt: s.lastSuccessAt,
        attempts: s.attempts,
        failures: s.failures,
        failureRate: s.attempts === 0 ? 0 : s.failures / s.attempts
      });
    }
    for (const key of new Set(this.config.monitoredWindowKeys)) {
      const win = await this.windowManager.resolveMonitoredKey(key);
      if (!win || byId.has(win.windowId)) continue;
      byId.set(win.windowId, {
        windowId: win.windowId,
        appName: win.appName,
        windowTitle: win.windowTitle,
        lastSuccessAt: 0,
        attempts: 0,
        failures: 0,
        failureRate: 0
      });
    }
    return [...byId.values()];
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

  /**
   * 活动窗口 + 监听窗口并行采集：真实模式下整屏 OCR 只跑一次，结果按窗口打标写入各自 buffer。
   */
  async captureOnce() {
    const active = await this.windowManager.getActiveWindow();
    type Target = { win: WindowInfo; source: "active" | "monitored" };
    const targets: Target[] = [];
    if (active) targets.push({ win: active, source: "active" });
    const seen = new Set(targets.map((t) => t.win.windowId));
    for (const key of new Set(this.config.monitoredWindowKeys)) {
      const win = await this.windowManager.resolveMonitoredKey(key);
      if (!win || seen.has(win.windowId)) continue;
      seen.add(win.windowId);
      targets.push({ win, source: "monitored" });
    }
    if (targets.length === 0) return null;

    let sharedOcr: { text: string; confidence: number };
    try {
      const image = await this.screenshotManager.captureScreen();
      sharedOcr = await this.ocrEngine.recognize(image);
    } catch {
      for (const { win } of targets) {
        this.recordStat(win.windowId, false);
      }
      return null;
    }

    const snapshots = await Promise.all(
      targets.map(({ win, source }) => this.captureTarget(win, source, sharedOcr))
    );
    const primary = snapshots.find((s) => s?.captureSource === "active") ?? snapshots[0];
    return primary ?? null;
  }

  private async captureTarget(
    win: WindowInfo,
    source: "active" | "monitored",
    sharedOcr: { text: string; confidence: number }
  ): Promise<CaptureSnapshot | null> {
    const timestamp = Date.now();
    let text = "";
    let confidence = 0;
    try {
      const prefix =
        source === "active"
          ? ""
          : `[后台监听窗口: ${win.appName} | ${win.windowTitle}]\n`;
      text = `${prefix}${sharedOcr.text}`;
      confidence = sharedOcr.confidence;
    } catch {
      this.recordStat(win.windowId, false);
      return null;
    }

    const snapshot: CaptureSnapshot = {
      timestamp,
      appName: win.appName,
      windowId: win.windowId,
      windowTitle: win.windowTitle,
      text,
      confidence,
      captureSource: source
    };
    this.eventProcessor.append(win.windowId, win.appName, win.windowTitle, {
      timestamp: snapshot.timestamp,
      text: snapshot.text,
      confidence: snapshot.confidence
    });
    this.history.unshift(snapshot);
    this.history = this.history.slice(0, 100);
    this.lastCaptureAt = snapshot.timestamp;
    this.onCapture(snapshot);
    this.recordStat(win.windowId, true);
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
          mode: "real",
          sinceLastCaptureMs,
          error: "未获取到活动窗口"
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
        mode: "real",
        sinceLastCaptureMs,
        error: error instanceof Error ? error.message : "自检失败"
      };
    }
  }
}
