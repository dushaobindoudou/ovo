/**
 * evidence-grounder.ts —— LLM 自报 evidence 的客观验证层。
 *
 * 参考 docs/REFLECTION_LOG.md 反思 #2 — 不能让 LLM 自评置信度，必须由运行时
 * 用客观信号（OCR / window title / 用户行为）验证它说的"屏幕证据"真不真实。
 *
 * 输入：LLM 自报的 evidence_level + evidence[]，以及当时的 OCR preview / window
 * 输出：grounded（验证通过）/ unverified（声称的证据找不到）/ rejected（speculative 一律拒绝）
 *
 * 三层验证：
 *   1. speculative → 直接 rejected（这种就不该进 actions 数组）
 *   2. direct → grounded（用户直接表达，信任 LLM 标记）
 *   3. inferred → 子串匹配，evidence 数组中至少 50% 能在 grounding context 找到 → grounded
 *
 * 不依赖 LLM 自报置信度，是反幻觉的硬性 check。
 */

import type { EvidenceLevel } from "./types.js";

export type GroundingStatus =
  | "grounded"     // 证据可验证，可以执行
  | "unverified"   // LLM 标 inferred 但找不到证据 → 进草稿台不执行
  | "rejected";    // speculative 或字段缺失 → 拒绝执行（应转 suggestion）

export interface GroundingContext {
  /** 当前窗口的 OCR 摘录（脱敏后） */
  ocrPreview?: string;
  /** 当前 active 窗口标题 */
  windowTitle?: string;
  /** 当前 active 应用名 */
  appName?: string;
}

export interface GroundingResult {
  status: GroundingStatus;
  /** 命中证据数 / 总证据数；speculative/direct 不适用 */
  matchedCount?: number;
  totalCount?: number;
  /** 命中的具体 evidence 字符串（便于日志/审计） */
  matched?: string[];
  /** 未命中的 evidence（提示 LLM 哪些是空话） */
  unmatched?: string[];
  /** 简短人话原因 */
  reason: string;
}

/**
 * 把一段长 OCR/title 文本规范化用于子串匹配：
 *   - 转小写（中英 case-insensitive）
 *   - 折叠所有 unicode 空白（含全角）为单空格
 *   - 去除常见标点（保留字母/数字/CJK 内容）
 */
function normalize(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 单个 evidence 是否在 context 里找得到。
 * 策略：把 evidence 也归一化，然后做"3-gram 命中率"。短句直接子串。
 *
 * 用 3-gram 而不是 exact substring 是为了容忍 OCR 错字 / LLM 重述顺序的
 * 小差异。命中率 ≥ 60% 视为找到。
 */
function evidenceFoundIn(evidence: string, normContext: string): boolean {
  const ev = normalize(evidence);
  if (!ev) return false;
  if (ev.length <= 8) {
    // 短证据：必须严格子串
    return normContext.includes(ev);
  }
  if (normContext.includes(ev)) return true;
  // 长证据：抽取至少 6 字符的"核心片段"做子串匹配 — LLM 可能改写
  // 切成长度 6 的连续片段；任一片段命中 = 命中（容忍 ±几字误差）
  const grams: string[] = [];
  for (let i = 0; i + 6 <= ev.length; i += 3) {
    grams.push(ev.slice(i, i + 6));
  }
  if (grams.length === 0) return false;
  const hits = grams.filter((g) => normContext.includes(g)).length;
  return hits / grams.length >= 0.6;
}

/**
 * 主入口：验证一个 action 的 evidence 在当前 grounding context 里是否站得住。
 *
 * @param evidenceLevel LLM 自报的等级（缺失时**宽松**视作 direct — 向后兼容）
 * @param evidence      LLM 自报的具体证据数组
 * @param ctx           当前屏幕信号
 *
 * 设计选择（2026-05-20 修正）：
 *   默认 = direct（不是 speculative）。理由：
 *   - 不是所有 LLM backend 都能稳定输出新 schema 字段（hermes 比 claude 差）
 *   - 之前已存在的 KG / pipeline 老数据没这个字段
 *   - 严格默认会把"老数据 + LLM 漏字段"全军覆没，用户体验是"Ovo 什么都不做了"
 *   只有 LLM **显式标 speculative** 时才拒绝（这是 LLM 自己承认"我在瞎猜"），
 *   显式标 inferred 时才走 grounding 校验。这种"有罪推定 vs 无罪推定"，向后兼容选无罪。
 */
export function groundEvidence(
  evidenceLevel: EvidenceLevel | undefined,
  evidence: string[] | undefined,
  ctx: GroundingContext
): GroundingResult {
  // 关键：未填 → direct（信任执行），不是 speculative（全军覆没）
  const level = evidenceLevel ?? "direct";

  // 1) speculative 一律拒绝 — 这种 LLM 应该转 suggestion，进了 actions 就是幻觉
  if (level === "speculative") {
    return {
      status: "rejected",
      reason: "LLM 自报为 speculative — 应转 suggestion 而非 action"
    };
  }

  // 2) direct 信任 LLM 标记，但仍要求 evidence 数组非空（防 LLM 偷懒）
  if (level === "direct") {
    if (!evidence || evidence.length === 0) {
      return {
        status: "unverified",
        reason: "direct 但未列任何 evidence — 无法验证用户的直接意图"
      };
    }
    return {
      status: "grounded",
      matchedCount: evidence.length,
      totalCount: evidence.length,
      matched: evidence,
      reason: "direct 级，信任 LLM 标记"
    };
  }

  // 3) inferred：用 evidence 数组对 OCR + windowTitle + appName 做子串匹配验证
  if (!evidence || evidence.length === 0) {
    return {
      status: "unverified",
      reason: "inferred 但未列 evidence — 无法验证屏幕信号"
    };
  }

  // 拼一份归一化的 grounding 文本
  const contextText = normalize(
    [ctx.ocrPreview ?? "", ctx.windowTitle ?? "", ctx.appName ?? ""].join(" ")
  );
  if (!contextText) {
    return {
      status: "unverified",
      reason: "无可用屏幕上下文（OCR/title 都空），inferred 无法验证"
    };
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const ev of evidence) {
    if (evidenceFoundIn(ev, contextText)) matched.push(ev);
    else unmatched.push(ev);
  }
  const matchRate = matched.length / evidence.length;
  // ≥ 50% evidence 命中视作 grounded（允许 1/3 / 2/3 这种弱命中也通过）
  if (matchRate >= 0.5) {
    return {
      status: "grounded",
      matchedCount: matched.length,
      totalCount: evidence.length,
      matched,
      unmatched,
      reason: `inferred 已验证：${matched.length}/${evidence.length} 条 evidence 命中屏幕`
    };
  }
  return {
    status: "unverified",
    matchedCount: matched.length,
    totalCount: evidence.length,
    matched,
    unmatched,
    reason: `inferred 验证未通过：${matched.length}/${evidence.length} 条 evidence 在屏幕上找不到（可能是 LLM 编造）`
  };
}
