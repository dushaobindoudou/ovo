import { desktopCapturer } from "electron";

export class ScreenshotManager {
  async captureScreen(): Promise<Buffer> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      if (sources.length === 0) {
        throw new Error("未检测到屏幕源");
      }
      // 取第一个屏幕（主显示器）
      const thumbnail = sources[0].thumbnail;
      const buffer = thumbnail.toPNG();
      return buffer;
    } catch (error) {
      throw new Error(
        `屏幕截图失败，请检查"系统设置 -> 隐私与安全性 -> 屏幕录制"权限: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  toBase64(image: Buffer) {
    return image.toString("base64");
  }
}
