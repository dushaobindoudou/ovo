import screenshot from "screenshot-desktop";

export class ScreenshotManager {
  async captureScreen(): Promise<Buffer> {
    try {
      const image = await screenshot({ format: "png" });
      return Buffer.isBuffer(image) ? image : Buffer.from(image);
    } catch (error) {
      throw new Error(
        `屏幕截图失败，请检查“系统设置 -> 隐私与安全性 -> 屏幕录制”权限: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  toBase64(image: Buffer) {
    return image.toString("base64");
  }
}
