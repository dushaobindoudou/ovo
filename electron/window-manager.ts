import { execa } from "execa";
import { desktopCapturer, BrowserWindow, type NativeImage } from "electron";
import type { WindowInfo } from "./types.js";

/**
 * desktopCapturer.getSources 成功一次就证明屏幕录制权限实际可用。
 * 主动 broadcast 一个 permissions:status 给所有渲染窗口，覆盖
 * systemPreferences.getMediaAccessStatus 偶尔返回过期 "denied" 的缓存问题。
 */
let lastPermissionBroadcast = 0;
function notifyScreenGranted() {
  const now = Date.now();
  if (now - lastPermissionBroadcast < 5_000) return; // 节流：5 秒内最多 1 次
  lastPermissionBroadcast = now;
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send("permissions:status", {
        screen: "granted",
        timestamp: now,
        observedVia: "desktopCapturer"
      });
    }
  } catch { /* ignore */ }
}

export interface WindowThumbnail {
  windowId: string;
  appName: string;
  windowTitle: string;
  /** data URL (PNG, base64) */
  thumbnail: string;
  /** 与 desktopCapturer 给的 source id 对应，便于以后单窗口截图 */
  sourceId: string;
  isActive?: boolean;
}

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

// 拿真实前台 app（包含 ovo 自身）。"不 OCR ovo 自己"的语义放在 captureOnce 的
// getWindowCaptures 过滤里实现，这里不要错过任何 active 信息（健康检查、UI
// "当前活动窗口" 卡片都依赖它）。
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

function normalizeAppName(appName: string): string {
  return (appName ?? "").trim().toLowerCase();
}

/** Ovo 自身可能被 macOS 报告的几种 app 名（不同打包配置下不一致） */
const OVO_APP_NAMES = new Set(["ovo", "electron"]);

export function isOvoApp(appName: string | null | undefined): boolean {
  if (!appName) return false;
  return OVO_APP_NAMES.has(normalizeAppName(appName));
}

export class WindowManager {
  /**
   * 上一次 osascript 报告的真实前台 app（未过滤 ovo 自身）。
   * auto-capture 用它判断"现在前台是不是 ovo"，从而决定 active 缺失时
   * 该不该 fallback 到 captures[0]——前台是 ovo 时跳过，前台是别的应用
   * 但 desktopCapturer 命名不一致导致 isActive 没命中时才允许 fallback。
   */
  lastFrontmostApp: string | null = null;

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

  /**
   * 通过 desktopCapturer 拿所有窗口的实时缩略图。需要屏幕录制权限。
   * 与 getAllWindows() 不同，这里不依赖 osascript（无需辅助功能权限）。
   */
  async getWindowThumbnails(thumbWidth = 320, thumbHeight = 200): Promise<WindowThumbnail[]> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: thumbWidth, height: thumbHeight },
        fetchWindowIcons: true
      });
      let active: WindowInfo | null = null;
      try {
        active = await this.getActiveWindow();
      } catch {
        /* 拿不到活动窗口不影响返回缩略图 */
      }
      return sources.map((src) => {
        const title = src.name ?? "";
        // desktopCapturer 给的 name 通常是 "AppName - WindowTitle" 形式，但不稳定。
        // 我们直接以 name 作为 appName + windowTitle 的合并标识。
        const appName = title.split(" – ")[0] || title.split(" - ")[0] || title;
        const windowTitle = title === appName ? "" : title;
        const winId = toId(appName, windowTitle);
        const isActive = !!(active && (active.windowId === winId || active.appName === appName));
        return {
          windowId: winId,
          appName,
          windowTitle,
          thumbnail: src.thumbnail.toDataURL(),
          sourceId: src.id,
          isActive
        };
      });
    } catch (error) {
      throw new Error(
        `获取窗口缩略图失败，请检查"系统设置 -> 隐私与安全性 -> 屏幕录制"权限: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  /**
   * 拉取所有窗口的截图元数据 + NativeImage 引用，单次 getSources 调用。
   * 用于 auto-capture 按窗口独立 OCR。
   *
   * P1-A 性能优化：
   *   - 返回 NativeImage 而非 PNG Buffer——调用方选定 target 后再 toPNG/toJPEG，
   *     避免为所有未被 OCR 的窗口浪费 PNG 编码 CPU
   *   - 默认 thumbnailSize 从 1920×1200 降到 1280×800（OCR 质量足够，编码量 -55%）
   *
   * 关键过滤：
   *   1) 移除 ovo / Electron 自身的 source（ovo 不监控自己，否则缓冲区只剩 ovo）
   *   2) appName 解析同时识别 hyphen `-` 与 en-dash `–` 等多种分隔符
   *   3) isActive 用规范化后的 appName 比对，提高跨 unicode dash 的命中率
   */
  async getWindowCaptures(thumbWidth = 1280, thumbHeight = 800): Promise<Array<{
    windowId: string;
    appName: string;
    windowTitle: string;
    sourceId: string;
    /** NativeImage 句柄——调用方按需 toJPEG()/toPNG() 提取 Buffer */
    image: NativeImage;
    isActive?: boolean;
  }>> {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: thumbWidth, height: thumbHeight }
    });
    // 实证：能拿到 sources 就证明屏幕录制权限可用，主动覆盖前端权限状态
    if (sources.length > 0) notifyScreenGranted();
    let active: WindowInfo | null = null;
    try {
      active = await this.getActiveWindow();
    } catch {
      /* 拿不到不阻断 */
    }
    // 记下 osascript 真实前台（即便是 ovo 自己），供 auto-capture 决策用
    this.lastFrontmostApp = active?.appName ?? null;
    const activeAppNorm = active?.appName ? normalizeAppName(active.appName) : null;
    const result: Array<{
      windowId: string; appName: string; windowTitle: string;
      sourceId: string; image: NativeImage; isActive?: boolean;
    }> = [];
    for (const src of sources) {
      const title = src.name ?? "";
      // 拆 "AppName - Title" / "AppName – Title" / "AppName — Title" 各种 dash
      const splitMatch = title.match(/^(.*?)\s+[-–—]\s+(.*)$/);
      const appName = splitMatch ? splitMatch[1].trim() : title.trim();
      const windowTitle = splitMatch ? splitMatch[2].trim() : "";
      const appNorm = normalizeAppName(appName);
      // 过滤 ovo 自身
      if (appNorm === "ovo" || appNorm === "electron") continue;
      const winId = toId(appName, windowTitle);
      const isActive = !!(activeAppNorm && (active?.windowId === winId || activeAppNorm === appNorm));
      result.push({
        windowId: winId,
        appName,
        windowTitle,
        sourceId: src.id,
        image: src.thumbnail,
        isActive
      });
    }
    return result;
  }

  async getActiveWindow(): Promise<WindowInfo | null> {
    if (process.platform !== "darwin") return null;
    try {
      const { stdout } = await execa("osascript", ["-e", activeScript]);
      const trimmed = stdout.trim();
      const [appName, windowTitle = ""] = trimmed.split("||");
      if (!appName || !appName.trim()) return null;
      return {
        windowId: toId(appName.trim(), windowTitle.trim()),
        appName: appName.trim(),
        windowTitle: windowTitle.trim(),
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
