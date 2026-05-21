/**
 * ipc/system.ts —— system:* + permissions:* + app:* + floating:* + logger:* + error-log:* + alert:* + scheduler:* IPC
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 所有"系统级 / 应用级"杂项 channel 集中于此。
 */
import { app, systemPreferences, shell, screen } from "electron";
import { execFile } from "node:child_process";
import { errorLogger } from "../error-logger.js";
import { scheduler } from "../scheduler.js";
import { systemEvents } from "../system-events.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerSystemHandlers(deps: IpcHandlerDeps) {
  const { ipcMain, options, floatingDragState, screenshotManager, logSystem } = deps;

  // 注：floating:get-state / floating:clear-unread 由 ipc-handlers 主文件 handle，
  // 因为 floatingState 对象只在主入口持有——重复 handle 会导致 makeSafeIpcMain
  // remove 后再加，主入口的 handler 反而丢失。这里只处理 drag / expand 等无状态操作。

  // 悬浮球拖动：用 JS 实现球本身可拖
  ipcMain.handle("floating:drag-start", () => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed()) return { ok: false };
    const [x, y] = win.getPosition();
    floatingDragState.start = { x, y };
    return { ok: true };
  });
  ipcMain.handle("floating:drag-move", (_event, payload: { dx: number; dy: number }) => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed() || !floatingDragState.start) return { ok: false };
    const dx = Number.isFinite(payload?.dx) ? payload.dx : 0;
    const dy = Number.isFinite(payload?.dy) ? payload.dy : 0;
    win.setPosition(Math.round(floatingDragState.start.x + dx), Math.round(floatingDragState.start.y + dy));
    return { ok: true };
  });
  ipcMain.handle("floating:drag-end", () => {
    floatingDragState.start = null;
    return { ok: true };
  });

  // 悬浮球高度切换：默认仅球(108)，sticky 展开时撑到 260
  ipcMain.handle("floating:set-expanded", (_event, expanded: boolean) => {
    const win = options.getFloatingWindow();
    if (!win || win.isDestroyed()) return { ok: false };
    // 96×96 (折叠) ↔ 300×288 (展开)
    const COLLAPSED = { w: 96, h: 96 };
    const EXPANDED = { w: 300, h: 288 };
    const [curX, curY] = win.getPosition();
    const [curW] = win.getSize();
    const orbScreenX = curX + (curW - COLLAPSED.w);
    const target = expanded ? EXPANDED : COLLAPSED;
    let newX = orbScreenX + COLLAPSED.w - target.w;
    let newY = curY;
    const display = screen.getDisplayNearestPoint({ x: orbScreenX, y: curY });
    const wa = display.workArea;
    if (newX < wa.x) newX = wa.x;
    if (newX + target.w > wa.x + wa.width) newX = wa.x + wa.width - target.w;
    if (newY + target.h > wa.y + wa.height) newY = wa.y + wa.height - target.h;
    if (newY < wa.y) newY = wa.y;
    win.setBounds({ x: newX, y: newY, width: target.w, height: target.h }, false);
    return { ok: true, width: target.w, height: target.h };
  });

  // alert / scheduler
  ipcMain.handle("scheduler:get-status", () => scheduler.getStatus());
  ipcMain.handle("alert:get-recent", (_event, limit?: number) => errorLogger.getAlerts(limit ?? 50));

  // T13 / M8: 网络状态 — renderer 用 navigator.onLine 上报到主进程
  ipcMain.handle("system:report-online", (_event, online: boolean) => {
    systemEvents.reportOnlineState(!!online);
    return { ok: true };
  });
  ipcMain.handle("system:is-online", () => systemEvents.isOnline());

  // system:open-app — 通用"打开外部 macOS 应用"通道
  // 用户反馈："我怎么知道 todo/日历/邮件是否真的写到了系统里？"
  // → ActionDetailDrawer 的"去现场看"按钮调用本 channel，跳到对应系统应用。
  //
  // 安全：bundleId 必须是已知白名单 / 反向域名格式（防注入任意 -a path）；
  //       open -a "AppName" 走 `execFile` 而非 shell，args 数组传入不字符串拼接。
  ipcMain.handle("system:open-app", async (_event, payload: { app?: string; bundleId?: string }) => {
    const appName = typeof payload?.app === "string" ? payload.app.trim() : "";
    const bundleId = typeof payload?.bundleId === "string" ? payload.bundleId.trim() : "";
    // 白名单：仅允许打开内置 stock app + 已知 bundleId 格式
    // 当前 builtin skill 的目标应用集；未来 skill 系统起来后由各 skill 自己声明 verify target。
    const STOCK_APP_WHITELIST = new Set([
      "Reminders", "Calendar", "Mail", "Messages", "Notes",
      "Safari", "Finder", "TextEdit", "System Settings"
    ]);
    const isValidBundleId = /^[a-zA-Z0-9.-]{3,128}$/.test(bundleId) && bundleId.includes(".");
    if (!appName && !bundleId) {
      return { ok: false, error: "missing-app-or-bundle-id" };
    }
    if (appName && !STOCK_APP_WHITELIST.has(appName)) {
      return { ok: false, error: `app-not-whitelisted: ${appName}` };
    }
    if (bundleId && !isValidBundleId) {
      return { ok: false, error: "invalid-bundle-id-format" };
    }
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const args = bundleId ? ["-b", bundleId] : ["-a", appName];
      execFile("/usr/bin/open", args, { timeout: 5000 }, (err) => {
        if (err) {
          // 常见原因：应用没装、用户拒绝授权、bundle id 错
          const msg = err.message || String(err);
          logSystem("warning", "system.open-app", "打开应用失败", { app: appName || bundleId, error: msg });
          resolve({ ok: false, error: /not found|无法找到/.test(msg) ? "app-not-installed" : msg });
          return;
        }
        resolve({ ok: true });
      });
    });
  });

  // app:*
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:runtime-check", () => ({
    ok: true,
    version: app.getVersion(),
    channels: { takeScreenshot: true, openSettings: true }
  }));
  ipcMain.handle("app:open-console", () => {
    const win = options.getConsoleWindow();
    if (!win) return { ok: false };
    win.show();
    win.focus();
    return { ok: true };
  });
  // P1: 点击悬浮球 toggle 主窗口
  ipcMain.handle("app:toggle-console", () => {
    const win = options.getConsoleWindow();
    if (!win) return { ok: false, visible: false };
    if (win.isVisible() && win.isFocused()) {
      win.hide();
      return { ok: true, visible: false };
    }
    win.show();
    win.focus();
    return { ok: true, visible: true };
  });

  // error-log 查询
  ipcMain.handle("error-log:get-recent", (_event, limit = 50) => errorLogger.getEntries(limit));
  ipcMain.handle("error-log:get-count", () => errorLogger.getErrorCount());

  // macOS 权限检测
  ipcMain.handle("permissions:get-status", () => {
    const result: Record<string, string> = {};
    if (process.platform === "darwin") {
      result.screenRecording = systemPreferences.getMediaAccessStatus("screen") as string;
      result.camera = systemPreferences.getMediaAccessStatus("camera") as string;
      result.microphone = systemPreferences.getMediaAccessStatus("microphone") as string;
    } else {
      result.screenRecording = "not-available";
      result.camera = "not-available";
      result.microphone = "not-available";
    }
    return result;
  });
  ipcMain.handle("permissions:open-settings", async (_event, payload?: { target?: "screen" | "camera" | "microphone" }) => {
    const attempts: Array<{ method: string; ok: boolean; detail?: string }> = [];
    const log = (level: "info" | "warning", msg: string, ctx?: Record<string, unknown>) => {
      options.logger?.[level === "info" ? "info" : "warning"]("permissions:open-settings", msg, ctx);
    };
    const openWithCommand = (args: string[]) =>
      new Promise<boolean>((resolve) => {
        execFile("open", args, (err) => resolve(!err));
      });

    if (process.platform !== "darwin") {
      if (process.platform === "win32") {
        await shell.openExternal("ms-settings:privacy");
      } else {
        await shell.openExternal("https://wiki.archlinux.org/title/Screen_sharing");
      }
      return { ok: true, attempts: [{ method: "platform-fallback", ok: true }] };
    }

    const target = payload?.target ?? "screen";
    const anchor = target === "camera"
      ? "Privacy_Camera"
      : target === "microphone"
        ? "Privacy_Microphone"
        : "Privacy_ScreenCapture";

    // macOS 13+：osascript reveal anchor 是经验上最稳定的（System Settings 而非 System Preferences）
    const osascript = `tell application "System Settings" to activate
delay 0.2
tell application "System Settings" to reveal anchor "${anchor}" of pane id "com.apple.preference.security"`;
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("osascript", ["-e", osascript], (err) => (err ? reject(err) : resolve()));
      });
      attempts.push({ method: "osascript-reveal", ok: true });
      log("info", "已通过 osascript 打开系统设置", { target, anchor });
      return { ok: true, method: "osascript-reveal", target, attempts };
    } catch (err) {
      attempts.push({ method: "osascript-reveal", ok: false, detail: err instanceof Error ? err.message : String(err) });
    }

    const urlsToTry = [
      `x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?${anchor}`,
      `x-apple.systempreferences:com.apple.preference.security?${anchor}`
    ];
    for (const url of urlsToTry) {
      try {
        await shell.openExternal(url);
        attempts.push({ method: `shell.openExternal:${url}`, ok: true });
        log("info", "已通过 shell.openExternal 打开系统设置", { url });
        return { ok: true, method: "shell.openExternal", target, url, attempts };
      } catch (err) {
        attempts.push({ method: `shell.openExternal:${url}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const url of urlsToTry) {
      const ok = await openWithCommand([url]);
      attempts.push({ method: `open ${url}`, ok });
      if (ok) {
        log("info", "已通过 open URL 打开系统设置", { url });
        return { ok: true, method: "open-url", target, url, attempts };
      }
    }

    if (await openWithCommand(["-a", "System Settings"])) {
      attempts.push({ method: "open -a 'System Settings'", ok: true });
      log("info", "已通过 open -a System Settings", {});
      return { ok: true, method: "open-app-name", target, attempts };
    }
    if (await openWithCommand(["-b", "com.apple.systempreferences"])) {
      attempts.push({ method: "open -b com.apple.systempreferences", ok: true });
      log("info", "已通过 bundle id 打开系统设置", {});
      return { ok: true, method: "open-bundle-id", target, attempts };
    }

    const openPathError = await shell.openPath("/System/Applications/System Settings.app");
    if (!openPathError) {
      attempts.push({ method: "shell.openPath", ok: true });
      return { ok: true, method: "shell.openPath", target, attempts };
    }
    attempts.push({ method: "shell.openPath", ok: false, detail: openPathError });

    log("warning", "全部策略失败", { attempts });
    return { ok: false, method: "failed", target, error: openPathError || "unable to open settings", attempts };
  });

  // 触发 desktopCapturer 以引发 macOS 原生屏幕录制授权提示
  ipcMain.handle("permissions:request-screen", async () => {
    try {
      await screenshotManager.captureScreen();
    } catch {
      /* 忽略失败，依然返回最新状态 */
    }
    if (process.platform === "darwin") {
      return { screen: systemPreferences.getMediaAccessStatus("screen"), timestamp: Date.now() };
    }
    return { screen: "not-available", timestamp: Date.now() };
  });

  // logger:info/warning/error —— renderer 主动写日志的通道
  ipcMain.handle(
    "logger:info",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.info(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "logger:warning",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.warning(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "logger:error",
    (_event, payload: { source: string; message: string; context?: Record<string, unknown> }) => {
      options.logger?.error(payload.source, payload.message, payload.context);
      return { ok: true };
    }
  );

  void logSystem; // 借引用，避免 lint unused（logger:* 未来可能调用）
}
