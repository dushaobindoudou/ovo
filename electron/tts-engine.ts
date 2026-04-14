import { execa } from "execa";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export class TTSEngine {
  async speak(text: string, voice = "zh-CN-XiaoxiaoNeural") {
    const outputPath = path.join(os.tmpdir(), `ovo-tts-${Date.now()}.mp3`);
    try {
      await execa("edge-tts", ["--voice", voice, "--text", text, "--write-media", outputPath], {
        timeout: 30_000
      });
      const audio = await fs.readFile(outputPath);
      return { ok: true, audioBase64: audio.toString("base64") };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "TTS 调用失败"
      };
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }
}
