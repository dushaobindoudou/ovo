/**
 * ipc/_utils.ts —— ipc-handlers 拆分后的"无状态共享工具"
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 这里只放 stateless 函数 / Proxy 工厂；任何依赖闭包状态的逻辑
 * 仍留在 ipc-handlers.ts 主文件。
 */
import { mt } from "../i18n-main.js";
import { BrowserWindow } from "electron";
import type { ZodType } from "zod";
import { errorLogger } from "../error-logger.js";
import { safeExecute } from "../safe-execute.js";
import type { AgentAction, AgentSuggestion } from "../types.js";
import type { ActionResult } from "../action-executor.js";

/**
 * 把主进程消息广播到所有 renderer 窗口。
 * 用 safeExecute 包装，单个窗口 send 失败不影响其他窗口。
 */
export function broadcastToRendererWindows(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    safeExecute(
      () => win.webContents.send(channel, payload),
      `ipc.broadcast.${channel}`,
      undefined,
      "info"
    );
  }
}

/**
 * CODE-3: safeIpcMain 包装——先 removeHandler 再 handle，幂等且防 dev reload "second handler" 错误。
 *
 * 直接替换 ipcMain.handle 调用点最稳妥，但全文件 92 处批改成本高，
 * 这里用 Proxy 拦截 .handle 调用，对外接口不变。
 */
export function makeSafeIpcMain(target: typeof import("electron").ipcMain) {
  const registered = new Set<string>();
  return new Proxy(target, {
    get(t, prop, recv) {
      if (prop === "handle") {
        return (channel: string, listener: (...args: unknown[]) => unknown) => {
          if (registered.has(channel)) {
            // 合理 silent：removeHandler 在 channel 未注册时 throw 是预期行为，
            // 这里就是"删了如果存在"的语义，throw 等价于"已经不在"——继续往下走
            try { t.removeHandler(channel); } catch { /* legitimate: remove-if-exists */ }
          }
          registered.add(channel);
          return t.handle(channel, listener as Parameters<typeof t.handle>[1]);
        };
      }
      if (prop === "on") {
        return (channel: string, listener: (...args: unknown[]) => void) => {
          // on 没有 once-only 限制，但 dev reload 时会累积；先 removeAllListeners 防累积
          t.removeAllListeners(channel);
          return t.on(channel, listener as Parameters<typeof t.on>[1]);
        };
      }
      return Reflect.get(t, prop, recv);
    }
  });
}

/**
 * SEC-16 / BUG_REPORT C4：safeHandle —— ipc.handle + zod schema 包装。
 *
 * 在 handler 执行 *之前* 用 zod parse payload；失败时：
 *   1. 直接返回 { ok: false, error: "payload invalid: <msg>" }
 *   2. 写一条 errorLogger.alert("warn") 留下取证记录
 *   3. 业务 fn 永远不会被调用——payload 不可信，断在边界
 *
 * 设计原则（defense-in-depth）：
 *   - preload allowlist 是第一道墙（拒绝未知 channel）
 *   - 这里是第二道墙（拒绝 channel 合法但 payload 结构非法 / 越界）
 *   - 各 store 内部的具体业务校验是第三道墙
 *
 * 故意 *不* throw —— ipcMain.handle 把 throw 转 renderer 端 rejection，
 * 而 renderer 大多 .catch 后无视；返回 { ok: false } 让调用方必须显式处理。
 */
export function makeSafeHandle(ipcMain: ReturnType<typeof makeSafeIpcMain>) {
  return function safeHandle<TPayload, TResult>(
    channel: string,
    schema: ZodType<TPayload>,
    fn: (payload: TPayload) => TResult | Promise<TResult>
  ): void {
    ipcMain.handle(channel, async (_event: unknown, raw: unknown) => {
      const result = schema.safeParse(raw);
      if (!result.success) {
        const msg = result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ");
        errorLogger.alert(
          "warn",
          `ipc.invalid-payload.${channel}`,
          `payload schema validation failed: ${msg}`,
          { channel, issues: result.error.issues.slice(0, 5) }
        );
        return { ok: false, error: `payload invalid: ${msg}` };
      }
      return await fn(result.data);
    });
  };
}

/**
 * 检测一段文本是否"看起来像代码"——用来决定 receipt 要不要 dump 原文。
 * 启发式：含 markdown fence / 常见编程关键字 / 大括号花括号密度异常 / 缩进结构。
 * 任意命中就当代码处理，宁可保守不暴露用户屏幕内容。
 */
function looksLikeCode(s: string): boolean {
  if (!s) return false;
  if (/```/.test(s)) return true;
  // 关键字 + 紧跟标识/括号
  if (/\b(function|class|const|let|var|import|export|return|interface|public|private)\s/.test(s)) return true;
  if (/=>\s*[{(]/.test(s)) return true;
  // 大括号 / 分号密度
  const braceCount = (s.match(/[{}]/g) ?? []).length;
  const semiCount = (s.match(/;/g) ?? []).length;
  if (s.length > 40 && braceCount + semiCount >= 5) return true;
  // 4+ 连续行带缩进（典型代码结构）
  const indentedLines = (s.match(/(^|\n)[ \t]{2,}\S/g) ?? []).length;
  if (indentedLines >= 4) return true;
  return false;
}

/**
 * P4: 把 action 执行结果转成"回执"提示，让用户知道 ovo 默默做了什么。
 * 只在 status="success" 且类型确实对外可感知时生成（剪贴板写入、邮件/iMessage 已发等）。
 * 静默类型（log_note / summarize / search / create_todo 等）不生成回执，避免噪音。
 */
export function buildActionReceipts(actions: AgentAction[], results: ActionResult[]): AgentSuggestion[] {
  const byId = new Map<string, AgentAction>();
  for (const a of actions) byId.set(a.id, a);
  const out: AgentSuggestion[] = [];
  for (const r of results) {
    if (r.status !== "success") continue;
    const action = byId.get(r.actionId);
    if (!action) continue;
    if (action.type === "copy_to_clipboard") {
      const text = String(action.params?.text ?? "");
      // 用户反馈：通知窗显示了一段 JS 代码——LLM 看到 IDE 里的代码自作主张复制，
      // 然后整段贴在 receipt content 里。改成抽象描述，不 dump 用户屏幕内容。
      let content: string;
      if (looksLikeCode(text)) {
        const lines = text.split(/\r?\n/).length;
        content = mt("receipt.copiedCode", { len: text.length, lines });
      } else if (text.length > 80) {
        // 长文本也只显示开头 60 字 + 长度，避免噪音
        content = mt("receipt.copiedLong", { preview: text.slice(0, 60), len: text.length });
      } else {
        content = text || action.description;
      }
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: mt("receipt.copied"),
        content,
        priority: 100
      });
      continue;
    }
    if (action.type === "send_email") {
      const to = String(action.params?.to ?? "");
      const subject = String(action.params?.subject ?? action.description ?? "");
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: mt("receipt.emailSent"),
        content: `${to ? mt("receipt.to", { to }) + "\n" : ""}${mt("receipt.subject", { subject })}`.trim(),
        priority: 100
      });
      continue;
    }
    if (action.type === "send_imessage") {
      const to = String(action.params?.to ?? "");
      const body = String(action.params?.body ?? action.description ?? "");
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: mt("receipt.imessageSent"),
        content: `${to ? mt("receipt.to", { to }) + "\n" : ""}${body}`.slice(0, 240),
        priority: 100
      });
      continue;
    }
    if (action.type === "set_reminder" || action.type === "add_calendar") {
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: action.type === "set_reminder" ? mt("receipt.reminderSet") : mt("receipt.calendarAdded"),
        content: action.description,
        priority: 100
      });
      continue;
    }
    // log_note: 仅在用户标记 priority>=80（高风险归档）才出回执
    if (action.type === "log_note" && action.priority >= 80) {
      out.push({
        id: `receipt_${r.actionId}_${Date.now().toString(36)}`,
        type: "receipt",
        title: mt("receipt.noteLogged"),
        content: action.description,
        priority: 100
      });
    }
  }
  return out;
}
