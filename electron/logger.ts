import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { loadElectron, getUserDataPath } from "./electron-loader.js";

type SystemLevel = "info" | "warning" | "error";

/**
 * P1-E: 异步缓冲写日志——避免 appendFileSync 阻塞主进程。
 * 每个日志文件维护一个内存 buffer，1 秒 flush 一次，或 buffer 超 64KB 立即 flush。
 * 进程退出时同步 flush，避免丢日志。
 */
const LOG_FLUSH_INTERVAL_MS = 1000;
const LOG_FLUSH_SIZE_THRESHOLD = 64 * 1024;
const buffers = new Map<string, string[]>();
const bufferSizes = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;
let exitHooksRegistered = false;

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flushAll, LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  if (!exitHooksRegistered) {
    exitHooksRegistered = true;
    // 进程退出时同步 flush，避免丢日志
    process.on("exit", flushAllSync);
    process.on("SIGINT", () => { flushAllSync(); process.exit(); });
    process.on("SIGTERM", () => { flushAllSync(); process.exit(); });
  }
}

function flushFile(filePath: string) {
  const lines = buffers.get(filePath);
  if (!lines || lines.length === 0) return;
  const data = lines.join("");
  buffers.set(filePath, []);
  bufferSizes.set(filePath, 0);
  // 异步写——失败不阻断主流程。但 logger 自身是底层模块，不能再回头调 errorLogger
  // （会循环依赖）。失败时往 stderr 倒一行，运维至少能在 launchd 日志里看到。
  fs.appendFile(filePath, data, "utf8", (err) => {
    if (err) {
      try {
        process.stderr.write(`[logger.flushFile-failed] ${filePath}: ${err.message}\n`);
      } catch { /* */ }
    }
  });
}

function flushAll() {
  for (const filePath of buffers.keys()) flushFile(filePath);
}

function flushAllSync() {
  for (const [filePath, lines] of buffers) {
    if (lines.length === 0) continue;
    try {
      fs.appendFileSync(filePath, lines.join(""), "utf8");
    } catch (e) {
      // 进程退出最后一刻：能落 stderr 就落 stderr，至少这一批 buffer 别静默丢
      try {
        const reason = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[logger.flushAllSync-failed] ${filePath}: ${reason}\n`);
      } catch { /* */ }
    }
    buffers.set(filePath, []);
    bufferSizes.set(filePath, 0);
  }
}

export function bufferedAppend(filePath: string, line: string) {
  ensureFlushTimer();
  let arr = buffers.get(filePath);
  if (!arr) {
    arr = [];
    buffers.set(filePath, arr);
    bufferSizes.set(filePath, 0);
  }
  arr.push(line);
  const size = (bufferSizes.get(filePath) ?? 0) + Buffer.byteLength(line, "utf8");
  bufferSizes.set(filePath, size);
  if (size >= LOG_FLUSH_SIZE_THRESHOLD) flushFile(filePath);
}

function broadcastLogStream(entry: { timestamp: number; level: SystemLevel; source: string; message: string; context: Record<string, unknown> }) {
  const electron = loadElectron();
  if (!electron?.BrowserWindow || typeof electron.BrowserWindow.getAllWindows !== "function") return;
  for (const win of electron.BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("log:stream", entry);
    } catch (e) {
      // 单窗口 webContents.send 失败是正常的（窗口正在 destroy 边缘态），
      // 不阻断其他窗口；落 stderr 留个尾巴，调试时能注意到
      try {
        const reason = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[logger.broadcast-skip-window] ${reason}\n`);
      } catch { /* */ }
    }
  }
}

export interface BusinessLogEntry {
  timestamp: number;
  pipelineId?: string;
  stage: string;
  status: "success" | "failed" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

interface LoggerOptions {
  /** 自定义日志目录（测试时使用） */
  logDir?: string;
  /** Knowledge Graph 实例 */
  kg?: KnowledgeGraphEngine;
}

export class Logger {
  private readonly logDir: string;
  private readonly systemLogPath: string;
  private readonly businessLogPath: string;
  private readonly kg?: KnowledgeGraphEngine;

  constructor(options: LoggerOptions = {}) {
    this.kg = options.kg;

    // 支持自定义日志目录（测试时使用）
    const userDataPath = options.logDir ?? this.getDefaultUserDataPath();
    this.logDir = path.join(userDataPath, "logs");
    fs.mkdirSync(this.logDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    this.systemLogPath = path.join(this.logDir, `system-${date}.log`);
    this.businessLogPath = path.join(this.logDir, `business-${date}.jsonl`);
  }

  private getDefaultUserDataPath() {
    return getUserDataPath();
  }

  /** 获取日志目录 */
  getLogDir() {
    return this.logDir;
  }

  // ==================== 系统日志 ====================

  private persistSystem(level: SystemLevel, source: string, message: string, context?: Record<string, unknown>) {
    const entry = {
      timestamp: Date.now(),
      level,
      source,
      message,
      context: context ?? {}
    };

    // 写入文件——异步缓冲，避免阻塞主进程
    bufferedAppend(this.systemLogPath, JSON.stringify(entry) + "\n");

    // 写入数据库（如果 KG 可用）
    if (this.kg) {
      try {
        this.kg.addSystemLog({
          level,
          source,
          message,
          context
        });
      } catch {
        /* ignore DB error */
      }
    }

    // 推送给所有渲染窗口（StatusPanel.LiveLogStream 订阅）
    broadcastLogStream(entry);
  }

  info(source: string, message: string, context?: Record<string, unknown>) {
    this.persistSystem("info", source, message, context);
  }

  warning(source: string, message: string, context?: Record<string, unknown>) {
    this.persistSystem("warning", source, message, context);
  }

  error(source: string, message: string, context?: Record<string, unknown>) {
    this.persistSystem("error", source, message, context);
  }

  // ==================== 业务日志 ====================

  logBusiness(entry: BusinessLogEntry) {
    // 写入 JSONL 文件——异步缓冲
    bufferedAppend(this.businessLogPath, JSON.stringify(entry) + "\n");

    // 写入数据库 business_logs（如果 KG 可用）
    if (this.kg && entry.pipelineId) {
      this.kg.addBusinessLog({
        pipelineId: entry.pipelineId,
        node: entry.stage,
        status: entry.status,
        input: entry.input,
        output: entry.output,
        error: entry.error,
        startTime: entry.timestamp,
        endTime: entry.timestamp + entry.durationMs
      });
    }
  }

  /** 便捷方法：记录业务阶段开始 */
  logStageStart(pipelineId: string | undefined, stage: string, input: Record<string, unknown>) {
    return {
      pipelineId,
      stage,
      input,
      startTime: Date.now()
    };
  }

  /** 便捷方法：记录业务阶段结束 */
  logStageEnd(
    startInfo: { pipelineId?: string; stage: string; input: Record<string, unknown>; startTime: number },
    output: Record<string, unknown>,
    status: "success" | "failed" | "skipped",
    error?: string
  ) {
    const durationMs = Date.now() - startInfo.startTime;
    this.logBusiness({
      timestamp: startInfo.startTime,
      pipelineId: startInfo.pipelineId,
      stage: startInfo.stage,
      status,
      input: startInfo.input,
      output,
      durationMs,
      error
    });
    return durationMs;
  }

  // ==================== 读取日志 ====================

  getSystemLogs(limit = 200) {
    if (!this.kg) return [];
    return this.kg.getSystemLogs(limit);
  }

  getBusinessLogs(limit = 100, pipelineId?: string) {
    if (!this.kg) return [];
    return this.kg.getBusinessLogs(limit, pipelineId);
  }

  /** 读取最近的业务日志文件行 */
  readBusinessLogs(lastLines = 100): string[] {
    try {
      if (!fs.existsSync(this.businessLogPath)) return [];
      const content = fs.readFileSync(this.businessLogPath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.slice(-lastLines);
    } catch {
      return [];
    }
  }

  /** 读取最近的系统日志文件行 */
  readSystemLogs(lastLines = 100): string[] {
    try {
      if (!fs.existsSync(this.systemLogPath)) return [];
      const content = fs.readFileSync(this.systemLogPath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.slice(-lastLines);
    } catch {
      return [];
    }
  }
}
