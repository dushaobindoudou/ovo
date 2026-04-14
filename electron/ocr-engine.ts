import { createWorker, type Worker } from "tesseract.js";

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: Array<{
    text: string;
    confidence: number;
  }>;
}

export class OCREngine {
  private worker: Worker | null = null;

  async initialize() {
    if (this.worker) return;
    this.worker = await createWorker("eng+chi_sim");
  }

  async recognize(image: Buffer): Promise<OCRResult> {
    if (!this.worker) await this.initialize();
    const result = await this.worker!.recognize(image);
    return {
      text: result.data.text ?? "",
      confidence: result.data.confidence ?? 0,
      blocks: (result.data.blocks ?? []).map((b) => ({
        text: b.text,
        confidence: b.confidence
      }))
    };
  }

  async terminate() {
    if (!this.worker) return;
    await this.worker.terminate();
    this.worker = null;
  }
}
