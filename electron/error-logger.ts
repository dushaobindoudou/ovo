import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_LOG_SIZE = 500_000; // 500KB
const MAX_LOG_FILES = 5;

/**
 * 错误日志记录器 — 拦截主进程所有 console 输出和未捕获异常，
 * 写入滚动日志文件，供 renderer 端 StatusPanel 展示。
 */
export class ErrorLogger {
  private logPath: string;
  private entries: Array<{ level: string; timestamp: string; source: string; message: string }> = [];

  constructor() {
    const userData = app.getPath("userData");
    const logDir = path.join(userData, "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "error.log");
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

    // 追加写入文件
    try {
      const line = JSON.stringify(entry) + "\n";
      this.rotateIfNeeded();
      fs.appendFileSync(this.logPath, line, "utf-8");
    } catch { /* 静默失败，不影响应用 */ }
  }

  getEntries(limit = 100) {
    return this.entries.slice(-limit);
  }

  getErrorCount() {
    return this.entries.filter((e) => e.level === "error").length;
  }

  private loadExisting() {
    if (!fs.existsSync(this.logPath)) return;
    try {
      const content = fs.readFileSync(this.logPath, "utf-8");
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
    if (!fs.existsSync(this.logPath)) return;
    const stats = fs.statSync(this.logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // 滚动: error.log.4 -> error.log.5, ..., error.log -> error.log.1
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${this.logPath}.${i}`;
      const to = `${this.logPath}.${i + 1}`;
      if (fs.existsSync(from)) {
        try { fs.renameSync(from, to); } catch { /* ignore */ }
      }
    }
    fs.renameSync(this.logPath, `${this.logPath}.1`);
  }
}

export const errorLogger = new ErrorLogger();
