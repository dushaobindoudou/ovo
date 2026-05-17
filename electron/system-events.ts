/**
 * 系统事件 hub —— 集中订阅 powerMonitor / screen / net 系统事件
 * 解决：BUG_REPORT C5 (休眠) + M8 (离线) + M9 (多显示器) + A5 (无 hub) 一次性
 *
 * 设计要点：
 *   - 单例：避免每个模块各自订阅累积 listener
 *   - 通过 EventEmitter 广播给业务模块（auto-capture / window-manager / IPC）
 *   - 安全失败：powerMonitor 在 macOS 头几秒可能未 ready，订阅失败不阻断启动
 */
import { EventEmitter } from "node:events";
import { powerMonitor, screen, BrowserWindow, type Display } from "electron";
import { errorLogger } from "./error-logger.js";

export type SystemEvent =
  | "power:suspend"          // 系统将休眠（合盖 / 系统睡眠）
  | "power:resume"           // 系统从休眠恢复
  | "power:lock-screen"      // 锁屏（隐私：截图必须立刻停）
  | "power:unlock-screen"    // 解锁
  | "screen:display-changed" // 显示器加/减/分辨率变化
  | "net:online"             // 网络重新可用
  | "net:offline";           // 网络断开

class SystemEventHub extends EventEmitter {
  private initialized = false;
  private displaysCache: Display[] = [];
  private lastOnlineState: boolean = true;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // C5: powerMonitor — 休眠/恢复/锁屏
    try {
      powerMonitor.on("suspend", () => {
        errorLogger.alert("info", "system.power", "系统休眠 — 暂停所有捕获");
        this.emit("power:suspend" satisfies SystemEvent);
      });
      powerMonitor.on("resume", () => {
        errorLogger.alert("info", "system.power", "系统恢复 — 5 秒后恢复捕获");
        // 延迟 5 秒让系统稳定（OCR worker / GPU 等需要冷启动）
        setTimeout(() => this.emit("power:resume" satisfies SystemEvent), 5000);
      });
      // lock-screen / unlock-screen 仅 macOS / Windows
      powerMonitor.on("lock-screen", () => {
        errorLogger.alert("info", "system.power", "屏幕已锁 — 立即停止捕获（隐私保护）");
        this.emit("power:lock-screen" satisfies SystemEvent);
      });
      powerMonitor.on("unlock-screen", () => {
        errorLogger.alert("info", "system.power", "屏幕已解锁 — 恢复捕获");
        this.emit("power:unlock-screen" satisfies SystemEvent);
      });
    } catch (e) {
      errorLogger.alert("warn", "system.power", "powerMonitor 订阅失败", {
        error: e instanceof Error ? e.message : String(e)
      });
    }

    // M9: screen — 显示器变化
    try {
      this.displaysCache = screen.getAllDisplays();
      const handleDisplayChange = () => {
        const newDisplays = screen.getAllDisplays();
        const changed =
          newDisplays.length !== this.displaysCache.length ||
          newDisplays.some((d, i) => {
            const old = this.displaysCache[i];
            return !old || d.id !== old.id ||
              d.workArea.width !== old.workArea.width ||
              d.workArea.height !== old.workArea.height;
          });
        if (changed) {
          this.displaysCache = newDisplays;
          this.emit("screen:display-changed" satisfies SystemEvent, newDisplays);
          // 把超出屏幕范围的窗口拉回主屏
          this.rescueOutOfBoundsWindows(newDisplays);
        }
      };
      screen.on("display-added", handleDisplayChange);
      screen.on("display-removed", handleDisplayChange);
      screen.on("display-metrics-changed", handleDisplayChange);
    } catch (e) {
      errorLogger.alert("warn", "system.screen", "screen 事件订阅失败", {
        error: e instanceof Error ? e.message : String(e)
      });
    }

    // M8: 网络状态 — 主进程没有 navigator，让 renderer 把状态推过来即可
    // 这里维护一份"主进程视角"，业务模块统一从这里读
    // initial: 假设 online（启动时通常是）
    this.lastOnlineState = true;
  }

  /**
   * M9: 把"位置在不存在的屏幕上"的窗口拉回主屏中央
   */
  private rescueOutOfBoundsWindows(displays: Display[]) {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      try {
        const bounds = win.getBounds();
        // 判断窗口中心点是否落在任一显示器的 workArea 内
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const inside = displays.some((d) =>
          cx >= d.workArea.x && cx <= d.workArea.x + d.workArea.width &&
          cy >= d.workArea.y && cy <= d.workArea.y + d.workArea.height
        );
        if (!inside) {
          const primary = displays[0];
          if (!primary) continue;
          const nx = Math.max(primary.workArea.x, primary.workArea.x + (primary.workArea.width - bounds.width) / 2);
          const ny = Math.max(primary.workArea.y, primary.workArea.y + (primary.workArea.height - bounds.height) / 2);
          win.setBounds({ x: Math.round(nx), y: Math.round(ny), width: bounds.width, height: bounds.height });
          errorLogger.alert("info", "system.screen", "窗口超出屏幕已拉回主屏", {
            title: win.getTitle(),
            from: bounds,
            to: { x: Math.round(nx), y: Math.round(ny) }
          });
        }
      } catch {
        // 单个窗口失败不影响其他
      }
    }
  }

  /**
   * M8: renderer 通过 IPC 调用，告知主进程当前是否在线
   */
  reportOnlineState(online: boolean) {
    if (online === this.lastOnlineState) return;
    this.lastOnlineState = online;
    if (online) {
      errorLogger.alert("info", "system.net", "网络恢复");
      this.emit("net:online" satisfies SystemEvent);
    } else {
      errorLogger.alert("warn", "system.net", "网络断开 — 仅本地功能可用");
      this.emit("net:offline" satisfies SystemEvent);
    }
  }

  isOnline(): boolean {
    return this.lastOnlineState;
  }
}

export const systemEvents = new SystemEventHub();
