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

// 顺序敏感：先匹配更具体的（信用卡 / 银行卡），后匹配通用（数字串）
const RULES: RedactionRule[] = [
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

/**
 * 对一段 OCR 文本应用全部脱敏规则。
 * 返回脱敏后的文本 + 各类型命中次数。
 */
export function redactSensitive(input: string): SensitiveFilterResult {
  if (!input || input.length < 4) {
    return { cleaned: input ?? "", redactionCounts: {}, hadAny: false };
  }
  let text = input;
  const counts: Record<string, number> = {};

  for (const rule of RULES) {
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
    otp_cn: "验证码"
  };
  return entries.map(([k, v]) => `${labelMap[k] ?? k} × ${v}`).join(" · ");
}
