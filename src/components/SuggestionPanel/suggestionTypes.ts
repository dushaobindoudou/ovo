import {
  AlertTriangle,
  BookOpen,
  Check,
  FileText,
  Heart,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Sparkles,
  Zap,
  type LucideIcon
} from "lucide-react";

export interface SuggestionTypeSpec {
  icon: LucideIcon;
  label: string;
  accent: string;
  tint: string;
}

/**
 * 建议类型 → 视觉语言。Toast 与 SuggestionCard 共用，保持一致。
 *
 * B2 / B3 修复（2026-05-17）：删除 Ant Design 蓝 #1890ff / 微信绿 #07c160 等竞品色板，
 * 全部迁移到项目 CSS 变量（systemBlue 主色 + iOS system colors 状态色）。
 * 这样建议色板与 OvoLogo / FloatingIcon / AnimatedLogo / Tray 完全归一。
 */
export const SUGGESTION_TYPE_MAP: Record<string, SuggestionTypeSpec> = {
  content_help:   { icon: Lightbulb,     label: "内容建议", accent: "var(--accent)",        tint: "var(--accent-dim)" },
  risk_alert:     { icon: AlertTriangle, label: "风险提醒", accent: "var(--danger)",        tint: "rgba(255,59,48,0.08)" },
  todo_record:    { icon: ListTodo,      label: "待办",     accent: "var(--success)",       tint: "rgba(52,199,89,0.10)" },
  memory_recall:  { icon: BookOpen,      label: "记忆回顾", accent: "var(--state-thinking)", tint: "rgba(88,86,214,0.10)" },
  topic_suggest:  { icon: MessageCircle, label: "话题",     accent: "var(--accent)",        tint: "var(--accent-dim)" },
  doc_summary:    { icon: FileText,      label: "摘要",     accent: "var(--secondary)",     tint: "rgba(88,86,214,0.08)" },
  emotion_adjust: { icon: Heart,         label: "情绪",     accent: "var(--warning)",       tint: "rgba(255,149,0,0.08)" },
  // toast 专用：
  receipt:        { icon: Check,         label: "已完成",   accent: "var(--success)",       tint: "rgba(52,199,89,0.10)" },
  offer:          { icon: Zap,           label: "长期协助", accent: "var(--state-thinking)", tint: "rgba(88,86,214,0.10)" }
};

export const DEFAULT_SUGGESTION_SPEC: SuggestionTypeSpec = {
  icon: Sparkles,
  label: "建议",
  accent: "var(--accent)",
  tint: "var(--accent-dim)"
};

export function getSuggestionSpec(type: string): SuggestionTypeSpec {
  return SUGGESTION_TYPE_MAP[type] ?? DEFAULT_SUGGESTION_SPEC;
}
