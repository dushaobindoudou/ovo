import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { Logger } from "./logger.js";
import { runVerifyRealLogs } from "./verify-real-logs.js";
import { errorLogger } from "./error-logger.js";

let consoleWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let suggestionWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let logger: Logger | null = null;
let sharedKG: KnowledgeGraphEngine | null = null;

const isDev = process.env.NODE_ENV === "development";

function resolvePreloadPath() {
  const candidates = [
    path.join(app.getAppPath(), "preload.cjs"),
    path.join(app.getAppPath(), "electron", "preload.cjs"),
    path.join(process.cwd(), "electron", "preload.cjs")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  // 兜底，保持与历史行为兼容
  return path.join(app.getAppPath(), "electron", "preload.cjs");
}

function createTrayIcon(): Electron.NativeImage {
  // Generate a 22x22 PNG-like icon using nativeImage
  // Draw a green circle with V shape on dark background
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Dark background
      canvas[i] = 0x19;     // R
      canvas[i + 1] = 0x19; // G
      canvas[i + 2] = 0x19; // B
      canvas[i + 3] = 0xFF; // A

      // Two small circles (eyes)
      const cx1 = 7, cy1 = 11, cx2 = 15, cy2 = 11, r = 5;
      const d1 = Math.sqrt((x - cx1) ** 2 + (y - cy1) ** 2);
      const d2 = Math.sqrt((x - cx2) ** 2 + (y - cy2) ** 2);
      if (Math.abs(d1 - r) < 1.2 || Math.abs(d2 - r) < 1.2) {
        canvas[i] = 0xE8; canvas[i + 1] = 0xF5; canvas[i + 2] = 0xEE;
      }
      // V shape in green
      const vx = x, vy = y;
      // Simple V: from (8,7) to (11,14) to (14,7)
      const vLines = [
        { x1: 8, y1: 7, x2: 11, y2: 14 },
        { x1: 11, y1: 14, x2: 14, y2: 7 },
      ];
      for (const line of vLines) {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dist = Math.abs((vx - line.x1) * dy - (vy - line.y1) * dx) / len;
        const t = ((vx - line.x1) * dx + (vy - line.y1) * dy) / (len * len);
        if (dist < 1.2 && t >= 0 && t <= 1) {
          canvas[i] = 0x07; canvas[i + 1] = 0xC1; canvas[i + 2] = 0x60;
        }
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray() {
  try {
    const trayIcon = createTrayIcon();
    trayIcon.setTemplateImage(true);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "打开控制台",
        click: () => {
          if (consoleWindow) {
            consoleWindow.show();
            consoleWindow.focus();
          }
        }
      },
      { type: "separator" },
      {
        label: "退出 ovo",
        click: () => app.quit()
      }
    ]);

    tray.setToolTip("ovo - AI 桌面助手");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (consoleWindow) {
        consoleWindow.show();
        consoleWindow.focus();
      }
    });

    logger?.info("electron:tray", "系统托盘创建完成");
  } catch (err) {
    logger?.error("electron:tray", "托盘创建失败", { error: err instanceof Error ? err.message : String(err) });
  }
}

function resolveRendererEntry(urlHash: string) {
  if (isDev) return `http://localhost:5173/${urlHash}`;
  const candidates = [
    path.join(app.getAppPath(), "dist", "index.html"),
    path.join(app.getAppPath(), "..", "dist", "index.html"),
    path.join(app.getAppPath(), "..", "..", "dist", "index.html"),
    path.join(process.cwd(), "dist", "index.html")
  ];
  const hit = candidates.find((file) => fs.existsSync(file));
  const html = hit ?? candidates[0];
  return `file://${html}${urlHash}`;
}

function createWindow(urlHash: string, options: Electron.BrowserWindowConstructorOptions) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    ...options
  });

  const entry = resolveRendererEntry(urlHash);

  void win.loadURL(entry);
  win.once("ready-to-show", () => win.show());
  const windowName = urlHash.replace("#", "") || "main";
  logger?.info("electron:window", "窗口创建完成", {
    windowName,
    title: options.title ?? ""
  });
  return win;
}

function createConsoleWindow() {
  consoleWindow = createWindow("#console", {
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "ovo 控制台界面",
    frame: true,
    backgroundColor: "#0a0a14"
  });
}

function createFloatingWindow() {
  floatingWindow = createWindow("#float", {
    width: 64,
    height: 64,
    x: 1480,
    y: 80,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    title: "ovo 悬浮球"
  });
}

function createSuggestionWindow() {
  suggestionWindow = createWindow("#panel", {
    width: 420,
    height: 860,
    x: 0,
    y: 60,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: true,
    title: "ovo 建议面板"
  });
}

function createAllWindows() {
  createConsoleWindow();
  createFloatingWindow();
  createSuggestionWindow();
}

app.whenReady().then(() => {
  sharedKG = new KnowledgeGraphEngine();
  logger = new Logger({ kg: sharedKG });
  errorLogger.init();
  logger.info("electron:main", "应用启动", { isDev });

  // 检查上次运行的错误日志
  const errorCount = errorLogger.getErrorCount();
  if (errorCount > 0) {
    logger.warning("electron:main", "检测到上次运行的错误日志", { errorCount });
  }

  // 兼容旧的 systemLogger 接口
  const systemLogger = {
    info: (source: string, message: string, context?: Record<string, unknown>) => logger?.info(source, message, context),
    warn: (source: string, message: string, context?: Record<string, unknown>) => logger?.warning(source, message, context),
    error: (source: string, message: string, context?: Record<string, unknown>) => logger?.error(source, message, context)
  };

  // 捕获所有未处理的异常
  process.on("uncaughtException", (error) => {
    logger?.error("electron:main", "uncaughtException", {
      message: error.message,
      stack: error.stack
    });
  });

  // 捕获所有未处理的 Promise 拒绝
  process.on("unhandledRejection", (reason) => {
    logger?.error("electron:main", "unhandledRejection", {
      reason: typeof reason === "string" ? reason : JSON.stringify(reason)
    });
  });

  // 先注册 IPC，避免窗口初始渲染阶段 invoke 发生竞态
  registerIpcHandlers({
    getConsoleWindow: () => consoleWindow,
    getFloatingWindow: () => floatingWindow,
    getSuggestionWindow: () => suggestionWindow,
    sharedKG,
    logger,
    systemLogger
  });

  if (process.env.OVO_RUN_REAL30 === "1") {
    void runVerifyRealLogs()
      .then(() => {
        logger?.info("verify-real-logs", "真实场景验证完成");
        app.quit();
      })
      .catch((error) => {
        logger?.error("verify-real-logs", "真实场景验证失败", {
          error: error instanceof Error ? error.message : "unknown"
        });
        console.error(error);
        app.exit(1);
      });
    return;
  }

  createAllWindows();
  createTray();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createAllWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // Clean up resources before quitting
  if (logger) {
    logger.info("electron:main", "应用退出", { isDev });
  }
  // 关闭数据库连接
  sharedKG?.close();
});
