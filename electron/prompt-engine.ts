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

  return `你是 ovo 主动式桌面助手。\n\n## 当前屏幕活动\n${activity}\n\n## 图谱上下文\n### 相关实体\n${entities || "- 无"}\n### 相关关系\n${relations || "- 无"}\n\n## 用户人格摘要\n${personality}\n\n请返回 JSON：intent、prediction、actions、suggestions、content、entities、relationships。`;
}

export function buildActionExecutionPrompt(description: string, params: Record<string, unknown>) {
  return `你是 ovo 的 Action 执行器。\n\n操作描述: ${description}\n参数: ${JSON.stringify(params)}\n\n请使用你可用的工具完成该操作，并输出执行结果（JSON）。`;
}
