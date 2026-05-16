import { execa } from "execa";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface TTSResult {
  ok: boolean;
  /** edge: 主进程返回 base64 mp3，渲染端 <audio> 播放；native: 主进程通过 say 直接播放 */
  mode?: "edge" | "native" | "failed";
  audioBase64?: string;
  error?: string;
}

/**
 * R1: 用 msedge-tts npm 包直连 Microsoft Edge TTS WebSocket，纯 JS 不依赖外部 CLI。
 * 失败时 fallback 到 macOS 内置 say（音质差但绝对可用）。
 */
export class TTSEngine {
  private edgeClient: MsEdgeTTS | null = null;
  private edgeReady = false;

  private async ensureEdgeReady(voice: string): Promise<MsEdgeTTS> {
    if (this.edgeClient && this.edgeReady) return this.edgeClient;
    const client = new MsEdgeTTS();
    await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    this.edgeClient = client;
    this.edgeReady = true;
    return client;
  }

  async speak(text: string, voice = "zh-CN-XiaoxiaoNeural"): Promise<TTSResult> {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return { ok: false, mode: "failed", error: "text 为空" };

    // 1) msedge-tts (Microsoft Edge TTS, 纯 JS)
    const edge = await this.tryMsEdge(trimmed, voice);
    if (edge.ok) return edge;

    // 2) macOS native say —— 最后兜底
    if (process.platform === "darwin") {
      return this.trySay(trimmed);
    }

    return { ok: false, mode: "failed", error: edge.error ?? "TTS 不可用" };
  }

  private async tryMsEdge(text: string, voice: string): Promise<TTSResult> {
    try {
      const client = await this.ensureEdgeReady(voice);
      // toStream 返回 Readable，收集 chunk → base64
      const { audioStream } = client.toStream(text);
      const chunks: Buffer[] = [];
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("msedge-tts 30s 超时")), 30_000);
        audioStream.on("data", (c: Buffer) => chunks.push(c));
        audioStream.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("base64"));
        });
        audioStream.on("error", (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      return { ok: true, mode: "edge", audioBase64 };
    } catch (error) {
      // 连接失败时重置 client，下次再试
      this.edgeReady = false;
      this.edgeClient = null;
      return {
        ok: false,
        mode: "failed",
        error: error instanceof Error ? error.message : "msedge-tts 调用失败"
      };
    }
  }

  private async trySay(text: string): Promise<TTSResult> {
    try {
      await execa("say", ["-v", "Tingting", text], { timeout: 30_000 });
      return { ok: true, mode: "native" };
    } catch {
      try {
        await execa("say", [text], { timeout: 30_000 });
        return { ok: true, mode: "native" };
      } catch (e2) {
        return {
          ok: false,
          mode: "failed",
          error: e2 instanceof Error ? e2.message : "say 调用失败"
        };
      }
    }
  }
}
