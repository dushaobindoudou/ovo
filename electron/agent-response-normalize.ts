import type {
  AgentAction,
  AgentParsedPayload,
  AgentSchemaMeta,
  AgentSuggestion,
  ExtractedEntity,
  ExtractedRelation
} from "./types.js";

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
  return {
    id,
    description,
    params: isRecord(item.params) ? item.params : {},
    requireConfirm: Boolean(item.requireConfirm),
    priority: parsePriority(item.priority)
  };
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

/** 将任意 LLM 输出规范化为可安全下游消费的 AgentParsedPayload */
export function normalizeAgentPayload(raw: string): { parsed: AgentParsedPayload; meta: AgentSchemaMeta } {
  const meta: AgentSchemaMeta = { repaired: false, degraded: false, notes: [] };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return degradedFromText(raw, "JSON.parse 失败");
  }

  obj = unwrapCliResultEnvelope(obj);

  if (!isRecord(obj)) {
    return degradedFromText(String(raw).slice(0, 4000), "根节点非 JSON 对象");
  }

  const actionsRaw = obj.actions;
  const suggestionsRaw = obj.suggestions;
  const entitiesRaw = obj.entities;
  const relationshipsRaw = obj.relationships;

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
      : []
  };

  const missingCore = !parsed.intent || parsed.intent === "unknown";
  if (missingCore && parsed.content.length === 0 && parsed.actions.length === 0 && parsed.suggestions.length === 0) {
    meta.degraded = true;
    meta.notes.push("缺少 intent 且无可展示字段，已填充原始片段到 content");
    parsed.content = [raw.slice(0, 4000)];
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
