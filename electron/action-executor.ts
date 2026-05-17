import type { ActionType, AgentAction } from "./types.js";
import { AgentBridge } from "./agent-bridge.js";
import { planAndExecuteAction } from "./agent-executor.js";
import type { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { loadElectron } from "./electron-loader.js";
import { preferencesStore } from "./preferences-store.js";
import type { TrustLevel } from "./preferences-store.js";
import { safeExecute } from "./safe-execute.js";

export interface ActionResult {
  actionId: string;
  type?: ActionType;
  status: "success" | "failed" | "cancelled" | "timeout" | "pending";
  output: string;
  duration: number;
  error?: string;
}

interface ActionExecutionContext {
  /** 当前 pipeline 关联的应用，用于 log_note 写记忆事件时附 source */
  appName?: string;
  windowTitle?: string;
  windowId?: string;
  intent?: string;
}

export class ActionExecutor {
  constructor(
    private readonly agentBridge: AgentBridge,
    private readonly kg?: KnowledgeGraphEngine
  ) {}

  async execute(action: AgentAction, ctx: ActionExecutionContext = {}): Promise<ActionResult> {
    const started = Date.now();
    const type = action.type ?? "other";
    try {
      // AX-1 路由策略：
      //   本地快路径 (零延迟、纯本地、绝对安全)：log_note / create_todo / copy_to_clipboard
      //   Agent 路径 (LLM 规划 + 安全 op 执行)：其他所有 action
      //
      // 这把"硬编码 handler 一对一对应 action.type"的旧架构退役，
      // 加新动作不用改代码，prompt 里描述清楚就行。
      if (type === "log_note") return this.handleLogNote(action, ctx, started);
      if (type === "create_todo") return this.handleCreateTodo(action, ctx, started);
      if (type === "copy_to_clipboard") return this.handleCopyToClipboard(action, started);

      // 其他全走 agent 路径
      const result = await planAndExecuteAction(action, this.agentBridge);
      const summary = result.plan?.summary ?? "";
      const opLines = result.ops.map((o) => `[${o.kind}] ${o.ok ? "✓" : "✗"} ${o.output || o.error || ""}`);
      const output = JSON.stringify({
        summary,
        confidence: result.plan?.confidence,
        ops: result.ops,
        durationMs: result.durationMs
      });
      if (!result.ok) {
        return {
          actionId: action.id,
          type,
          status: "failed",
          output,
          duration: Date.now() - started,
          error: result.error ?? opLines.find((l) => l.includes("✗")) ?? "执行失败"
        };
      }
      return {
        actionId: action.id,
        type,
        status: "success",
        output,
        duration: Date.now() - started
      };
    } catch (error) {
      // P1.25: 失败时也填 output，让 UI 能在 PipelineDetail 看到"尝试了什么 + 走到哪一步"
      const attemptContext = {
        attempt: type,
        description: action.description,
        paramKeys: Object.keys(action.params ?? {}),
        ctx: { appName: ctx.appName, windowTitle: ctx.windowTitle, intent: ctx.intent }
      };
      return {
        actionId: action.id,
        type,
        status: "failed",
        output: JSON.stringify(attemptContext),
        duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async executeBatch(actions: AgentAction[], ctx: ActionExecutionContext = {}): Promise<ActionResult[]> {
    const ordered = [...actions].sort((a, b) => b.priority - a.priority);
    const results: ActionResult[] = [];
    for (const action of ordered) {
      // P0.3 / P0.10 信任分级：
      //   Lv.0/1/2 → pending（仅展示 / 草拟 / 一键确认）
      //   Lv.3/4   → 立即执行（撤销窗口由 UI 层 T10 实现）
      //   LLM 标记 requireConfirm=true 仍然尊重——这是 LLM 的"我自己也不确定"信号
      const trustLevel = preferencesStore.getTrustLevel(action.type ?? "other");
      const needsConfirm = action.requireConfirm === true || trustLevel < 3;
      if (needsConfirm) {
        results.push({
          actionId: action.id,
          type: action.type,
          status: "pending",
          output: trustLevel === 0
            ? "仅展示（你的信任级别设为 Lv.0）"
            : trustLevel === 1
            ? "已为你准备好草稿"
            : "等待用户确认",
          duration: 0
        });
        continue;
      }
      results.push(await this.execute(action, ctx));
    }
    return results;
  }

  /**
   * 兼容性 helper —— 旧代码可能仍引用 canAutoExecute；现已委托给信任分级。
   * @deprecated 直接读 preferencesStore.getTrustLevel() 更清晰
   */
  static canAutoExecute(type?: ActionType): boolean {
    const t = type ?? "other";
    return preferencesStore.getTrustLevel(t) >= 3;
  }

  /** UI 层查询：当前 action 的 trust level（决定 pending 卡片显示文案） */
  static getTrustLevel(type?: ActionType): TrustLevel {
    return preferencesStore.getTrustLevel(type ?? "other");
  }

  // ---- 本地动作处理 ----
  // 注意：AX-1 后只有 log_note / create_todo / copy_to_clipboard 真的被调用。
  // set_reminder / add_calendar / send_imessage / send_email / open_url / search_web / index_path
  // 这些 handler 已**退役**，全部改走 agent-executor.planAndExecuteAction()。
  // 保留代码作为应急回滚参考；下次重构周期可以删。

  private handleLogNote(action: AgentAction, ctx: ActionExecutionContext, started: number): ActionResult {
    const summary = String(action.params?.summary ?? action.description ?? "");
    const tags = Array.isArray(action.params?.tags)
      ? (action.params.tags as unknown[]).map((t) => String(t))
      : ["log"];
    if (this.kg && ctx.appName) {
      try {
        this.kg.addEvent({
          appName: ctx.appName,
          windowTitle: ctx.windowTitle ?? "",
          content: summary || "(空)",
          summary,
          intent: ctx.intent ?? "log_note",
          sourceWindowId: ctx.windowId ?? "",
          entityIds: []
        });
      } catch (error) {
        return {
          actionId: action.id,
          type: "log_note",
          status: "failed",
          output: "",
          duration: Date.now() - started,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    return {
      actionId: action.id,
      type: "log_note",
      status: "success",
      output: JSON.stringify({ summary, tags }),
      duration: Date.now() - started
    };
  }

  private handleCreateTodo(action: AgentAction, ctx: ActionExecutionContext, started: number): ActionResult {
    const title = String(action.params?.title ?? action.description ?? "");
    const priority = String(action.params?.priority ?? "medium");
    const dueAt = String(action.params?.dueAt ?? "");
    // todo 暂时落到 KG event 表（importance=6, tag=todo），后续可拓展专表
    if (this.kg && ctx.appName) {
      safeExecute(() => {
        this.kg!.addEvent({
          appName: ctx.appName!,
          windowTitle: ctx.windowTitle ?? "",
          content: `[TODO] ${title}${dueAt ? `（@${dueAt}）` : ""}`,
          summary: title,
          intent: "create_todo",
          sourceWindowId: ctx.windowId ?? "",
          entityIds: []
        });
      }, "action.create-todo.kg-write", undefined, "warn");
    }
    return {
      actionId: action.id,
      type: "create_todo",
      status: "success",
      output: JSON.stringify({ title, priority, dueAt }),
      duration: Date.now() - started
    };
  }

  private handleCopyToClipboard(action: AgentAction, started: number): ActionResult {
    const text = String(action.params?.text ?? "");
    try {
      const electron = loadElectron();
      electron?.clipboard?.writeText?.(text);
    } catch {
      // 剪贴板失败不影响主流程，silently degrade
    }
    return {
      actionId: action.id,
      type: "copy_to_clipboard",
      status: "success",
      output: JSON.stringify({ length: text.length }),
      duration: Date.now() - started
    };
  }

  // C3 死代码已删除（2026-05-17）—— 7 个 handler 自从 AX-1 路由架构上线后就没人调用，
  // 全部走 planAndExecuteAction。当时注释说"保留作为应急回滚参考"，但实际上：
  //   - 旧 handler 不再过 SEC-1/2/3 的 osascript-argv 防注入
  //   - 旧 handler 不走 SEC-2 的 scheme 白名单
  // 留着反而是安全后门。如需回滚，从 git history 取即可（pre-action-executor-retire）。
}
