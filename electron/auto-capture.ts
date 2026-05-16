import { OCREngine } from "./ocr-engine.js";
import { ScreenshotManager } from "./screenshot.js";
import { WindowManager, isOvoApp } from "./window-manager.js";
import { EventProcessor } from "./event-processor.js";
import { scheduler } from "./scheduler.js";
import { errorLogger } from "./error-logger.js";
import { sessionTracker } from "./session-tracker.js";
import { extractStructured } from "./ocr-extractor.js";
import { redactSensitive } from "./sensitive-filter.js";
import { preferencesStore } from "./preferences-store.js";
import { FrameChangeDetector } from "./frame-change.js";

const SCHEDULER_TASK_ID = "auto-capture";

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

export type CaptureSnapshotListener = (data: CaptureSnapshot) => void;

export class AutoCaptureService {
  private started = false;
  private backgroundMonitoring = false;
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
  // P1-C: 帧间变化检测——内容没变就跳过 OCR
  private frameChange = new FrameChangeDetector();

  private readonly onCaptureListeners: CaptureSnapshotListener[];

  constructor(
    private readonly windowManager: WindowManager,
    private readonly screenshotManager: ScreenshotManager,
    private readonly ocrEngine: OCREngine,
    private readonly eventProcessor: EventProcessor,
    onCapture: CaptureSnapshotListener | CaptureSnapshotListener[]
  ) {
    this.onCaptureListeners = Array.isArray(onCapture) ? onCapture : [onCapture];
  }

  setInterval(seconds: number) {
    this.config.intervalSeconds = Math.max(1, seconds);
    if (this.started) {
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

  setBackgroundMonitoring(enabled: boolean) {
    this.backgroundMonitoring = !!enabled;
  }

  isBackgroundMonitoring() {
    return this.backgroundMonitoring;
  }

  getHistory() {
    return this.history;
  }

  getLastCaptureAt() {
    return this.lastCaptureAt;
  }

  /**
   * 清掉所有 in-memory 截图/OCR 缓存：
   *   - event-processor 的窗口 OCR buffer
   *   - 自身近 100 条 snapshot 历史
   *   - sessionTracker 5 分钟轨迹
   *   - 每窗口 capture stats（成功率、最近时间）
   * 不动 KG / 持久化日志，纯重置当前一轮的"看到了什么"。
   */
  clearAllCaches() {
    try { this.eventProcessor.clearAllBuffers(); } catch { /* ignore */ }
    try { sessionTracker.clear(); } catch { /* ignore */ }
    this.history = [];
    this.windowCaptureStats.clear();
    this.frameChange.clear();
    this.lastCaptureAt = 0;
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
    if (this.started) return;
    this.started = true;
    // 启动时清空旧 buffer 避免上次留存的 ovo 自身 OCR 残留
    try { this.eventProcessor.clearAllBuffers(); } catch { /* ignore */ }
    scheduler.register({
      id: SCHEDULER_TASK_ID,
      intervalMs: this.config.intervalSeconds * 1000,
      task: async () => {
        await this.captureOnce();
      },
      onError: (error) => {
        errorLogger.alert("warn", "auto-capture", "捕获任务异常", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    scheduler.unregister(SCHEDULER_TASK_ID);
  }

  isStarted() {
    return this.started;
  }

  /**
   * 按窗口独立采集：用 desktopCapturer 一次拿所有窗口的 PNG，
   * 然后只对活动窗口（+ 用户开启后台监控时的监控窗口）单独跑 OCR。
   * 这样每个窗口 buffer 里塞的就是它自己的真实截图文本，不再相互污染。
   */
  async captureOnce() {
    // T3: 暂停中 → 直接跳过，不截不 OCR
    const prefs = preferencesStore.get();
    if (prefs.pausedUntil && Date.now() < prefs.pausedUntil) {
      return null;
    }
    const blacklist = new Set((prefs.blacklistedApps ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));

    const monitoredKeySet = new Set(this.config.monitoredWindowKeys);

    // 1) 拉所有窗口截图（一次 getSources 调用）；ovo / Electron 自身已被 getWindowCaptures 过滤
    let captures: Awaited<ReturnType<WindowManager["getWindowCaptures"]>>;
    try {
      captures = await this.windowManager.getWindowCaptures();
    } catch {
      // 屏幕录制权限缺失或 desktopCapturer 异常 —— 直接跳过本轮，**不再 fallback 整屏**
      // （fallback 整屏会把 ovo console 抓进来污染 buffer）
      return null;
    }
    if (captures.length === 0) return null;

    // T2: 应用黑名单——黑名单里的 app 直接从 captures 中剔除
    if (blacklist.size > 0) {
      captures = captures.filter((c) => !blacklist.has((c.appName ?? "").trim().toLowerCase()));
    }
    if (captures.length === 0) return null;

    // 2) 决定哪些窗口要 OCR：始终 OCR 活动窗口；backgroundMonitoring=true 时再 OCR 监控列表里的窗口。
    const targets: Array<{
      cap: (typeof captures)[number];
      source: "active" | "monitored";
    }> = [];
    // active 判定（P2-fix 精确化）：
    //   1) isActive 命中 desktopCapturer source —— 最可靠
    //   2) 没命中时检查 osascript 报告的前台是不是 ovo 自己：
    //      - 是 ovo：跳过本轮，**不要** fallback 到 captures[0]
    //        （之前的 fallback 会把 z-order 第一名的 App 误当成前台，
    //         比如剪贴板浮窗、系统弹窗，是"看 Twitter 弹 Claude Code"的元凶之一）
    //      - 不是 ovo：osascript 与 desktopCapturer 命名不一致（如 unicode dash），
    //        captures[0] 作为兜底仍合理
    let active = captures.find((c) => c.isActive);
    if (!active) {
      const frontmost = this.windowManager.lastFrontmostApp;
      if (isOvoApp(frontmost)) {
        // ovo 自己在前台，本轮不分析任何窗口（避免给浮窗/剪贴板等误判成 active）。
        // backgroundMonitoring=true 时仍可走监控分支，但 active 一定为空。
        active = undefined;
      } else if (captures.length > 0) {
        // 真前台是某个非 ovo 应用，但 desktopCapturer 命名错位 —— 用 z-order 兜底
        active = captures[0];
      }
    }
    if (active) {
      targets.push({ cap: active, source: "active" });
    } else if (!this.backgroundMonitoring) {
      return null;
    }
    if (this.backgroundMonitoring) {
      // 监控匹配放宽：windowId 严格匹配优先；失败时按 appName 子串匹配，
      // 避免 osascript 与 desktopCapturer 给的 windowTitle 不一致永不命中。
      const monitoredAppLower = new Set(
        Array.from(monitoredKeySet).map((k) => {
          // k 形如 "AppName::Title" 或纯 windowId（也是 "AppName::Title" 的 toId 后形式）
          const beforeSep = k.split("::")[0] ?? k;
          return beforeSep.replace(/_/g, " ").trim().toLowerCase();
        })
      );
      for (const cap of captures) {
        if (active && cap.sourceId === active.sourceId) continue;
        const strict =
          monitoredKeySet.has(cap.windowId) ||
          monitoredKeySet.has(`${cap.windowId}::${cap.appName}`);
        const fuzzy = monitoredAppLower.has(cap.appName.trim().toLowerCase());
        if (strict || fuzzy) targets.push({ cap, source: "monitored" });
      }
    }
    if (targets.length === 0) return null;

    // 3) 每个 target 独立 OCR + 单独写入对应 buffer。
    const snapshots: (CaptureSnapshot | null)[] = [];
    for (const { cap, source } of targets) {
      // P1-C: 帧间变化检测——画面没变化就直接跳过 OCR（看视频/读静态文档场景巨省 CPU）
      if (!this.frameChange.hasChanged(cap.windowId, cap.image)) {
        this.recordStat(cap.windowId, true); // 算成功（已知最新内容），不算失败
        continue;
      }
      let text = "";
      let confidence = 0;
      try {
        // P1-A: 只对选定 target 编码 JPEG（远比 PNG 快），未被 OCR 的窗口零编码
        // Vision/Tesseract 都接受 JPEG buffer，OCR 质量与 PNG 等价
        const buffer = cap.image.toJPEG(85);
        const ocr = await this.ocrEngine.recognize(buffer);
        // T6: OCR 文本立刻脱敏——所有下游（KG / LLM / 业务日志）只看到擦掉的版本
        const redaction = redactSensitive(ocr.text);
        text = redaction.cleaned;
        confidence = ocr.confidence;
        if (redaction.hadAny) {
          // 仅记类型 + 数量到错误日志，不记原内容
          errorLogger.alert("info", "sensitive-filter", "脱敏命中", {
            windowId: cap.windowId,
            counts: redaction.redactionCounts
          });
        }
      } catch {
        this.recordStat(cap.windowId, false);
        snapshots.push(null);
        continue;
      }
      const snapshot: CaptureSnapshot = {
        timestamp: Date.now(),
        appName: cap.appName,
        windowId: cap.windowId,
        windowTitle: cap.windowTitle,
        text,
        confidence,
        captureSource: source
      };
      // P4: OCR 完成后立即抽结构化信号，跟原文一起入 buffer
      const structured = extractStructured(snapshot.text);
      this.eventProcessor.append(cap.windowId, cap.appName, cap.windowTitle, {
        timestamp: snapshot.timestamp,
        text: snapshot.text,
        confidence: snapshot.confidence,
        structured
      });
      // P2: 只有 active 窗口才进 session 轨迹（avoid 监控窗口噪音污染轨迹）
      if (source === "active") {
        sessionTracker.append({
          timestamp: snapshot.timestamp,
          windowId: cap.windowId,
          appName: cap.appName,
          windowTitle: cap.windowTitle,
          text: snapshot.text
        });
      }
      this.history.unshift(snapshot);
      this.history = this.history.slice(0, 100);
      this.lastCaptureAt = snapshot.timestamp;
      for (const listener of this.onCaptureListeners) {
        try { listener(snapshot); } catch { /* ignore */ }
      }
      this.recordStat(cap.windowId, true);
      snapshots.push(snapshot);
    }
    return snapshots.find((s) => s?.captureSource === "active") ?? snapshots.find(Boolean) ?? null;
  }


  async runHealthCheck(): Promise<CaptureHealthCheck> {
    const timestamp = Date.now();
    const sinceLastCaptureMs = this.lastCaptureAt > 0 ? timestamp - this.lastCaptureAt : -1;
    try {
      // 优先用 desktopCapturer：能拿到 sources 就证明屏幕录制权限可用、能截图。
      // active 名字优先取 osascript（精确）；osascript 失败再退化用第一个 source。
      let activeName = "";
      let activeTitle = "";
      try {
        const osActive = await this.windowManager.getActiveWindow();
        if (osActive) {
          activeName = osActive.appName;
          activeTitle = osActive.windowTitle;
        }
      } catch { /* 不阻断 */ }

      const captures = await this.windowManager.getWindowCaptures(640, 400);
      if (captures.length === 0) {
        return {
          ok: false,
          timestamp,
          mode: "real",
          sinceLastCaptureMs,
          error: "未发现可截图的窗口（屏幕录制权限可能未生效）"
        };
      }
      if (!activeName) {
        // osascript 失败 → 拿 desktopCapturer 第一个非 ovo 的 source
        activeName = captures[0].appName;
        activeTitle = captures[0].windowTitle;
      }

      // 用第一个非 ovo 的 source 直接 OCR，避免再次整屏 + 防 ovo 自污染
      const target = captures.find((c) => c.isActive) ?? captures[0];
      const ocr = await this.ocrEngine.recognize(target.image.toJPEG(85));
      return {
        ok: true,
        timestamp,
        mode: "real",
        appName: activeName,
        windowTitle: activeTitle,
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
