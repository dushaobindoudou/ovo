import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { Logger } from "./logger.js";
import { runVerifyRealLogs } from "./verify-real-logs.js";

let consoleWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let suggestionWindow: BrowserWindow | null = null;
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
  logger = new Logger(sharedKG);
  logger.info("electron:main", "应用启动", { isDev });

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
