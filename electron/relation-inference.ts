/**
 * KG-G: 关系推断二次 pass
 *
 * 主 pipeline 完成后异步触发：让 LLM 在
 *   (a) 本轮新抽出的 entities
 *   (b) KG 中最近 1h 提到的 + top quality entities
 * 之间，找漏掉的"显然但未表达"的关系。
 *
 * 设计要点：
 * - confidence ≥ 0.7 才采纳，避免幻觉
 * - 关系类型严格白名单
 * - LLM 只能在已给的 entity 列表里选 source/target，不能创造新 entity
 */

import type { ExtractedEntity } from "./types.js";

export interface InferredRelation {
  source: string;
  target: string;
  relation: string;
  evidence: string;
  confidence: number;
}

const VALID_RELATIONS = new Set([
  "uses", "depends_on", "references", "solves", "relates_to",
  "precedes", "belongs_to", "part_of"
]);

export function buildRelationInferencePrompt(
  newEntities: ExtractedEntity[],
  contextEntities: Array<{ name: string; type: string; description?: string }>
): string {
  const allList = [
    ...newEntities.map((e) => ({ name: e.name, type: e.type, description: e.description ?? "" })),
    ...contextEntities
  ];
  // 去重（按 name）
  const seen = new Set<string>();
  const unique = allList.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  }).slice(0, 20);

  const numbered = unique
    .map((e, i) => `${i + 1}. ${e.name} (${e.type})${e.description ? `: ${e.description}` : ""}`)
    .join("\n");

  return `你是 ovo 的关系推断器。任务：在下面给定的实体里，识别**显然成立但还没有被显式声明**的关系。

# 实体清单（请只在这些里选择 source 和 target）
${numbered}

# 关系类型（必须从中选一个）
- uses: 一方使用/调用另一方（工具、服务、技术）
- depends_on: 强依赖（缺少另一方就无法成立）
- references: 引用、提到、链接
- solves: 解决、治疗、回答
- relates_to: 一般主题关联（其他都不贴切再用）
- precedes: 时间先后顺序
- belongs_to: 归属、隶属
- part_of: 是另一方的组成部分

# 严格规则
1. 只输出**显然成立**的关系——你能在 evidence 里指出具体证据
2. **不要编造 evidence**——必须基于实体名字本身、type、description 三者中的内容
3. 不要重复同一对实体（A→B 已经有 uses，就不要再出 A→B 的 relates_to）
4. 不要给"应用"和"概念"之间无脑加 uses（除非 description 里有明确暗示）
5. confidence ≥ 0.7 才输出；不确定就别给
6. **上限 8 条**，宁缺勿滥

# 输出（仅这一个 JSON 对象，无 markdown 围栏，无任何解释）
{
  "inferences": [
    {
      "source": "实体名字（必须在上面清单里）",
      "target": "实体名字（必须在上面清单里）",
      "relation": "uses | depends_on | references | solves | relates_to | precedes | belongs_to | part_of",
      "evidence": "为什么这个关系成立，引用 description 或 type 里的具体内容",
      "confidence": 0.85
    }
  ]
}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * 从 LLM raw 输出解析推断结果。容错：
 * - 顶层可能没有 "inferences"，直接是数组也认
 * - 单条不合法（缺字段、关系不在白名单、confidence 太低）→ 跳过
 * - 全部失败 → 返回空数组
 */
export function parseInferredRelations(raw: string): InferredRelation[] {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // 试着从 raw 里抠出第一段 {...}
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try { obj = JSON.parse(m[0]); } catch { return []; }
  }
  let arr: unknown;
  if (isRecord(obj) && Array.isArray(obj.inferences)) arr = obj.inferences;
  else if (Array.isArray(obj)) arr = obj;
  else return [];
  const out: InferredRelation[] = [];
  for (const item of arr as unknown[]) {
    if (!isRecord(item)) continue;
    const source = asString(item.source).trim();
    const target = asString(item.target).trim();
    const relation = asString(item.relation).trim().toLowerCase();
    const evidence = asString(item.evidence).trim().slice(0, 240);
    const confidence = asNumber(item.confidence);
    if (!source || !target || source === target) continue;
    if (!VALID_RELATIONS.has(relation)) continue;
    if (confidence < 0.7) continue;
    out.push({ source, target, relation, evidence, confidence });
    if (out.length >= 8) break;
  }
  return out;
}
