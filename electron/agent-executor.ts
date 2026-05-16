/**
 * AX-1: Agent-driven action execution
 *
 * 用户原话："所有的 action 执行应该交给 agent"
 * 改造思路：把硬编码 handler 退役，交给 LLM 规划"如何在 macOS 上完成这件事"，
 * ovo 仅做安全的本地"执行器"——只允许少量受限 op：
 *   - osascript (AppleScript)：发邮件、发 iMessage、设提醒、加日历都靠这个
 *   - open (open URL / open file)：浏览器跳转 / 打开文档
 *   - clipboard：写剪贴板
 *   - log：仅记录到 KG
 *
 * 严禁通过这条路径执行任意 shell（避免 LLM 误删数据）。
 *
 * 流程：
 *   1. LLM 收到 action.description + params + 安全 op 菜单
 *   2. LLM 输出 { ops: [{kind, payload}, ...] } 计划
 *   3. ovo 解析、白名单校验、逐个执行
 *   4. 返回汇总结果
 *
 * 失败时不破坏；用户始终能在「流程」tab 看到 LLM 输出的计划 + 实际执行结果。
 */

import type { AgentAction } from "./types.js";
import type { AgentBridge } from "./agent-bridge.js";
import { execa } from "execa";
import { loadElectron } from "./electron-loader.js";
import { getExpandedPath } from "./path-helpers.js";

export type SafeOpKind = "osascript" | "open" | "clipboard" | "log" | "noop";

export interface SafeOp {
  kind: SafeOpKind;
  /** payload 含义按 kind 不同：
   *   osascript: AppleScript 源码
   *   open: URL 或文件路径
   *   clipboard: 要写入的文本
   *   log: 一条记录文本
   *   noop: 无（仅声明意图）
   */
  payload: string;
  /** 给用户看的人话描述 */
  description?: string;
}

export interface ExecutionPlan {
  ops: SafeOp[];
  /** LLM 自评的整体把握度 */
  confidence: number;
  /** LLM 的一句话总结，给用户展示 */
  summary?: string;
}

const VALID_OP_KINDS: SafeOpKind[] = ["osascript", "open", "clipboard", "log", "noop"];

function buildPlanPrompt(action: AgentAction): string {
  return `你是 ovo 的执行规划器。用户希望 ovo 帮他完成一件事，请生成**安全的本地执行计划**。

# 用户的需求
描述：${action.description}
原始类型：${action.type ?? "other"}
参数：${JSON.stringify(action.params ?? {}, null, 2)}

# 你能用的"安全 op"（只能用这 5 种，其他全部禁止）
- **osascript**：执行 AppleScript（用于发邮件 Mail.app、iMessage、Reminders、Calendar、调起 macOS 应用等）
- **open**：用 macOS \`open\` 命令打开 URL 或文件（用于浏览器跳转、打开文档）
- **clipboard**：写剪贴板
- **log**：仅记录到 KG（不做任何外部操作）
- **noop**：无操作（用于"我无法用安全 op 完成这事"的兜底）

❗ **严禁**：shell 执行任意命令、删除文件、修改系统设置、网络请求、安装东西。如果任务需要这些，用 noop + log "用户意图记录"

# 输出 JSON（仅此对象）
{
  "summary": "string  // 你给用户的一句话总结：'我会用 Mail 给客户发草稿' 这种",
  "confidence": 0.85,
  "ops": [
    {
      "kind": "osascript | open | clipboard | log | noop",
      "payload": "string  // AppleScript 源码 / URL / 文本 等",
      "description": "string  // 这一步是干啥的人话"
    }
  ]
}

# 规则
1. 仅输出**一个** JSON 对象，无 markdown 围栏，无解释
2. ops ≤ 3 条；宁少勿多
3. payload 必须可直接执行（osascript 给真 AppleScript，不要伪代码）
4. 只用上述 5 种 kind，不要发明新的
5. 对你不会做的事，用 \`noop\` + \`log\`，**绝不要**编造一段错误的 osascript`;
}

interface PlanResult {
  ok: boolean;
  plan?: ExecutionPlan;
  error?: string;
  rawPreview?: string;
}

function parsePlan(raw: string): PlanResult {
  if (!raw) return { ok: false, error: "LLM 返回为空" };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "解析 JSON 失败", rawPreview: raw.slice(0, 400) };
    try { obj = JSON.parse(m[0]); } catch { return { ok: false, error: "解析 JSON 失败", rawPreview: raw.slice(0, 400) }; }
  }
  if (typeof obj !== "object" || obj === null) return { ok: false, error: "根节点不是 object" };
  const root = obj as Record<string, unknown>;
  const opsRaw = root.ops;
  if (!Array.isArray(opsRaw)) return { ok: false, error: "ops 字段不是数组" };
  const ops: SafeOp[] = [];
  for (const item of opsRaw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const kind = String(o.kind ?? "").toLowerCase() as SafeOpKind;
    if (!VALID_OP_KINDS.includes(kind)) continue;
    const payload = typeof o.payload === "string" ? o.payload : "";
    if (!payload && kind !== "noop") continue;
    ops.push({
      kind,
      payload: payload.slice(0, 8000), // 防巨型 payload
      description: typeof o.description === "string" ? o.description.slice(0, 200) : undefined
    });
    if (ops.length >= 3) break;
  }
  if (ops.length === 0) return { ok: false, error: "ops 全部无效" };
  const confidence = typeof root.confidence === "number" ? Math.max(0, Math.min(1, root.confidence)) : 0.5;
  const summary = typeof root.summary === "string" ? root.summary.slice(0, 200) : undefined;
  return { ok: true, plan: { ops, confidence, summary } };
}

export interface OpExecutionResult {
  kind: SafeOpKind;
  ok: boolean;
  output: string;
  error?: string;
}

/** 执行单个 safe op，超时 10s */
async function executeOp(op: SafeOp): Promise<OpExecutionResult> {
  try {
    switch (op.kind) {
      case "noop":
        return { kind: "noop", ok: true, output: op.description ?? "(no-op)" };

      case "log":
        // 仅日志，不做副作用——KG 写入由调用方负责
        return { kind: "log", ok: true, output: op.payload.slice(0, 240) };

      case "clipboard": {
        const electron = loadElectron();
        if (!electron?.clipboard?.writeText) {
          return { kind: "clipboard", ok: false, output: "", error: "clipboard 不可用" };
        }
        electron.clipboard.writeText(op.payload);
        return { kind: "clipboard", ok: true, output: `已写入 ${op.payload.length} 字符` };
      }

      case "open": {
        // 安全 scheme 白名单：仅 https/http/mailto。
        // 拒绝 file:// 与绝对路径——曾允许 file:///Users/.ssh/id_rsa 之类的私钥/.command 攻击面。
        const target = op.payload.trim();
        const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(target);
        const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "";
        const ALLOWED_SCHEMES = new Set(["https", "http", "mailto"]);
        if (!scheme || !ALLOWED_SCHEMES.has(scheme)) {
          return {
            kind: "open",
            ok: false,
            output: "",
            error: `open 仅允许 https/http/mailto，拒绝: ${target.slice(0, 60)}`
          };
        }
        // 二次校验：URL 解析必须成功，且 host 不能为空（防 "https:///" 之类 trick）
        try {
          const u = new URL(target);
          if (scheme !== "mailto" && !u.host) {
            return { kind: "open", ok: false, output: "", error: "open URL 缺少 host" };
          }
        } catch {
          return { kind: "open", ok: false, output: "", error: "open URL 无法解析" };
        }
        await execa("open", [target], {
          timeout: 10_000,
          env: { ...process.env, PATH: getExpandedPath() }
        });
        return { kind: "open", ok: true, output: `已打开 ${target}` };
      }

      case "osascript": {
        // 严格安全策略：完全拒绝 do shell script（任意 shell 执行入口），
        // 拒绝可能改变系统状态的 system events 命令。
        // 黑名单 + 白名单双层防护：上层 action 类型已经收敛到 mail/calendar/reminders/messages 等，
        // 这里再拦截一道防 LLM 注入。
        const code = op.payload;
        // 任何形式的 shell 调用都拒（不再用关键字 narrowing）
        if (/\bdo\s+shell\s+script\b/i.test(code)) {
          return { kind: "osascript", ok: false, output: "", error: "osascript 不允许 do shell script" };
        }
        if (/\bsystem\s+attribute\b|\bsystem\s+events\b\s*[\s\S]{0,200}\b(?:delete|empty|restart|shut\s+down|sleep|log\s+out)\b/i.test(code)) {
          return { kind: "osascript", ok: false, output: "", error: "osascript 含敏感系统事件，已拒绝" };
        }
        // 单次执行限制 + 输出截断
        const result = await execa("osascript", ["-e", code], {
          timeout: 15_000,
          env: { ...process.env, PATH: getExpandedPath() }
        });
        const out = (result.stdout ?? "").trim().slice(0, 400);
        return { kind: "osascript", ok: true, output: out || "(no stdout)" };
      }

      default:
        return { kind: op.kind, ok: false, output: "", error: "未知 kind" };
    }
  } catch (e) {
    return {
      kind: op.kind,
      ok: false,
      output: "",
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export interface AgentExecutionResult {
  ok: boolean;
  plan?: ExecutionPlan;
  ops: OpExecutionResult[];
  error?: string;
  /** LLM 调用 + 执行总耗时 ms */
  durationMs: number;
}

/**
 * 给 action_executor 用的入口：交给 LLM 规划 + 本地安全执行。
 */
export async function planAndExecuteAction(
  action: AgentAction,
  agentBridge: AgentBridge
): Promise<AgentExecutionResult> {
  const started = Date.now();
  const prompt = buildPlanPrompt(action);
  const response = await agentBridge.call({ prompt, outputFormat: "json", timeout: 45_000 });
  if (!response.ok) {
    return {
      ok: false,
      ops: [],
      error: response.error ?? "LLM 规划调用失败",
      durationMs: Date.now() - started
    };
  }
  const parsed = parsePlan(response.raw ?? "");
  if (!parsed.ok || !parsed.plan) {
    return {
      ok: false,
      ops: [],
      error: parsed.error ?? "无法解析计划",
      durationMs: Date.now() - started
    };
  }
  const opResults: OpExecutionResult[] = [];
  for (const op of parsed.plan.ops) {
    const r = await executeOp(op);
    opResults.push(r);
    // 任一 op 失败就停（但已执行的不回滚）
    if (!r.ok) break;
  }
  const allOk = opResults.length > 0 && opResults.every((r) => r.ok);
  return {
    ok: allOk,
    plan: parsed.plan,
    ops: opResults,
    durationMs: Date.now() - started
  };
}
