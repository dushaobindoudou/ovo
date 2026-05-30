import type {
  ActionType,
  AgentAction,
  AgentParsedPayload,
  AgentSchemaMeta,
  AgentSuggestion,
  EvidenceLevel,
  ExtractedEntity,
  ExtractedRelation,
  OvoOffer,
  UserRoleHypothesis
} from "./types.js";
import { ACTION_TYPES } from "./types.js";

const ACTION_TYPE_SET = new Set<string>(ACTION_TYPES);
function normalizeActionType(raw: unknown): ActionType {
  if (typeof raw === "string" && ACTION_TYPE_SET.has(raw)) return raw as ActionType;
  return "log_note";
}
// P3: 任何会"抢"用户屏幕/键鼠/外发行为的动作都必须等用户确认
// 用户原话：「会自动打开浏览器操作，这些肯定不行」「不要跟用户抢对电脑的操作」
// 反例（不进 confirm）：log_note / copy_to_clipboard / summarize / search（纯 KG 内查）
// 用户产品反馈（2026-05-21）：只对"不可逆 / 涉及隐私扫描"的动作强制确认。
// 抢屏类（open_url/search_web/open_app）和提醒/日历改为跟随 trust 等级（默认 Lv.3 自动 +
// 5 秒撤销），不再无条件挡在等确认队列里。
export const REQUIRE_CONFIRM_TYPES = new Set<ActionType>([
  "send_email",    // 发给他人，不可撤回
  "send_imessage", // 发给他人，不可撤回
  "index_path"     // 文件系统遍历，涉及隐私
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toSlug(text: string, fallback: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function parsePriority(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const map: Record<string, number> = {
      high: 90,
      medium: 50,
      low: 10,
      urgent: 100
    };
    return map[v.trim().toLowerCase()] ?? 0;
  }
  return 0;
}

function parseAction(item: unknown): AgentAction | null {
  if (typeof item === "string") {
    const description = item.trim();
    if (!description) return null;
    return {
      id: toSlug(description, "action"),
      type: "log_note",
      description,
      params: {},
      requireConfirm: false,
      priority: 0
    };
  }
  if (!isRecord(item)) return null;
  const description =
    asString(item.description, "") || asString(item.content, "") || asString(item.type, "") || asString(item.name, "");
  const id = asString(item.id, "") || toSlug(description || asString(item.type, ""), "action");
  if (!id || !description) return null;
  const type = normalizeActionType(item.type);
  // R3-1 修复：之前这里漏拷 evidence_level / evidence，导致所有 action 到 grounder 时
  //   evidence 永远 undefined → 一律判 unverified → 全落草稿台，自动执行形同虚设。
  //   现在如实解析 LLM 自报的等级 + 证据，让 evidence-grounder 真正能工作。
  const evidence_level = parseEvidenceLevel(item.evidence_level);
  const evidence = asStringArray(item.evidence).map((e) => e.slice(0, 200)).slice(0, 6);
  // 到期执行：解析 LLM 自报的 fireAt（epoch ms 或 ISO 字符串）+ recurrence。
  // 不在这里做时间合法性判断（交给 pipeline 的 normalizeFireAt），只如实透传。
  const fireAt =
    typeof item.fireAt === "number" || typeof item.fireAt === "string" ? item.fireAt : undefined;
  const recurrence =
    item.recurrence === "daily" || item.recurrence === "weekly" ? item.recurrence : undefined;
  return {
    id,
    type,
    description,
    params: isRecord(item.params) ? item.params : {},
    requireConfirm: REQUIRE_CONFIRM_TYPES.has(type) ? true : Boolean(item.requireConfirm),
    priority: parsePriority(item.priority),
    ...(evidence_level ? { evidence_level } : {}),
    ...(evidence.length > 0 ? { evidence } : {}),
    ...(fireAt !== undefined ? { fireAt } : {}),
    ...(recurrence ? { recurrence } : {})
  };
}

/** 解析 LLM 自报的 evidence_level；非法 / 缺失 → undefined（由 grounder 回退信任等级判定）。 */
function parseEvidenceLevel(v: unknown): EvidenceLevel | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return t === "direct" || t === "inferred" || t === "speculative" ? t : undefined;
}

function parseSuggestion(item: unknown): AgentSuggestion | null {
  if (typeof item === "string") {
    const content = item.trim();
    if (!content) return null;
    return {
      id: toSlug(content, "suggestion"),
      type: "tip",
      title: content.slice(0, 30) || "建议",
      content,
      priority: 0
    };
  }
  if (!isRecord(item)) return null;
  const content = asString(item.content, "") || asString(item.description, "");
  const title = asString(item.title, "") || content.slice(0, 30) || asString(item.type, "建议");
  const id = asString(item.id, "") || toSlug(`${asString(item.type, "tip")}_${title}`, "suggestion");
  if (!id || !content) return null;
  return {
    id,
    type: asString(item.type, "tip"),
    title,
    content,
    detail: typeof item.detail === "string" ? item.detail : undefined,
    priority: parsePriority(item.priority)
  };
}

function parseEntity(item: unknown): ExtractedEntity | null {
  if (!isRecord(item)) return null;
  const name = asString(item.name, "");
  if (!name) return null;
  const type = item.type;
  const allowed = new Set(["person", "project", "document", "concept", "organization", "location", "application"]);
  return {
    name,
    type: allowed.has(String(type)) ? (type as ExtractedEntity["type"]) : "concept",
    description: typeof item.description === "string" ? item.description : undefined,
    attributes: isRecord(item.attributes) ? item.attributes : undefined
  };
}

function parseRelation(item: unknown): ExtractedRelation | null {
  if (!isRecord(item)) return null;
  const source = asString(item.source, "");
  const target = asString(item.target, "");
  const relation = asString(item.relation, "");
  if (!source || !target || !relation) return null;
  return {
    source,
    target,
    relation,
    context: typeof item.context === "string" ? item.context : undefined
  };
}

function asStringArray(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/** Q1: 解析 user_role_hypothesis */
function parseUserRoleHypothesis(item: unknown): UserRoleHypothesis | undefined {
  if (!isRecord(item)) return undefined;
  const role = asString(item.role, "").trim().slice(0, 80);
  if (!role) return undefined;
  const evidence = asStringArray(item.evidence).map((e) => e.slice(0, 160)).slice(0, 6);
  const confidence = clamp01(item.confidence);
  return { role, evidence, confidence };
}

/** Q1: 解析单个 offer */
const FREQUENCY_VALID = new Set(["daily", "weekly", "event-driven", "one-shot"]);
function parseOffer(item: unknown): OvoOffer | null {
  if (!isRecord(item)) return null;
  const title = asString(item.title, "").trim().slice(0, 80);
  const value_prop = asString(item.value_prop, "").trim().slice(0, 240);
  if (!title || !value_prop) return null;
  const id = asString(item.id, "") || toSlug(title, "offer");
  const freqRaw = asString(item.frequency, "one-shot").trim().toLowerCase();
  const frequency: OvoOffer["frequency"] = (FREQUENCY_VALID.has(freqRaw) ? freqRaw : "one-shot") as OvoOffer["frequency"];
  const first_action_preview = asString(item.first_action_preview, "").trim().slice(0, 240) || undefined;
  const needs_capability = asString(item.needs_capability, "").trim().slice(0, 60) || undefined;
  const confidence = clamp01(item.confidence);
  return { id, title, value_prop, first_action_preview, frequency, needs_capability, confidence };
}

function degradedFromText(raw: string, reason: string): { parsed: AgentParsedPayload; meta: AgentSchemaMeta } {
  return {
    parsed: {
      intent: "unparsed",
      prediction: "",
      actions: [],
      suggestions: [],
      content: [raw.slice(0, 8000)],
      entities: [],
      relationships: []
    },
    meta: { repaired: false, degraded: true, notes: [reason] }
  };
}

/**
 * Claude Code CLI：`claude -p ... --output-format json` 返回外层包装对象，
 * 业务 JSON 在 `result` 字符串里（可能是纯 JSON，或 markdown 围栏包一层）。
 */
function tryParseJsonObjectFromText(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t);
    return isRecord(v) ? v : null;
  } catch {
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        const inner = fence[1].trim();
        const v = JSON.parse(inner);
        return isRecord(v) ? v : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function unwrapCliResultEnvelope(root: unknown): unknown {
  if (!isRecord(root)) return root;
  if (root.type !== "result" || typeof root.result !== "string") return root;
  const innerObj = tryParseJsonObjectFromText(root.result);
  if (innerObj) return innerObj;
  return {
    intent: "unknown",
    prediction: "",
    actions: [],
    suggestions: [],
    content: [root.result.slice(0, 8000)],
    entities: [],
    relationships: []
  };
}

/**
 * 检测一个对象是不是 prompt 里的 schema 占位（intent / prediction 都是字面值 "string"）。
 * Hermes 在 quiet 模式下也偶尔会回显部分 prompt，必须跳过这类伪 JSON。
 */
function isPlaceholderSchema(obj: Record<string, unknown>): boolean {
  const intent = obj.intent;
  const prediction = obj.prediction;
  if (intent === "string" && prediction === "string") return true;
  // 仅含 schema 模板的"actions[0].id == 'string'"也是占位
  if (Array.isArray(obj.actions) && obj.actions.length === 1 && isRecord(obj.actions[0])) {
    const a = obj.actions[0] as Record<string, unknown>;
    if (a.id === "string" && a.description === "string") return true;
  }
  return false;
}

/** 在任意文本里扫出所有顶层平衡 `{...}` 块（不进字符串、转义安全）。 */
function findAllJsonObjects(text: string): string[] {
  const out: string[] = [];
  const t = text;
  let i = 0;
  while (i < t.length) {
    const start = t.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escape = false;
    let found = -1;
    for (let j = start; j < t.length; j += 1) {
      const ch = t[j];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) { found = j; break; }
      }
    }
    if (found === -1) break;
    out.push(t.slice(start, found + 1));
    i = found + 1;
  }
  return out;
}

/**
 * 从原文里挑出最像"真实响应"的 JSON 对象：
 *   1) 优先选不是占位 schema 的；
 *   2) 同样真实的就选最后一个（hermes 输出末尾通常是最终回答）；
 *   3) 都是占位的，返回 null（让上层走 degraded）。
 */
function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  // 整体先试
  try {
    const v = JSON.parse(t);
    if (isRecord(v) && !isPlaceholderSchema(v)) return v;
  } catch {
    /* fallthrough */
  }
  const candidates = findAllJsonObjects(t);
  let best: Record<string, unknown> | null = null;
  for (const slice of candidates) {
    try {
      const v = JSON.parse(slice);
      if (!isRecord(v)) continue;
      if (isPlaceholderSchema(v)) continue;
      best = v; // 最后一个非占位优先
    } catch {
      /* skip */
    }
  }
  return best;
}

/** 将任意 LLM 输出规范化为可安全下游消费的 AgentParsedPayload */
export function normalizeAgentPayload(raw: string): { parsed: AgentParsedPayload; meta: AgentSchemaMeta } {
  const meta: AgentSchemaMeta = { repaired: false, degraded: false, notes: [] };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // 1) 试 markdown 围栏；2) 试扫描第一个完整 `{...}`
    const fenced = tryParseJsonObjectFromText(raw);
    const fallback = fenced ?? extractFirstJsonObject(raw);
    if (!fallback) return degradedFromText(raw, "JSON.parse 失败");
    obj = fallback;
    meta.notes.push(fenced ? "解析 markdown 围栏 JSON" : "扫描首个 JSON 对象");
  }

  obj = unwrapCliResultEnvelope(obj);

  if (!isRecord(obj)) {
    return degradedFromText(String(raw).slice(0, 4000), "根节点非 JSON 对象");
  }

  const actionsRaw = obj.actions;
  const suggestionsRaw = obj.suggestions;
  const entitiesRaw = obj.entities;
  const relationshipsRaw = obj.relationships;

  const summaryRaw = asString(obj.summary, "").trim().slice(0, 60);
  const riskValid = new Set(["none", "low", "medium", "high", "critical"]);
  const riskRaw = asString(obj.risk, "").trim().toLowerCase();
  const offersRaw = obj.offers;
  const offers = Array.isArray(offersRaw)
    ? offersRaw.map(parseOffer).filter((x): x is OvoOffer => x !== null).slice(0, 3)
    : undefined;
  const parsed: AgentParsedPayload = {
    intent: asString(obj.intent, "unknown"),
    prediction: asString(obj.prediction, ""),
    actions: Array.isArray(actionsRaw) ? actionsRaw.map(parseAction).filter((x): x is AgentAction => x !== null) : [],
    suggestions: Array.isArray(suggestionsRaw)
      ? suggestionsRaw.map(parseSuggestion).filter((x): x is AgentSuggestion => x !== null)
      : [],
    content: asStringArray(obj.content),
    entities: Array.isArray(entitiesRaw)
      ? entitiesRaw.map(parseEntity).filter((x): x is ExtractedEntity => x !== null)
      : [],
    relationships: Array.isArray(relationshipsRaw)
      ? relationshipsRaw.map(parseRelation).filter((x): x is ExtractedRelation => x !== null)
      : [],
    summary: summaryRaw || undefined,
    risk: riskValid.has(riskRaw) ? (riskRaw as AgentParsedPayload["risk"]) : undefined,
    user_role_hypothesis: parseUserRoleHypothesis(obj.user_role_hypothesis),
    latent_intent: asString(obj.latent_intent, "").trim().slice(0, 240) || undefined,
    offers: offers && offers.length > 0 ? offers : undefined
  };

  const missingCore = !parsed.intent || parsed.intent === "unknown";
  if (missingCore && parsed.content.length === 0 && parsed.actions.length === 0 && parsed.suggestions.length === 0) {
    meta.degraded = true;
    meta.notes.push("缺少 intent 且无可展示字段，已填充原始片段到 content");
    parsed.content = [raw.slice(0, 4000)];
  }

  // 强制 actions ≥ 1：LLM 没出动作时本地兜底
  // CODE-17 修复：原来兜底 log_note 会写入 memory_events 污染 KG（每帧重复"归档当前屏幕活动"）。
  // 现在改成兜底 "other" + noKgWrite — UI 显示但不写库，让 LLM 真正想做事时才写。
  if (parsed.actions.length === 0) {
    parsed.actions.push({
      id: `skip_${Date.now().toString(36)}`,
      type: "other",
      description: "此刻无可执行的具体动作（Ovo 选择沉默）",
      params: { auto: true, reason: "llm_returned_empty_actions", noKgWrite: true },
      requireConfirm: false,
      priority: 1
    });
    meta.notes.push("autofill: skip");
  }

  return { parsed, meta };
}

export function shouldAttemptSchemaRepair(parsed: AgentParsedPayload, meta: AgentSchemaMeta): boolean {
  if (meta.degraded) return true;
  if (!parsed.prediction && parsed.suggestions.length === 0 && parsed.actions.length === 0) return true;
  return false;
}

export function buildJsonRepairPrompt(raw: string, hint: string) {
  return `你是 JSON 修复器。以下文本本应是一个给 ovo 使用的单个 JSON 对象，但解析或结构校验存在问题：${hint}

你必须只输出一个合法 JSON 对象，不要 markdown 围栏，不要解释，不要额外文本。

目标 schema:
{
  "intent": "string",
  "prediction": "string",
  "actions": [
    {
      "id": "string",
      "description": "string",
      "params": {},
      "requireConfirm": false,
      "priority": 0
    }
  ],
  "suggestions": [
    {
      "id": "string",
      "type": "string",
      "title": "string",
      "content": "string",
      "detail": "string",
      "priority": 0
    }
  ],
  "content": ["string"],
  "entities": [],
  "relationships": []
}

修复规则:
1. 所有顶层字段都必须存在。
2. actions 如果原文是字符串数组，要改写成对象数组。
3. suggestions 如果原文缺少 id/title，要自动补齐。
4. content 如果原文是单个字符串，要转成字符串数组。
5. priority 必须输出数字；如果原文是 high/medium/low，请分别转成 90/50/10。
6. 如果原文已经表达了明确意图和下一步，actions 不应为空。
7. 如果确实没有 action，也要保留清晰的 prediction 和 content。
8. 不要丢失原文已有的有效信息。

待修复原文:
---
${raw.slice(0, 12_000)}
---`;
}
