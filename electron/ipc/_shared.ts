/**
 * IPC handler 子模块共享类型 & 工具——把 ipc-handlers.ts 内部依赖
 * 收敛到一个公共接口，让各域 handler 可以拆到独立文件。
 *
 * BUG_REPORT A1 / REVIEW CODE-11: registerIpcHandlers 1670 行 → 拆按域
 *
 * 设计：
 *   IpcHandlerDeps —— 各 register*Handlers 函数都接它，里面装好所有跨模块依赖
 *                     （引擎实例 + 主进程业务函数 + 选项回调）
 *   safeHandle / withConfirmHandshake / makeSafeIpcMain 等仍在 ipc-handlers.ts 主文件
 *   定义；子模块从这里 import 类型，避免循环。
 */
import type { BrowserWindow } from "electron";
import type { ZodType } from "zod";
import type { AgentBridge } from "../agent-bridge.js";
import type { ActionExecutor, ActionResult } from "../action-executor.js";
import type { AutoCaptureService } from "../auto-capture.js";
import type { ClaudeCodeTester } from "../claude-code-tester.js";
import type { EventProcessor } from "../event-processor.js";
import type { FeedbackEngine } from "../feedback-engine.js";
import type { KnowledgeGraphEngine } from "../knowledge-graph.js";
import type { Logger } from "../logger.js";
import type { OCREngine } from "../ocr-engine.js";
import type { PersonalityAnalyzer } from "../personality-analyzer.js";
import type { PipelineLogger } from "../pipeline-logger.js";
import type { ScreenshotManager } from "../screenshot.js";
import type { SuggestionEngine } from "../suggestion-engine.js";
import type { TTSEngine } from "../tts-engine.js";
import type { WindowManager } from "../window-manager.js";
import type { AgentAction, AgentSuggestion } from "../types.js";

/** ipcMain 经过 makeSafeIpcMain 包装后的代理实例（dev reload 幂等） */
export type SafeIpcMain = ReturnType<typeof import("electron").ipcMain extends infer T
  ? T extends typeof import("electron").ipcMain ? () => T : never
  : never> extends () => infer R ? R : typeof import("electron").ipcMain;

/** SEC-16 / C4: safeHandle 签名——子模块共享 */
export type SafeHandleFn = <TPayload, TResult>(
  channel: string,
  schema: ZodType<TPayload>,
  fn: (payload: TPayload) => TResult | Promise<TResult>
) => void;

/** 主进程业务日志器统一接口（systemLogger）——避免 undefined 散落各 handler */
export interface LogSystemFn {
  (level: "info" | "warning" | "error", source: string, message: string, context?: Record<string, unknown>): void;
}

/** 健康检查内部配置（health:* handler 与 scheduler 都要读写） */
export interface HealthConfig {
  enabled: boolean;
  intervalSeconds: number;
}

/** 主进程 ipc-handlers.ts 入口的 options（外部调用方传入），保留原签名 */
export interface WindowGetterOptions {
  getConsoleWindow: () => BrowserWindow | null;
  getFloatingWindow: () => BrowserWindow | null;
  getSuggestionWindow: () => BrowserWindow | null;
  sharedKG?: KnowledgeGraphEngine;
  logger?: Logger;
  systemLogger?: {
    info: (source: string, message: string, context?: Record<string, unknown>) => void;
    warn: (source: string, message: string, context?: Record<string, unknown>) => void;
    error: (source: string, message: string, context?: Record<string, unknown>) => void;
  };
  onSuggestions?: (suggestions: AgentSuggestion[]) => void;
  onReceipts?: (receipts: AgentSuggestion[]) => void;
  toastManager?: {
    setVerbosity: (v: "silent" | "alerts" | "all") => void;
    noteRejection?: (type: string) => void;
    setDoNotDisturb?: (minutes: number) => void;
    enqueueReceipts?: (receipts: AgentSuggestion[]) => void;
    /** 可执行动作 toast（执行/忽略） */
    enqueueActions?: (actions: AgentAction[], pipelineId: string) => void;
  };
}

/** 子模块共享的依赖包。registerIpcHandlers 主入口装配，分发给各域模块。 */
export interface IpcHandlerDeps {
  ipcMain: SafeIpcMain;
  safeHandle: SafeHandleFn;
  kg: KnowledgeGraphEngine;
  agentBridge: AgentBridge;
  actionExecutor: ActionExecutor;
  feedbackEngine: FeedbackEngine;
  personalityAnalyzer: PersonalityAnalyzer;
  ttsEngine: TTSEngine;
  ocrEngine: OCREngine;
  eventProcessor: EventProcessor;
  windowManager: WindowManager;
  screenshotManager: ScreenshotManager;
  suggestionEngine: SuggestionEngine;
  pipelineLogger: PipelineLogger;
  claudeTester: ClaudeCodeTester;
  autoCaptureService: AutoCaptureService;
  options: WindowGetterOptions;
  logSystem: LogSystemFn;
  broadcast: (channel: string, payload: unknown) => void;
  /** 用 startBizNode + finishBizNode 替代 kg.addBusinessLog/updateBusinessLog 的直接调用 */
  startBizNode: (
    pipelineId: string | null | undefined,
    node: string,
    input?: unknown,
    meta?: Record<string, unknown>
  ) => string;
  finishBizNode: (
    bizLogId: string,
    status: "success" | "failed" | "skipped" | "cancelled",
    payload?: { output?: unknown; error?: string; meta?: Record<string, unknown> }
  ) => boolean;
  /** SEC-11 pending action registry 操作（renderer 永远不直接持有 action 对象） */
  consumePendingAction: (actionId: string) => { action: AgentAction; pipelineId?: string } | null;
  /** 注册一条 pending action（R2-1: 草稿 promote 时把 send 类路由到确认而非直执行） */
  registerPendingAction: (action: AgentAction, pipelineId?: string) => void;
  /** P4: 把成功执行的 action 转成回执 toast */
  buildActionReceipts: (actions: AgentAction[], results: ActionResult[]) => AgentSuggestion[];
  /** pipeline action stage merge——action:confirm / action:cancel 都要回写 pipeline */
  mergePipelineAction: (pipelineId: string, actionId: string, result: ActionResult) => void;
  /** floating:* 渲染端推送 */
  pushFloatingState: () => void;
  /** floating:set-expanded 用——内部状态 */
  floatingDragState: { start: { x: number; y: number } | null };
  /** dev:* 仅 dev 模式开放——主入口决定一次 */
  isDevMode: boolean;
  /** capture:get/set-agent-interval 与 scheduler 共享的可变变量 */
  getAgentIntervalSeconds: () => number;
  setAgentIntervalSeconds: (s: number) => void;
  /** health:* handler 与 scheduler 共享的健康配置 */
  healthConfig: HealthConfig;
  getLatestHealth: () => unknown;
  setLatestHealth: (v: unknown) => void;
  /** dev:run-sample-pipeline 触发 → 复用主入口的 runAgentPipelineOnce */
  runAgentPipelineOnce: () => Promise<void>;
  /** prompt-eval:run-now 触发 → 复用主入口的 runPromptSelfEval */
  runPromptSelfEval: () => Promise<void>;
}
