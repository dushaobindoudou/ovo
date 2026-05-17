/**
 * T6: 敏感信息脱敏
 *
 * 在 OCR 文本送 LLM 之前，先把高风险字符串擦掉换成 [REDACTED:type]，
 * 避免密码 / 卡号 / token / 身份证 等被发到云端模型。
 *
 * 设计原则：
 *   - **宁错杀，不漏过**：宁可把疑似身份证当真身份证擦了
 *   - 不影响理解：擦完留 [REDACTED:卡号] 这种 token，LLM 仍能知道"这里有张卡号"，但拿不到原文
 *   - 日志只记**类型 + 数量**，绝不记原内容，避免 ovo 自己留底
 *   - 脱敏后的文本是替换后的字符串，原始 OCR 文本不外传
 */

export interface SensitiveFilterResult {
  /** 脱敏后的文本（送 LLM 的版本） */
  cleaned: string;
  /** 命中类型 → 命中次数 */
  redactionCounts: Record<string, number>;
  /** 是否有任何脱敏发生 */
  hadAny: boolean;
}

interface RedactionRule {
  type: string;
  pattern: RegExp;
  /** 替换 token，默认 [REDACTED:type] */
  replacement?: string;
}

// P0.11: 三档脱敏强度
//   basic    — 默认。只擦"明确敏感"内容（token/卡号/身份证/手机号/密码字段/私钥）
//   strict   — basic + 所有邮箱、所有 URL、所有文件路径
//   paranoid — strict + 6+ 位数字串、域名、代码片段（最严格，可能影响 LLM 理解）
export type RedactionLevel = "basic" | "strict" | "paranoid";

const BASIC_RULES: RedactionRule[] = [
  // API tokens（前缀明确，几乎零误伤）
  { type: "api_token", pattern: /\b(sk-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|ghs_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[A-Za-z0-9-]{20,}|xoxp-[A-Za-z0-9-]{20,}|hf_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16})\b/g },
  // JWT
  { type: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/g },
  // 信用卡 / 银行卡 13-19 位（含空格 / 横线分隔）
  { type: "card_number", pattern: /\b(?:\d[ -]?){12,18}\d\b/g },
  // 中国身份证 18 位
  { type: "id_card_cn", pattern: /\b\d{17}[\dXx]\b/g },
  // 中国手机号 11 位（避免误伤其他场景：要求前后非数字）
  { type: "phone_cn", pattern: /(?<![\d-])1[3-9]\d{9}(?![\d-])/g },
  // 邮箱 → 仅在前缀含敏感词时擦（"password reset to xxx@..." 这种），普通邮箱保留
  { type: "sensitive_email", pattern: /(?:password|reset|verification|2fa|verify)[^\n]{0,40}\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi },
  // 密码字段：常见 form 文本 "password: xxx" / "密码: xxx"
  { type: "password_label", pattern: /\b(?:password|passwd|pass|密码|密\s*码)\s*[:：=]\s*\S{4,40}/gi },
  // SSH / RSA private key 头
  { type: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]{0,4000}?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
  // .env style 敏感字段（API_KEY / SECRET / PASSWORD = ...）
  { type: "env_secret", pattern: /\b(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY)\s*=\s*\S{8,}/gi },
  // OTP / 验证码（"验证码 是 123456"）
  { type: "otp_cn", pattern: /(?:验证码|otp|verification\s+code)[^\n]{0,15}\b\d{4,8}\b/gi }
];

const STRICT_EXTRA_RULES: RedactionRule[] = [
  // 全部邮箱（不再要求前缀敏感词）
  { type: "email_any", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // 全部 URL
  { type: "url_any", pattern: /https?:\/\/[^\s)<>"'`]+/g },
  // 文件路径（绝对路径）
  { type: "file_path", pattern: /(?:^|\s)\/(?:Users|home|opt|etc|var|tmp|Applications|System)\/[^\s)<>"'`]+/g }
];

const PARANOID_EXTRA_RULES: RedactionRule[] = [
  // 6+ 位数字串（可能泄露订单号 / 工号 / 票号 / IP segment 等）
  { type: "long_number", pattern: /\b\d{6,}\b/g },
  // 域名（包括邮箱里没匹到的，例如 "我们用 example.com 服务"）
  { type: "domain_any", pattern: /\b[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+\b/gi },
  // 代码块（```...```）
  { type: "code_block", pattern: /```[\s\S]{0,2000}?```/g },
  // 行内代码（`...` 长度 ≥ 8）
  { type: "code_inline", pattern: /`[^`\n]{8,}?`/g }
];

const RULES_BY_LEVEL: Record<RedactionLevel, RedactionRule[]> = {
  basic: BASIC_RULES,
  strict: [...BASIC_RULES, ...STRICT_EXTRA_RULES],
  paranoid: [...BASIC_RULES, ...STRICT_EXTRA_RULES, ...PARANOID_EXTRA_RULES]
};

// 模块级当前脱敏强度。由主进程启动时通过 setRedactionLevel() 同步；preferences 更新时也调一次。
// 这样 redactSensitive 调用方不需要每次传 level，保持 API 简单。
let currentLevel: RedactionLevel = "basic";

export function setActiveRedactionLevel(level: RedactionLevel) {
  currentLevel = level;
}

export function getActiveRedactionLevel(): RedactionLevel {
  return currentLevel;
}

/**
 * 对一段 OCR 文本应用全部脱敏规则。
 * 返回脱敏后的文本 + 各类型命中次数。
 *
 * P0.11: level 可选——不传时用模块级 currentLevel（由 main 进程在启动 / 设置变更时同步）。
 * 这样调用方不用每次显式传 level，行为按用户配置自动调档。
 */
export function redactSensitive(input: string, level?: RedactionLevel): SensitiveFilterResult {
  if (!input || input.length < 4) {
    return { cleaned: input ?? "", redactionCounts: {}, hadAny: false };
  }
  let text = input;
  const counts: Record<string, number> = {};
  const rulesForCall = RULES_BY_LEVEL[level ?? currentLevel] ?? BASIC_RULES;

  for (const rule of rulesForCall) {
    const placeholder = rule.replacement ?? `[REDACTED:${rule.type}]`;
    const before = text;
    let hits = 0;
    text = text.replace(rule.pattern, () => {
      hits++;
      return placeholder;
    });
    if (hits > 0) {
      counts[rule.type] = (counts[rule.type] ?? 0) + hits;
    }
    // safety: pattern 写错可能爆炸，不让单条规则把字符串改成 > 10x 长度
    if (text.length > before.length * 10) {
      text = before;
      break;
    }
  }

  return { cleaned: text, redactionCounts: counts, hadAny: Object.keys(counts).length > 0 };
}

/** 给 prompt 用的"本次脱敏摘要"段（如果有命中），让 LLM 知道屏幕上有敏感信息但不展示内容 */
export function summarizeRedactionsForPrompt(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "";
  const labelMap: Record<string, string> = {
    api_token: "API token",
    jwt: "JWT token",
    card_number: "卡号",
    id_card_cn: "身份证号",
    phone_cn: "手机号",
    sensitive_email: "敏感邮箱",
    password_label: "密码字段",
    private_key: "私钥",
    env_secret: ".env 密钥",
    otp_cn: "验证码",
    email_any: "邮箱",
    url_any: "URL",
    file_path: "文件路径",
    long_number: "数字串",
    domain_any: "域名",
    code_block: "代码块",
    code_inline: "代码片段"
  };
  return entries.map(([k, v]) => `${labelMap[k] ?? k} × ${v}`).join(" · ");
}
