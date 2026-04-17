import { execa } from "execa";
import type { WindowInfo } from "./types.js";

const listScript = `
tell application "System Events"
  set outText to ""
  repeat with p in (every process whose background only is false)
    set appName to name of p
    repeat with w in (every window of p)
      try
        set outText to outText & appName & "||" & name of w & "\\n"
      end try
    end repeat
  end repeat
  return outText
end tell
`;

const activeScript = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set winName to ""
  try
    set winName to name of front window of frontApp
  end try
  return appName & "||" & winName
end tell
`;

function toId(appName: string, title: string) {
  return `${appName}::${title}`.replace(/\s+/g, "_");
}

export class WindowManager {
  async getAllWindows(): Promise<WindowInfo[]> {
    if (process.platform !== "darwin") return [];
    try {
      const { stdout } = await execa("osascript", ["-e", listScript]);
      const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
      return lines.map((line) => {
        const [appName, windowTitle = ""] = line.split("||");
        return {
          windowId: toId(appName, windowTitle),
          appName,
          windowTitle
        };
      });
    } catch (error) {
      throw new Error(
        `获取窗口列表失败，请检查“系统设置 -> 隐私与安全性 -> 自动化/辅助功能/屏幕录制”权限: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  /** 将监控 key（windowId 或历史格式 windowId::appName）解析为窗口信息 */
  async resolveMonitoredKey(monitoredKey: string): Promise<WindowInfo | null> {
    const all = await this.getAllWindows();
    const byId = all.find((w) => w.windowId === monitoredKey);
    if (byId) return byId;
    return all.find((w) => `${w.windowId}::${w.appName}` === monitoredKey) ?? null;
  }

  async getActiveWindow(): Promise<WindowInfo | null> {
    if (process.platform !== "darwin") return null;
    try {
      const { stdout } = await execa("osascript", ["-e", activeScript]);
      const [appName, windowTitle = ""] = stdout.split("||");
      if (!appName) return null;
      return {
        windowId: toId(appName, windowTitle),
        appName,
        windowTitle,
        isActive: true
      };
    } catch (error) {
      throw new Error(
        `获取活动窗口失败，请检查“系统设置 -> 隐私与安全性 -> 自动化/辅助功能”权限: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }
}
