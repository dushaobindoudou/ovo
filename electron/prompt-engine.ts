import type { ExtractedEntity, ExtractedRelation, WindowBuffer } from "./types.js";

export interface GraphContext {
  relevantEntities: ExtractedEntity[];
  relevantRelations: ExtractedRelation[];
}

export function buildIntentPrompt(windowBuffers: WindowBuffer[], graphContext: GraphContext, personality: string) {
  const activity = windowBuffers
    .map(
      (buffer) =>
        `### 窗口: ${buffer.appName} - ${buffer.windowTitle}\n` +
        buffer.entries
          .map((entry) => `[${new Date(entry.timestamp).toISOString()}] ${entry.text.slice(0, 800)}`)
          .join("\n")
    )
    .join("\n\n");

  const entities = graphContext.relevantEntities
    .map((entity) => `- ${entity.name} (${entity.type}): ${entity.description ?? ""}`)
    .join("\n");
  const relations = graphContext.relevantRelations
    .map((relation) => `- ${relation.source} --[${relation.relation}]--> ${relation.target}`)
    .join("\n");

  return `你是 ovo 主动式桌面助手。

## 当前屏幕活动
${activity}

## 图谱上下文
### 相关实体
${entities || "- 无"}
### 相关关系
${relations || "- 无"}

## 用户人格摘要
${personality}

你必须只输出一个合法 JSON 对象，不要 markdown，不要解释，不要输出额外文本。

JSON schema:
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
  "entities": [
    {
      "name": "string",
      "type": "person|project|document|concept|organization|location|application",
      "description": "string",
      "attributes": {}
    }
  ],
  "relationships": [
    {
      "source": "string",
      "target": "string",
      "relation": "string",
      "context": "string"
    }
  ]
}

规则:
1. 所有字段都必须存在，不能省略。
2. actions 必须是对象数组，不能是字符串数组。
3. suggestions 必须是对象数组，不能只返回字符串。
4. content 必须是字符串数组；如果只有一句回复，也要包装成数组。
5. 如果当前屏幕活动已经体现出明确意图，并且存在可执行下一步，则 actions 至少返回 1 条，不能空数组。
6. action.description 要写成人类可执行的话，例如“查询今日天气”。
7. action.id 要稳定、简短，可用 snake_case。
8. priority 用数字，建议范围 0-100。
9. 如果没有可执行 action，也必须在 prediction 里明确说明原因。
10. 不要把 JSON 放进字符串字段里。`;
}

export function buildActionExecutionPrompt(description: string, params: Record<string, unknown>) {
  return `你是 ovo 的 Action 执行器。\n\n操作描述: ${description}\n参数: ${JSON.stringify(params)}\n\n请使用你可用的工具完成该操作，并输出执行结果（JSON）。`;
}
