import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";

type SystemLevel = "info" | "warning" | "error";

export class SystemLogger {
  private readonly logFilePath: string;
  private attached = new WeakSet<BrowserWindow>();

  constructor(private readonly kg: KnowledgeGraphEngine) {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    this.logFilePath = path.join(logDir, "system.log");
  }

  private persist(level: SystemLevel, source: string, message: string, context?: Record<string, unknown>) {
    const entry = {
      timestamp: Date.now(),
      level,
      source,
      message,
      context: context ?? {}
    };
    fs.appendFileSync(this.logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
    this.kg.addSystemLog({
      level,
      source,
      message,
      context
    });
  }

  info(source: string, message: string, context?: Record<string, unknown>) {
    this.persist("info", source, message, context);
  }

  warn(source: string, message: string, context?: Record<string, unknown>) {
    this.persist("warning", source, message, context);
  }

  error(source: string, message: string, context?: Record<string, unknown>) {
    this.persist("error", source, message, context);
  }

  captureWindowLogs(win: BrowserWindow, windowName: string) {
    if (this.attached.has(win)) return;
    this.attached.add(win);

    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const lv: SystemLevel = level >= 3 ? "error" : level === 2 ? "warning" : "info";
      this.persist(lv, `renderer:${windowName}`, message, {
        line,
        sourceId
      });
    });

    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      this.error(`renderer:${windowName}`, "页面加载失败", {
        errorCode,
        errorDescription,
        validatedURL
      });
    });

    win.webContents.on("render-process-gone", (_event, details) => {
      this.error(`renderer:${windowName}`, "渲染进程退出", {
        reason: details.reason,
        exitCode: details.exitCode
      });
    });

    win.on("unresponsive", () => {
      this.warn(`renderer:${windowName}`, "窗口无响应");
    });
    win.on("responsive", () => {
      this.info(`renderer:${windowName}`, "窗口恢复响应");
    });
  }
}

