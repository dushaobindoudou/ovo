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

/** 建议类型 → 视觉语言。Toast 与 SuggestionCard 共用，保持一致 */
export const SUGGESTION_TYPE_MAP: Record<string, SuggestionTypeSpec> = {
  content_help:   { icon: Lightbulb,     label: "内容建议", accent: "#1890ff", tint: "rgba(24,144,255,0.08)" },
  risk_alert:     { icon: AlertTriangle, label: "风险提醒", accent: "#ff4d4f", tint: "rgba(255,77,79,0.08)" },
  todo_record:    { icon: ListTodo,      label: "待办",     accent: "#07c160", tint: "rgba(7,193,96,0.08)" },
  memory_recall:  { icon: BookOpen,      label: "记忆回顾", accent: "#a78bfa", tint: "rgba(167,139,250,0.10)" },
  topic_suggest:  { icon: MessageCircle, label: "话题",     accent: "#14b8a6", tint: "rgba(20,184,166,0.08)" },
  doc_summary:    { icon: FileText,      label: "摘要",     accent: "#6366f1", tint: "rgba(99,102,241,0.08)" },
  emotion_adjust: { icon: Heart,         label: "情绪",     accent: "#ec4899", tint: "rgba(236,72,153,0.08)" },
  // toast 专用：
  receipt:        { icon: Check,         label: "已完成",   accent: "#07c160", tint: "rgba(7,193,96,0.10)" },
  offer:          { icon: Zap,           label: "长期协助", accent: "#a78bfa", tint: "rgba(167,139,250,0.10)" }
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
