/**
 * P8: 每日 prompt 自评（GEPA 简化版）
 *
 * 思路：
 *   1. 拉过去 24h 低分 pipeline（outcome_score < 0.4）
 *   2. 把它们的 agent 输出 + 输入摘要喂给一个"评审 prompt"
 *   3. LLM 看完后产出 N 条具体修改建议（含 problem / proposed_change / evidence）
 *   4. 写入 prompt_eval_suggestions 表，等用户人工 review
 *   5. 用户 review 后可手动 apply / dismiss
 *
 * 不直接改 prompt 模板——所有修改都需要人工确认。
 * 这就是 hermes-agent-self-evolution 的"提 PR 给人 review"思路的简化版。
 */

export interface SelfEvalSuggestion {
  scope: "observation_prompt" | "synthesis_prompt" | "entity_extraction" | "offer_generation" | "general";
  problem: string;
  proposed_change: string;
  evidence: string;
  confidence: number;
}

const VALID_SCOPES = new Set([
  "observation_prompt", "synthesis_prompt", "entity_extraction", "offer_generation", "general"
]);

export function buildSelfEvalPrompt(
  lowOutcomePipelines: Array<{ id: string; timestamp: number; outcome_score: number; stages_summary: string }>
): string {
  const samplesText = lowOutcomePipelines
    .map((p, i) => `### Pipeline ${i + 1} (id=${p.id}, score=${p.outcome_score.toFixed(2)}, time=${new Date(p.timestamp).toISOString()})
${p.stages_summary}`)
    .join("\n\n");

  return `你是 ovo 的 prompt 自评审稿人。

ovo 是一个观察用户屏幕、推断意图、给出建议的桌面副驾驶。它的 prompt 模板有几段：
- **observation_prompt**: 观察屏幕、抽实体、推断角色和长期意图
- **synthesis_prompt**: 基于观察结果生成 offers / actions / suggestions
- **entity_extraction**: 实体抽取规则（什么该抽什么不该抽）
- **offer_generation**: offer 写法规范

下面是过去 24 小时**评分较低**（用户没接受 / 输出空泛 / 角色推断弱）的 pipeline 样本：

${samplesText}

# 你的任务
分析这些低分样本的**共性问题**，给 prompt 模板提**具体可执行**的修改建议。

# 严格规则
1. 每条建议必须 **scope** 明确（observation_prompt | synthesis_prompt | entity_extraction | offer_generation | general）
2. **problem** 必须基于上面样本里的具体内容，不要泛泛而谈
3. **proposed_change** 必须是可以**直接 copy-paste 进 prompt** 的文本（一句话规则、一条新例子、一处规则修改）
4. **evidence** 必须引用上面样本的具体片段
5. **confidence** 0-1，对你的建议的把握程度
6. 上限 5 条；宁缺勿滥；没找到清晰共性问题就少给

# 输出 JSON（仅此对象，无 markdown 围栏，无解释）
{
  "suggestions": [
    {
      "scope": "observation_prompt | synthesis_prompt | entity_extraction | offer_generation | general",
      "problem": "string  // ≤120 字，具体描述问题",
      "proposed_change": "string  // ≤240 字，可直接 paste 进 prompt 的文本",
      "evidence": "string  // 引用上面样本里的具体片段（≤120 字）",
      "confidence": 0.85
    }
  ]
}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function asString(v: unknown, fb = ""): string { return typeof v === "string" ? v : fb; }
function asNumber(v: unknown, fb = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v); if (Number.isFinite(n)) return n; }
  return fb;
}

export function parseSelfEvalSuggestions(raw: string): SelfEvalSuggestion[] {
  let obj: unknown;
  try { obj = JSON.parse(raw); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try { obj = JSON.parse(m[0]); } catch { return []; }
  }
  let arr: unknown;
  if (isRecord(obj) && Array.isArray(obj.suggestions)) arr = obj.suggestions;
  else if (Array.isArray(obj)) arr = obj;
  else return [];
  const out: SelfEvalSuggestion[] = [];
  for (const item of arr as unknown[]) {
    if (!isRecord(item)) continue;
    const scope = asString(item.scope).trim().toLowerCase();
    const problem = asString(item.problem).trim();
    const proposed_change = asString(item.proposed_change).trim();
    const evidence = asString(item.evidence).trim().slice(0, 240);
    const confidence = asNumber(item.confidence);
    if (!problem || !proposed_change) continue;
    if (!VALID_SCOPES.has(scope)) continue;
    out.push({
      scope: scope as SelfEvalSuggestion["scope"],
      problem: problem.slice(0, 240),
      proposed_change: proposed_change.slice(0, 480),
      evidence,
      confidence: Math.max(0, Math.min(1, confidence))
    });
    if (out.length >= 5) break;
  }
  return out;
}
