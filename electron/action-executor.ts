import type { ActionType, AgentAction } from "./types.js";
import { AgentBridge } from "./agent-bridge.js";
import { planAndExecuteAction } from "./agent-executor.js";
import type { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { loadElectron } from "./electron-loader.js";
import { preferencesStore } from "./preferences-store.js";
import type { TrustLevel } from "./preferences-store.js";
import { safeExecute } from "./safe-execute.js";
import { groundEvidence, type GroundingContext, type GroundingResult } from "./evidence-grounder.js";
import {
  createReminder,
  createCalendarEvent,
  sendIMessage,
  createMailDraft,
  openUrl,
  searchWeb
} from "./macos-actions.js";

export interface ActionResult {
  actionId: string;
  type?: ActionType;
  /**
   * 状态扩展：drafted 表示该 action 因 evidence 验证未通过，落到了草稿台，没真执行。
   * rejected 表示 speculative 直接被拒，没进任何执行流。
   */
  status: "success" | "failed" | "cancelled" | "timeout" | "pending" | "drafted" | "rejected";
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
  /** 反思 #2 草稿台：grounding 时用到的 OCR 摘录（脱敏后） */
  ocrPreview?: string;
  /** 反思 #2 草稿台：当前 pipeline id，用于草稿落库时关联 */
  pipelineId?: string;
}

export class ActionExecutor {
  constructor(
    private readonly agentBridge: AgentBridge,
    private readonly kg?: KnowledgeGraphEngine
  ) {}

  // R4-2: 最近一次自动复制的"撤销快照"——存复制前的旧剪贴板，供回执 toast 在窗口内恢复。
  private lastClipboardUndo: { actionId: string; prev: string; at: number } | null = null;

  /** R4-2: 撤销最近一次剪贴板复制——把剪贴板恢复成复制前的内容。30s 内有效。 */
  undoClipboard(actionId: string): { ok: boolean } {
    const u = this.lastClipboardUndo;
    if (!u || u.actionId !== actionId || Date.now() - u.at > 30_000) return { ok: false };
    try {
      const electron = loadElectron();
      electron?.clipboard?.writeText?.(u.prev);
      this.lastClipboardUndo = null;
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async execute(action: AgentAction, ctx: ActionExecutionContext = {}): Promise<ActionResult> {
    const started = Date.now();
    const type = action.type ?? "other";

    // 反思 #2 核心入口检查：evidence_level 分流
    //   speculative → 拒绝执行（应转 suggestion）
    //   inferred + unverified → 落草稿台
    //   inferred + grounded / direct → 走原有执行路径
    //
    // 注意：requireConfirm 路径不在此处分流（pending 等用户确认的 action 由用户主动
    // 触发，意图明确，可视为 direct）。本入口只过滤 Ovo 主动决定立即执行的 action。
    const gating = this.gateByEvidence(action, ctx);
    if (gating) return gating;

    try {
      // 路由策略（2026-05-17 重要修正）：
      //   v1 (本地快路径，零依赖)：log_note / create_todo / copy_to_clipboard
      //     → 直接读写 KG / 系统剪贴板，不调外部命令
      //
      //   v2 (macOS 原生 action，走 osascript on run argv 防注入)：
      //     set_reminder / add_calendar / send_imessage / send_email / open_url / search_web
      //     → 直接调 macos-actions.ts（SEC-1/2/3 已通过 argv 防注入加固）
      //     → 不依赖 cloud LLM / 不依赖 hermes claude 命令
      //     → 用户没配 LLM 也能用基础操作
      //
      //   v3 (Agent 路径，LLM 规划 + 安全 op 执行)：other / index_path / 其他未识别
      //     → 需要 LLM 推理才能完成的复杂任务
      //
      // 这个三层路由比"一切走 LLM"更稳健：用户基础操作永远可用，LLM 只用于复杂规划。
      if (type === "log_note") return this.handleLogNote(action, ctx, started);
      if (type === "create_todo") return this.handleCreateTodo(action, ctx, started);
      if (type === "copy_to_clipboard") return this.handleCopyToClipboard(action, started);
      if (type === "set_reminder") return await this.handleSetReminder(action, started);
      if (type === "add_calendar") return await this.handleAddCalendar(action, started);
      if (type === "send_imessage") return await this.handleSendIMessage(action, started);
      if (type === "send_email") return await this.handleSendEmail(action, started);
      if (type === "open_url") return await this.handleOpenUrl(action, started);
      if (type === "search_web") return await this.handleSearchWeb(action, started);

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

  /**
   * 反思 #2 核心：evidence-level 分流入口。
   *
   * 返回 null = 通过验证，继续走原执行路径；
   * 返回 ActionResult = 已分流（drafted / rejected），调用方应该立刻 return。
   */
  private gateByEvidence(action: AgentAction, ctx: ActionExecutionContext): ActionResult | null {
    // 用户主动确认的 action（走 action:confirm IPC 那条路）不走本入口分流。
    // 这里只过滤 Ovo 自己决定立即执行的 action。requireConfirm=true 的 action
    // 应该走 pending 路径，不会调到 execute()，所以这里不用排除。
    const groundingCtx: GroundingContext = {
      ocrPreview: ctx.ocrPreview,
      windowTitle: ctx.windowTitle,
      appName: ctx.appName
    };
    const gr: GroundingResult = groundEvidence(action.evidence_level, action.evidence, groundingCtx);

    if (gr.status === "grounded") return null;

    if (gr.status === "rejected") {
      // speculative：直接拒绝，记入 system_log 便于反向校准。
      // 注意：rejected **不是错误**，是 Ovo 的产品决策（没有具体屏幕证据就不主动出手），
      // 因此 ActionResult.error 留空，避免 UI 把它当 error 渲染成红框。
      // 状态语义放在 output 里，UI 根据 status="rejected" 友好展示。
      try {
        this.kg?.addSystemLog?.({
          level: "info",
          source: "evidence.rejected",
          message: "未执行（证据不足 / LLM 自报 speculative）",
          context: {
            actionId: action.id, actionType: action.type, description: action.description,
            reason: gr.reason
          }
        });
      } catch { /* */ }
      return {
        actionId: action.id,
        type: action.type,
        status: "rejected",
        output: JSON.stringify({ evidence_level: action.evidence_level ?? "speculative", reason: gr.reason }),
        duration: 0
      };
    }

    // unverified：落草稿台，让用户决定是否真执行
    try {
      this.kg?.addDraft?.({
        id: `draft_${action.id}_${Date.now().toString(36)}`,
        actionId: action.id,
        actionType: action.type ?? "other",
        description: action.description,
        params: action.params ?? {},
        evidenceLevel: action.evidence_level ?? "inferred",
        evidence: action.evidence ?? [],
        groundingStatus: gr.status,
        groundingReason: gr.reason,
        appName: ctx.appName,
        windowTitle: ctx.windowTitle,
        pipelineId: ctx.pipelineId
      });
      this.kg?.addSystemLog?.({
        level: "info",
        source: "evidence.drafted",
        message: "evidence 未验证 → 草稿台",
        context: {
          actionId: action.id, actionType: action.type, reason: gr.reason,
          matchedCount: gr.matchedCount, totalCount: gr.totalCount
        }
      });
    } catch (e) {
      // 草稿写入失败不该让原 action 默默执行 — 仍按 rejected 处理
      return {
        actionId: action.id,
        type: action.type,
        status: "rejected",
        output: JSON.stringify({ phase: "draft-write-failed" }),
        duration: 0,
        error: `证据未验证，草稿写入失败：${e instanceof Error ? e.message : String(e)}`
      };
    }
    return {
      actionId: action.id,
      type: action.type,
      status: "drafted",
      output: JSON.stringify({ evidence_level: action.evidence_level, reason: gr.reason }),
      duration: 0
    };
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

  private async handleCreateTodo(action: AgentAction, ctx: ActionExecutionContext, started: number): Promise<ActionResult> {
    const title = String(action.params?.title ?? action.description ?? "");
    const priority = String(action.params?.priority ?? "medium");
    const dueAt = String(action.params?.dueAt ?? "");

    // 用户反馈："记录的 todo 我怎么知道是否写上去了？"
    // 原实现：只写 Ovo 内部 KG，根本没同步到 macOS Reminders — 黑洞，用户在系统里查不到。
    // 修复（过渡方案）：双写到 macOS Reminders + KG。
    //
    // ⚠ 架构债：这里写死 macOS Reminders 是不对的——用户可能用 Things / Notion / Linear。
    //   下个版本计划改造为 builtin skill（macos-reminders.add_todo），并支持用户安装
    //   其他 skill 替换之。当前实现等同于 "macos-reminders skill 的硬编码版本"，
    //   skill 框架做出来后这部分会被自然抽离，不需要返工业务逻辑。
    let externalOk = false;
    let externalError: string | undefined;
    try {
      await createReminder({ title, dueAt: dueAt || undefined });
      externalOk = true;
    } catch (e) {
      externalError = e instanceof Error ? e.message : String(e);
    }

    // KG 双写（即使 Reminders 写失败也保留 Ovo 侧记录，便于回溯）
    if (this.kg && ctx.appName) {
      safeExecute(() => {
        this.kg!.addEvent({
          appName: ctx.appName!,
          windowTitle: ctx.windowTitle ?? "",
          content: `[TODO] ${title}${dueAt ? `（@${dueAt}）` : ""}${externalOk ? "" : " (仅 Ovo 内部，未同步系统)"}`,
          summary: title,
          intent: "create_todo",
          sourceWindowId: ctx.windowId ?? "",
          entityIds: []
        });
      }, "action.create-todo.kg-write", undefined, "warn");
    }

    if (externalOk) {
      return {
        actionId: action.id,
        type: "create_todo",
        status: "success",
        output: JSON.stringify({ title, priority, dueAt, sink: "macos-reminders" }),
        duration: Date.now() - started
      };
    }
    // 系统写失败时不直接 failed，标 success 但带 warning：KG 已写，只是没同步到 Reminders
    return {
      actionId: action.id,
      type: "create_todo",
      status: "failed",
      output: JSON.stringify({ title, priority, dueAt, sink: "ovo-only" }),
      duration: Date.now() - started,
      error: `已记录到 Ovo 内部，但写入 macOS 提醒事项失败：${externalError ?? "未知"}。可能需要授权 Ovo 控制"提醒事项"。`
    };
  }

  private handleCopyToClipboard(action: AgentAction, started: number): ActionResult {
    // 用户 Bug: 复制到剪贴板没内容
    // 根因 1: LLM 没把内容放到 params.text，可能用了 content / value / body 等不同 key
    // 根因 2: action.params.text 为空字符串时，writeText("") 把剪贴板清空（覆盖了你之前的内容）
    // 修复: 多 key fallback + 空内容判定为失败 + 不动剪贴板
    const p = action.params ?? {};
    const candidates = [p.text, p.content, p.value, p.body, p.summary, action.description];
    const text = String(candidates.find((v) => typeof v === "string" && v.trim().length > 0) ?? "").trim();
    if (!text) {
      return {
        actionId: action.id,
        type: "copy_to_clipboard",
        status: "failed",
        output: JSON.stringify({ attempt: "copy_to_clipboard", paramKeys: Object.keys(p) }),
        duration: Date.now() - started,
        error: "复制内容为空 — LLM 没在 params.text 填要复制的字符串。请重新触发或手动告诉 Ovo 想复制什么。"
      };
    }
    try {
      const electron = loadElectron();
      if (!electron?.clipboard?.writeText) {
        return {
          actionId: action.id,
          type: "copy_to_clipboard",
          status: "failed",
          output: JSON.stringify({ attempt: "copy_to_clipboard" }),
          duration: Date.now() - started,
          error: "Electron clipboard API 不可用（可能在非 Electron 环境）"
        };
      }
      // R4-2: 写入前捕获旧剪贴板，存起来供 5s 撤销窗（复制回执的"撤销"按钮恢复它）
      const prevClipboard = electron.clipboard.readText();
      electron.clipboard.writeText(text);
      this.lastClipboardUndo = { actionId: action.id, prev: prevClipboard, at: Date.now() };
      // 验证写入成功 — 读回来对比
      const readBack = electron.clipboard.readText();
      if (readBack !== text) {
        return {
          actionId: action.id,
          type: "copy_to_clipboard",
          status: "failed",
          output: JSON.stringify({ attempt: "copy_to_clipboard", writtenLen: text.length, readBackLen: readBack.length }),
          duration: Date.now() - started,
          error: "剪贴板写入似乎成功但读取不一致"
        };
      }
      return {
        actionId: action.id,
        type: "copy_to_clipboard",
        status: "success",
        output: JSON.stringify({ length: text.length, preview: text.slice(0, 80) }),
        duration: Date.now() - started
      };
    } catch (e) {
      return {
        actionId: action.id,
        type: "copy_to_clipboard",
        status: "failed",
        output: JSON.stringify({ attempt: "copy_to_clipboard" }),
        duration: Date.now() - started,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  // ---- macOS 原生 action（直接路径，不依赖 LLM）----
  // 用户反馈：之前所有 action 走 LLM 规划 → 用户没装 hermes/claude/api key 时全部失败。
  // 修复：把 6 个常用动作改回直接路径，调 macos-actions.ts（SEC-1/2/3 argv 防注入已加固）。
  // 这样即使用户完全离线 / 没配 LLM，基础 todo/邮件/链接等也能用。

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
        output: JSON.stringify({ attempt: "set_reminder", title, dueAt }),
        duration: Date.now() - started,
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
        output: JSON.stringify({ attempt: "add_calendar", missing: "startsAt" }),
        duration: Date.now() - started, error: "缺少开始时间 (startsAt)"
      };
    }
    try {
      await createCalendarEvent({
        title, startsAt,
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
        output: JSON.stringify({ attempt: "add_calendar", title, startsAt }),
        duration: Date.now() - started,
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
        output: JSON.stringify({ attempt: "send_imessage", to, hasBody: !!body }),
        duration: Date.now() - started, error: "缺少收件人或内容"
      };
    }
    try {
      await sendIMessage({ to, body });
      return {
        actionId: action.id, type: "send_imessage", status: "success",
        output: JSON.stringify({ to, length: body.length }),
        duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "send_imessage", status: "failed",
        output: JSON.stringify({ attempt: "send_imessage", to }),
        duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleSendEmail(action: AgentAction, started: number): Promise<ActionResult> {
    const to = action.params?.to ? String(action.params.to) : undefined;
    const subject = action.params?.subject ? String(action.params.subject) : undefined;
    const body = action.params?.body ? String(action.params.body) : undefined;
    try {
      // 注意：createMailDraft 只创建草稿，不发送。最终发送由用户在 Mail 应用确认。
      await createMailDraft({ to, subject, body });
      return {
        actionId: action.id, type: "send_email", status: "success",
        output: JSON.stringify({ draftCreated: true, to, subject }),
        duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "send_email", status: "failed",
        output: JSON.stringify({ attempt: "send_email", to, subject }),
        duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleOpenUrl(action: AgentAction, started: number): Promise<ActionResult> {
    const url = String(action.params?.url ?? "");
    if (!url) {
      return {
        actionId: action.id, type: "open_url", status: "failed",
        output: JSON.stringify({ attempt: "open_url", missing: "url" }),
        duration: Date.now() - started, error: "缺少 url 参数"
      };
    }
    try {
      // SEC-2: openUrl 内部已加 scheme 白名单（https/http/mailto）
      await openUrl(url);
      return {
        actionId: action.id, type: "open_url", status: "success",
        output: JSON.stringify({ url }), duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "open_url", status: "failed",
        output: JSON.stringify({ attempt: "open_url", url }),
        duration: Date.now() - started,
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
        output: JSON.stringify({ attempt: "search_web", missing: "query" }),
        duration: Date.now() - started, error: "缺少搜索词"
      };
    }
    try {
      await searchWeb(query, target);
      return {
        actionId: action.id, type: "search_web", status: "success",
        output: JSON.stringify({ query, target: target ?? "google" }),
        duration: Date.now() - started
      };
    } catch (error) {
      return {
        actionId: action.id, type: "search_web", status: "failed",
        output: JSON.stringify({ attempt: "search_web", query }),
        duration: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
