import type { ExtractedEntity, ExtractedRelation, WindowBuffer } from "./types.js";

export interface GraphContext {
  relevantEntities: ExtractedEntity[];
  relevantRelations: ExtractedRelation[];
  /** 高密度记忆摘要：经过聚合的 insight_summary 类型 entity（H10 引入） */
  insightSummaries?: Array<{ name: string; description: string; importance: number }>;
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
  const summaries = (graphContext.insightSummaries ?? [])
    .map((s) => `- [importance=${s.importance}] ${s.name}: ${s.description}`)
    .join("\n");
  const appNames = Array.from(new Set(windowBuffers.map((buf) => buf.appName))).filter(Boolean);

  return `你是 ovo 主动式桌面助手。你的任务是观察用户屏幕，**预测用户下一步可能的行为**，并提取知识图谱信息让自己越用越懂用户。

## 当前屏幕活动
${activity}

## 图谱上下文
### 相关实体
${entities || "- 无"}
### 相关关系
${relations || "- 无"}
### 高密度记忆摘要
${summaries || "- 无"}

## 用户人格摘要
${personality}

# 可用动作类型（actions[].type 必须从这里选）
- \`log_note\`：把当前屏幕内容的关键信息归档到知识库（最低保底动作）。params: { summary: string, tags?: string[] }
- \`create_todo\`：发现明确待办事项时创建一条 todo。params: { title: string, dueAt?: string, priority?: "low"|"medium"|"high" }
- \`send_email\`：屏幕显示用户在草拟邮件时建议发送或修改。params: { to?: string, subject?: string, body?: string }，requireConfirm 必须为 true
- \`copy_to_clipboard\`：将一段值得复用的内容（链接、命令、JSON）复制到剪贴板。params: { text: string }
- \`search\`：屏幕里出现用户可能想查的关键词时，建议查询。params: { query: string, target?: "web"|"docs"|"history" }
- \`open_app\`：建议切换到另一个应用完成任务。params: { app: string, hint?: string }，requireConfirm 必须为 true
- \`summarize\`：当前内容很长建议生成摘要并存档。params: { scope: "current_window"|"recent_5_events" }
- \`set_reminder\`：检测到时间敏感信息时设置提醒。params: { at: string, message: string }
- \`other\`：以上都不合适才用，并在 description 里说清动机。

# 关系类型枚举（relationships[].relation 优先用这些值）
\`uses\` | \`depends_on\` | \`references\` | \`solves\` | \`relates_to\` | \`precedes\` | \`belongs_to\` | \`part_of\`

# 输出要求
你必须只输出**一个**合法 JSON 对象，不要 markdown 围栏，不要解释，不要额外文本。

JSON schema:
{
  "intent": "string  // 用户当前意图，简短一句中文",
  "prediction": "string  // 你对用户下一步行为的具体预测",
  "actions": [
    {
      "id": "string  // snake_case 短标识",
      "type": "log_note | create_todo | send_email | copy_to_clipboard | search | open_app | summarize | set_reminder | other",
      "description": "string  // 给人看的中文描述，例如「把今天的会议要点存入知识库」",
      "params": {},
      "requireConfirm": false,
      "priority": 0
    }
  ],
  "suggestions": [
    {
      "id": "string",
      "type": "string  // tip|risk|insight 等",
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
      "type": "person|project|document|concept|organization|location|application|action_type|insight_summary",
      "description": "string",
      "attributes": {}
    }
  ],
  "relationships": [
    {
      "source": "string",
      "target": "string",
      "relation": "string  // 优先用上面枚举",
      "context": "string"
    }
  ]
}

# 规则
1. 所有顶层字段都必须存在，不能省略。
2. **actions 数组必须 ≥ 1 条，绝不允许为空**。如果实在没有明确意图，至少返回一条 \`type: "log_note"\` 把当前活动归档（这正是 ovo "越用越聪明"的关键 —— 每次都留下记忆）。
3. **entities 必须 ≥ 1 条**：当前正在交互的应用本身就是一个 \`application\` 类型 entity，必须出现在 entities 里。已知应用名: ${appNames.length > 0 ? appNames.join(", ") : "(未识别)"}。
4. actions[].type 必须严格从枚举里选，未列出的统一选 \`other\`。
5. send_email / open_app 类型 requireConfirm 必须为 true；其余类型默认 false。
6. priority 用数字 0-100；数值越大越紧急。
7. content 必须是字符串数组；如果只有一句回复，也要包装成数组。
8. relationships 应优先用上面枚举的 relation 值；当现有图谱实体能与本次发现连接时尽量产出 ≥ 1 条边。
9. 不要把 JSON 放进字符串字段里。
10. 不要 markdown，不要 \`\`\`json 围栏，不要任何前后缀。`;
}

export function buildActionExecutionPrompt(description: string, params: Record<string, unknown>) {
  return `你是 ovo 的 Action 执行器。\n\n操作描述: ${description}\n参数: ${JSON.stringify(params)}\n\n请使用你可用的工具完成该操作，并输出执行结果（JSON）。`;
}
