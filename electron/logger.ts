import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraphEngine } from "./knowledge-graph.js";

type SystemLevel = "info" | "warning" | "error";

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
    try {
      // 尝试使用 Electron 的 app.getPath（仅在 Electron 环境中有效）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require("electron");
      if (electron?.app?.getPath) {
        return electron.app.getPath("userData");
      }
    } catch {
      // Electron 不可用，使用当前目录
    }
    return process.cwd();
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

    // 写入文件
    fs.appendFileSync(this.systemLogPath, JSON.stringify(entry) + "\n", "utf8");

    // 写入数据库（如果 KG 可用）
    if (this.kg) {
      this.kg.addSystemLog({
        level,
        source,
        message,
        context
      });
    }
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
    // 写入 JSONL 文件
    fs.appendFileSync(this.businessLogPath, JSON.stringify(entry) + "\n", "utf8");

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
