/**
 * 两层 OCR 引擎：
 *   主路径：macOS Vision Framework（@cherrystudio/mac-system-ocr）
 *     - GPU/NPU 加速，单图 30-150ms
 *     - 多语言：英文 / 简繁中 / 日韩 / 拉丁系
 *     - 仅 macOS 10.15+
 *   备份路径：Tesseract.js
 *     - WASM，所有平台可用，但慢且耗 CPU
 *     - 仅作为 Vision 失败时的兜底
 *
 * 共用 OCREngine 类提供 recognize(Buffer) 接口，auto-capture 不需要感知差异。
 * 用户可在设置里强制使用 tesseract（forceFallback=true）。
 */
import { createWorker, type Worker as TesseractWorker } from "tesseract.js";
import { errorLogger } from "./error-logger.js";

export interface OCRResult {
  text: string;
  /** 0-1 区间的整体置信度 */
  confidence: number;
  blocks: Array<{ text: string; confidence: number }>;
  /** 标注实际跑哪个引擎，方便调试和 metrics */
  engine: "vision" | "tesseract";
  /** OCR 用时（毫秒），用于性能监控 */
  durationMs: number;
}

interface MacOCRStatic {
  RECOGNITION_LEVEL_FAST: 0;
  RECOGNITION_LEVEL_ACCURATE: 1;
  recognizeFromBuffer(
    buffer: Buffer | Uint8Array,
    options?: {
      languages?: string;
      recognitionLevel?: 0 | 1;
      minConfidence?: number;
    }
  ): Promise<{
    text: string;
    confidence: number;
    observations: Array<{ text: string; confidence: number }>;
  }>;
}

// 5 分钟无调用就释放 tesseract worker（约 150MB 内存）
const TESSERACT_IDLE_RELEASE_MS = 5 * 60_000;

export class OCREngine {
  private visionModule: MacOCRStatic | null = null;
  private visionLoadFailed = false;
  private tesseractWorker: TesseractWorker | null = null;
  private tesseractInitializing: Promise<void> | null = null;
  private lastTesseractUsedAt = 0;
  private tesseractIdleTimer: NodeJS.Timeout | null = null;
  private forceFallback = false;

  /** 用户强制走 tesseract（设置项），跳过 vision */
  setForceFallback(value: boolean) {
    this.forceFallback = value;
  }

  async initialize() {
    // 先试 Vision；失败不阻断，调用时再 fallback
    if (process.platform === "darwin" && !this.forceFallback) {
      await this.tryLoadVision();
    }
  }

  private async tryLoadVision(): Promise<MacOCRStatic | null> {
    if (this.visionModule) return this.visionModule;
    if (this.visionLoadFailed) return null;
    try {
      // 用动态 import 避免在非 macOS 平台 build 时报错（@cherrystudio/mac-system-ocr 仅 darwin）
      const mod = (await import("@cherrystudio/mac-system-ocr")) as unknown as
        | { default: MacOCRStatic }
        | MacOCRStatic;
      const MacOCR = (mod as { default?: MacOCRStatic }).default ?? (mod as MacOCRStatic);
      if (typeof MacOCR?.recognizeFromBuffer !== "function") {
        throw new Error("MacOCR.recognizeFromBuffer 不可用");
      }
      this.visionModule = MacOCR;
      return MacOCR;
    } catch (error) {
      this.visionLoadFailed = true;
      errorLogger.alert("warn", "ocr.vision", "Vision OCR 加载失败，将使用 Tesseract", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async ensureTesseract(): Promise<TesseractWorker> {
    if (this.tesseractWorker) {
      this.lastTesseractUsedAt = Date.now();
      this.scheduleTesseractIdleRelease();
      return this.tesseractWorker;
    }
    if (!this.tesseractInitializing) {
      this.tesseractInitializing = (async () => {
        this.tesseractWorker = await createWorker("eng+chi_sim");
      })();
    }
    await this.tesseractInitializing;
    this.tesseractInitializing = null;
    this.lastTesseractUsedAt = Date.now();
    this.scheduleTesseractIdleRelease();
    return this.tesseractWorker!;
  }

  private scheduleTesseractIdleRelease() {
    if (this.tesseractIdleTimer) clearTimeout(this.tesseractIdleTimer);
    this.tesseractIdleTimer = setTimeout(() => {
      if (this.tesseractWorker && Date.now() - this.lastTesseractUsedAt >= TESSERACT_IDLE_RELEASE_MS) {
        const worker = this.tesseractWorker;
        this.tesseractWorker = null;
        void worker.terminate().catch(() => { /* swallow */ });
      }
    }, TESSERACT_IDLE_RELEASE_MS + 1000);
    this.tesseractIdleTimer.unref?.();
  }

  async recognize(image: Buffer): Promise<OCRResult> {
    const started = Date.now();
    // 主路径：Vision OCR
    if (process.platform === "darwin" && !this.forceFallback) {
      const MacOCR = await this.tryLoadVision();
      if (MacOCR) {
        try {
          const result = await MacOCR.recognizeFromBuffer(image, {
            // 主流语言齐全：英 + 简中 + 繁中 + 日 + 韩 + 拉丁系自带
            languages: "en-US, zh-Hans, zh-Hant, ja-JP, ko-KR",
            recognitionLevel: MacOCR.RECOGNITION_LEVEL_ACCURATE,
            minConfidence: 0.3
          });
          return {
            text: result.text ?? "",
            confidence: result.confidence ?? 0,
            blocks: (result.observations ?? []).map((o) => ({
              text: o.text,
              confidence: o.confidence
            })),
            engine: "vision",
            durationMs: Date.now() - started
          };
        } catch (error) {
          // Vision 单次失败不要禁用整个引擎，记一次警告就回 tesseract 兜底
          errorLogger.alert("warn", "ocr.vision", "Vision 识别失败，降级 Tesseract", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // 备份路径：Tesseract
    const worker = await this.ensureTesseract();
    const result = await worker.recognize(image);
    // Tesseract confidence 是 0-100；归一化到 0-1
    const confidence01 = (result.data.confidence ?? 0) / 100;
    return {
      text: result.data.text ?? "",
      confidence: confidence01,
      blocks: (result.data.blocks ?? []).map((b) => ({
        text: b.text,
        confidence: (b.confidence ?? 0) / 100
      })),
      engine: "tesseract",
      durationMs: Date.now() - started
    };
  }

  async terminate() {
    if (this.tesseractIdleTimer) {
      clearTimeout(this.tesseractIdleTimer);
      this.tesseractIdleTimer = null;
    }
    if (this.tesseractWorker) {
      const worker = this.tesseractWorker;
      this.tesseractWorker = null;
      try { await worker.terminate(); } catch { /* swallow */ }
    }
    // Vision native module 不需要清理
  }
}
