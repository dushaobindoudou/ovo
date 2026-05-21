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
  // CODE-14: 跟踪当前在跑的 stream，使新请求来时取消前一个，避免 socket 堆积
  private activeStream: { abort: () => void } | null = null;
  // SEC-12: 主进程独立维护 enabled 状态。即使 renderer 被 XSS 直接调 ipcRenderer.invoke("tts:speak")，
  // 主进程也会拒绝。Renderer 切换设置时通过 IPC 同步这里。
  private enabled = false;

  setEnabled(v: boolean) { this.enabled = !!v; }
  isEnabled() { return this.enabled; }

  private async ensureEdgeReady(voice: string): Promise<MsEdgeTTS> {
    if (this.edgeClient && this.edgeReady) return this.edgeClient;
    const client = new MsEdgeTTS();
    await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    this.edgeClient = client;
    this.edgeReady = true;
    return client;
  }

  /** CODE-14: 主动取消当前正在跑的 TTS（组件卸载 / 用户切歌时调用） */
  cancel(): void {
    if (this.activeStream) {
      try { this.activeStream.abort(); } catch { /* */ }
      this.activeStream = null;
    }
  }

  async speak(text: string, voice = "zh-CN-XiaoxiaoNeural"): Promise<TTSResult> {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return { ok: false, mode: "failed", error: "text 为空" };
    // SEC-12: 默认拒绝 — 用户必须在设置里显式打开 TTS 才能用
    if (!this.enabled) return { ok: false, mode: "failed", error: "TTS 未启用（设置 → 朗读 中开启）" };

    // CODE-14: 并发请求去重 — 新请求来之前先取消老的
    this.cancel();

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
      let aborted = false;
      // CODE-14: 注册取消接口 — cancel() 可以 destroy stream
      const abortHandle = {
        abort: () => {
          aborted = true;
          try { audioStream.destroy(); } catch { /* */ }
        }
      };
      this.activeStream = abortHandle;
      try {
        const audioBase64 = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            try { audioStream.destroy(); } catch { /* */ }
            reject(new Error("msedge-tts 30s 超时"));
          }, 30_000);
          audioStream.on("data", (c: Buffer) => chunks.push(c));
          audioStream.on("end", () => {
            clearTimeout(timer);
            if (aborted) {
              reject(new Error("TTS 已取消"));
            } else {
              resolve(Buffer.concat(chunks).toString("base64"));
            }
          });
          audioStream.on("error", (err: unknown) => {
            clearTimeout(timer);
            reject(err);
          });
        });
        return { ok: true, mode: "edge", audioBase64 };
      } finally {
        if (this.activeStream === abortHandle) this.activeStream = null;
      }
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
