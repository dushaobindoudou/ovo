import type { ActionType, AgentAction } from "./types.js";
import { AgentBridge } from "./agent-bridge.js";
import { planAndExecuteAction } from "./agent-executor.js";
import type { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { loadElectron } from "./electron-loader.js";
import {
  createReminder,
  createCalendarEvent,
  sendIMessage,
  createMailDraft,
  openUrl,
  searchWeb
} from "./macos-actions.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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
      return {
        actionId: action.id,
        type,
        status: "failed",
        output: "",
        duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async executeBatch(actions: AgentAction[], ctx: ActionExecutionContext = {}): Promise<ActionResult[]> {
    const ordered = [...actions].sort((a, b) => b.priority - a.priority);
    const results: ActionResult[] = [];
    for (const action of ordered) {
      // 硬性「不打扰」白名单：任何可能抢占屏幕/外发数据/调用系统应用的动作一律 pending，
      // 即便 LLM 把 requireConfirm 写成了 false 也不放行。
      // 自动执行只允许：日志归档、TODO、剪贴板（用户可见的轻量本地操作）
      const needsConfirm = action.requireConfirm || !ActionExecutor.canAutoExecute(action.type);
      if (needsConfirm) {
        results.push({
          actionId: action.id,
          type: action.type,
          status: "pending",
          output: "等待用户确认",
          duration: 0
        });
        continue;
      }
      results.push(await this.execute(action, ctx));
    }
    return results;
  }

  /** 安全自动执行白名单：只有这几类动作可以在没有用户确认的情况下静默执行 */
  static canAutoExecute(type?: ActionType): boolean {
    return type === "log_note" || type === "create_todo" || type === "copy_to_clipboard";
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
      try {
        this.kg.addEvent({
          appName: ctx.appName,
          windowTitle: ctx.windowTitle ?? "",
          content: `[TODO] ${title}${dueAt ? `（@${dueAt}）` : ""}`,
          summary: title,
          intent: "create_todo",
          sourceWindowId: ctx.windowId ?? "",
          entityIds: []
        });
      } catch { /* swallow */ }
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
    } catch { /* swallow */ }
    return {
      actionId: action.id,
      type: "copy_to_clipboard",
      status: "success",
      output: JSON.stringify({ length: text.length }),
      duration: Date.now() - started
    };
  }

  // ---- M3 macOS 原生动作 ----

  private async handleSetReminder(action: AgentAction, started: number): Promise<ActionResult> {
    const title = String(action.params?.title ?? action.description ?? "");
    const dueAt = action.params?.dueAt ? String(action.params.dueAt) : undefined;
    try {
      await createReminder({ title, dueAt });
      return {
        actionId: action.id, type: "set_reminder", status: "success",
        output: JSON.stringify({ title, dueAt }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "set_reminder", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleAddCalendar(action: AgentAction, started: number): Promise<ActionResult> {
    const title = String(action.params?.title ?? action.description ?? "");
    const startsAt = String(action.params?.startsAt ?? "");
    if (!startsAt) {
      return {
        actionId: action.id, type: "add_calendar", status: "failed",
        output: "", duration: Date.now() - started, error: "缺少 startsAt"
      };
    }
    try {
      await createCalendarEvent({
        title,
        startsAt,
        endsAt: action.params?.endsAt ? String(action.params.endsAt) : undefined,
        location: action.params?.location ? String(action.params.location) : undefined
      });
      return {
        actionId: action.id, type: "add_calendar", status: "success",
        output: JSON.stringify({ title, startsAt }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "add_calendar", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleSendIMessage(action: AgentAction, started: number): Promise<ActionResult> {
    const to = String(action.params?.to ?? "");
    const body = String(action.params?.body ?? "");
    if (!to || !body) {
      return {
        actionId: action.id, type: "send_imessage", status: "failed",
        output: "", duration: Date.now() - started, error: "缺少 to 或 body"
      };
    }
    try {
      await sendIMessage({ to, body });
      return {
        actionId: action.id, type: "send_imessage", status: "success",
        output: JSON.stringify({ to, length: body.length }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "send_imessage", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleSendEmail(action: AgentAction, started: number): Promise<ActionResult> {
    try {
      await createMailDraft({
        to: action.params?.to ? String(action.params.to) : undefined,
        subject: action.params?.subject ? String(action.params.subject) : undefined,
        body: action.params?.body ? String(action.params.body) : undefined
      });
      return {
        actionId: action.id, type: "send_email", status: "success",
        output: JSON.stringify({ draftCreated: true }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "send_email", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleOpenUrl(action: AgentAction, started: number): Promise<ActionResult> {
    const url = String(action.params?.url ?? "");
    if (!url) {
      return {
        actionId: action.id, type: "open_url", status: "failed",
        output: "", duration: Date.now() - started, error: "缺少 url"
      };
    }
    try {
      await openUrl(url);
      return {
        actionId: action.id, type: "open_url", status: "success",
        output: JSON.stringify({ url }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "open_url", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleSearchWeb(action: AgentAction, started: number): Promise<ActionResult> {
    const query = String(action.params?.query ?? "");
    const target = action.params?.target ? String(action.params.target) : undefined;
    if (!query) {
      return {
        actionId: action.id, type: "search_web", status: "failed",
        output: "", duration: Date.now() - started, error: "缺少 query"
      };
    }
    try {
      await searchWeb(query, target);
      return {
        actionId: action.id, type: "search_web", status: "success",
        output: JSON.stringify({ query, target: target ?? "google" }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "search_web", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * M5 配套：按需扫描某个目录的元数据。requireConfirm=true 由用户授权后才走到这。
   * 上限 maxFiles 默认 200；不读文件内容；不递归整个 home。
   */
  private async handleIndexPath(action: AgentAction, ctx: ActionExecutionContext, started: number): Promise<ActionResult> {
    const rawPath = String(action.params?.path ?? "");
    const recursive = !!action.params?.recursive;
    const maxFiles = Math.max(1, Math.min(1000, Number(action.params?.maxFiles) || 200));
    if (!rawPath) {
      return {
        actionId: action.id, type: "index_path", status: "failed",
        output: "", duration: Date.now() - started, error: "缺少 path"
      };
    }
    const expanded = rawPath.startsWith("~")
      ? path.join(os.homedir(), rawPath.slice(1))
      : rawPath;
    // 安全：拒绝扫整个 home 或根
    const home = os.homedir();
    if (expanded === home || expanded === "/" || expanded.length < 4) {
      return {
        actionId: action.id, type: "index_path", status: "failed",
        output: "", duration: Date.now() - started, error: "拒绝扫描根目录或 home，请指定子目录"
      };
    }
    try {
      const files: Array<{ path: string; ext: string; size: number; mtime: number }> = [];
      const walk = async (dir: string, depth: number) => {
        if (files.length >= maxFiles) return;
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const ent of entries) {
          if (files.length >= maxFiles) break;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (recursive && depth < 3) await walk(full, depth + 1);
          } else if (ent.isFile()) {
            const stat = await fs.stat(full).catch(() => null);
            if (!stat) continue;
            files.push({
              path: full,
              ext: path.extname(ent.name).slice(1).toLowerCase(),
              size: stat.size,
              mtime: stat.mtimeMs
            });
          }
        }
      };
      await walk(expanded, 0);
      // 登记到 KG
      let added = 0;
      if (this.kg) {
        for (const f of files) {
          try {
            this.kg.upsertEntity({
              name: f.path,
              type: "application_file",
              description: `${f.ext.toUpperCase() || "file"} · ${(f.size / 1024).toFixed(1)} KB`,
              attributes: { path: f.path, ext: f.ext, size: f.size, mtime: f.mtime, lastSeenAppName: ctx.appName ?? "" }
            });
            added += 1;
          } catch { /* swallow */ }
        }
      }
      return {
        actionId: action.id, type: "index_path", status: "success",
        output: JSON.stringify({ scanned: files.length, indexed: added, dir: expanded, recursive, maxFiles }),
        duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "index_path", status: "failed",
        output: "", duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
