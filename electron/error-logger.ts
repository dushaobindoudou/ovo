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
 * C2: 单条 errorLogger 自己 write 失败时丢进这个队列——
 *   它是 ovo 整个错误处理的"最后一名守卫"，吞错了就真的没人知道了。
 *   双层兜底：先尝试 process.stderr.write 让 launchd / 终端能看到；
 *   并把最近 10 条丢失写入按内存保留，主控台 `errorLogger.getLastFailedWrites()` 可查询。
 */
const MAX_FAILED_WRITES_QUEUE = 10;

/**
 * 错误日志记录器 — 拦截主进程所有 console 输出和未捕获异常，
 * 写入滚动日志文件，供 renderer 端 StatusPanel 展示。
 * 并提供分级告警 API：info / warn / error / critical。
 */
export class ErrorLogger {
  private logPath: string | null = null;
  private entries: Array<{ level: string; timestamp: string; source: string; message: string }> = [];
  private alerts: AlertEntry[] = [];
  /** C2: 文件写失败时的最近 N 条 fallback 记录（FIFO，环形） */
  private lastFailedWrites: Array<{
    timestamp: string;
    level: string;
    source: string;
    message: string;
    reason: string;
  }> = [];

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
    } catch (writeErr) {
      // C2: errorLogger 是最后一道防线。文件写失败时**不能**静默——
      //   1) 至少把这一条往 stderr 倒，让 launchd / 控制台能抓到
      //   2) 进内存队列，主控台「写入失败诊断」面板可见
      // stderr 本身也炸（极少见，比如 fd 被关）就只能彻底吞了——但至少试过。
      const reason = writeErr instanceof Error ? writeErr.message : String(writeErr);
      try {
        process.stderr.write(`[errorLogger.write-failed] ${reason} :: ${JSON.stringify(entry)}\n`);
      } catch { /* 真没救了 */ }
      this.lastFailedWrites.push({ ...entry, reason });
      if (this.lastFailedWrites.length > MAX_FAILED_WRITES_QUEUE) {
        this.lastFailedWrites = this.lastFailedWrites.slice(-MAX_FAILED_WRITES_QUEUE);
      }
    }
  }

  /** C2: 主控台/诊断面板查最近 N 条写入失败的告警 */
  getLastFailedWrites() {
    return [...this.lastFailedWrites];
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
          // 单行 parse 失败是正常的（半截写入 / 已 rotate），这一行丢弃即可
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean)
        .slice(-200); // 只保留最近 200 条
    } catch (e) {
      // 读历史日志失败不阻断启动——往 stderr 倒一条提示，运维能注意到
      try {
        const reason = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[errorLogger.loadExisting-failed] ${reason}\n`);
      } catch { /* */ }
    }
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
        try {
          fs.renameSync(from, to);
        } catch (e) {
          // 单个旧文件 rename 失败不阻断 rotation——最新的 logPath -> .1 还能成功
          try {
            const reason = e instanceof Error ? e.message : String(e);
            process.stderr.write(`[errorLogger.rotate-failed] ${from} -> ${to}: ${reason}\n`);
          } catch { /* */ }
        }
      }
    }
    fs.renameSync(logPath, `${logPath}.1`);
  }
}

export const errorLogger = new ErrorLogger();
