import fs from "node:fs";
import path from "node:path";
import { loadElectron, getUserDataPath } from "./electron-loader.js";
import { bufferedAppend } from "./logger.js";

const MAX_LOG_SIZE = 500_000; // 500KB
const MAX_LOG_FILES = 5;

export type AlertLevel = "info" | "warn" | "error" | "critical";

export interface AlertEntry {
  level: AlertLevel;
  timestamp: string;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * 错误日志记录器 — 拦截主进程所有 console 输出和未捕获异常，
 * 写入滚动日志文件，供 renderer 端 StatusPanel 展示。
 * 并提供分级告警 API：info / warn / error / critical。
 */
export class ErrorLogger {
  private logPath: string | null = null;
  private entries: Array<{ level: string; timestamp: string; source: string; message: string }> = [];
  private alerts: AlertEntry[] = [];

  private getLogPath(): string {
    if (this.logPath) return this.logPath;
    const userData = getUserDataPath();
    const logDir = path.join(userData, "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "error.log");
    return this.logPath;
  }

  init() {
    // 拦截 console.error / console.warn
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: unknown[]) => {
      this.write("error", "console", args.map(String).join(" "));
      originalError.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      this.write("warn", "console", args.map(String).join(" "));
      originalWarn.apply(console, args);
    };

    // 未捕获异常
    process.on("uncaughtException", (error) => {
      this.write("error", "uncaughtException", error.stack ?? error.message);
    });

    // 未处理 Promise 拒绝
    process.on("unhandledRejection", (reason) => {
      this.write("error", "unhandledRejection", String(reason));
    });

    // 读取已有日志
    this.loadExisting();
  }

  write(level: string, source: string, message: string) {
    const entry = { level, timestamp: new Date().toISOString(), source, message };
    this.entries.push(entry);

    try {
      const line = JSON.stringify(entry) + "\n";
      const logPath = this.getLogPath();
      this.rotateIfNeeded();
      // P1-E: 异步缓冲写，避免每条 alert 都阻塞主进程
      bufferedAppend(logPath, line);
    } catch { /* 静默失败，不影响应用 */ }
  }

  getEntries(limit = 100) {
    return this.entries.slice(-limit);
  }

  getErrorCount() {
    return this.entries.filter((e) => e.level === "error").length;
  }

  alert(level: AlertLevel, source: string, message: string, context?: Record<string, unknown>) {
    const entry: AlertEntry = {
      level,
      timestamp: new Date().toISOString(),
      source,
      message,
      context
    };
    this.alerts.push(entry);
    // keep last 200 alerts in memory
    if (this.alerts.length > 200) {
      this.alerts = this.alerts.slice(-200);
    }
    // persist higher-severity alerts to the error log file
    if (level === "error" || level === "critical") {
      this.write(level, source, message);
    }
    // broadcast to renderer windows so StatusPanel can react in real time
    try {
      const electron = loadElectron();
      if (electron?.BrowserWindow) {
        for (const win of electron.BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue;
          win.webContents.send("alert:new", entry);
        }
      }
    } catch {
      /* ignore broadcast errors */
    }
  }

  getAlerts(limit = 50) {
    return this.alerts.slice(-limit);
  }

  private loadExisting() {
    const logPath = this.getLogPath();
    if (!fs.existsSync(logPath)) return;
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      this.entries = content
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean)
        .slice(-200); // 只保留最近 200 条
    } catch { /* ignore */ }
  }

  private rotateIfNeeded() {
    const logPath = this.getLogPath();
    if (!fs.existsSync(logPath)) return;
    const stats = fs.statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // 滚动: error.log.4 -> error.log.5, ..., error.log -> error.log.1
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      if (fs.existsSync(from)) {
        try { fs.renameSync(from, to); } catch { /* ignore */ }
      }
    }
    fs.renameSync(logPath, `${logPath}.1`);
  }
}

export const errorLogger = new ErrorLogger();
