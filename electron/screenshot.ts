import { desktopCapturer, systemPreferences } from "electron";

export class ScreenshotPermissionError extends Error {
  code = "PERMISSION_DENIED" as const;
  constructor(public status: string) {
    super(`屏幕录制权限未授权（status=${status}）`);
    this.name = "ScreenshotPermissionError";
  }
}

export class ScreenshotManager {
  async captureScreen(): Promise<Buffer> {
    if (process.platform === "darwin") {
      const status = systemPreferences.getMediaAccessStatus("screen");
      if (status !== "granted") {
        throw new ScreenshotPermissionError(status);
      }
    }
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
      if (error instanceof ScreenshotPermissionError) throw error;
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
