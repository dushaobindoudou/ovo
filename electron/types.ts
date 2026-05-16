export type AgentBackend = "claude-code" | "openclaw" | "hermes" | "api";

export interface WindowInfo {
  windowId: string;
  appName: string;
  windowTitle: string;
  bundleId?: string;
  isActive?: boolean;
}

export interface OCRStructuredSignals {
  urls?: string[];
  emails?: string[];
  prices?: string[];
  codeSnippets?: string[];
  headings?: string[];
  filePaths?: string[];
  dates?: string[];
  ipAddrs?: string[];
  hashtags?: string[];
}

export interface OCRTextEntry {
  timestamp: number;
  text: string;
  confidence: number;
  /** P4: regex 抽出的结构化信号，跟原文一起喂给 LLM */
  structured?: OCRStructuredSignals;
}

export interface WindowBuffer {
  windowId: string;
  appName: string;
  windowTitle: string;
  entries: OCRTextEntry[];
  lastFullText: string;
}

export type ActionType =
  | "log_note"
  | "create_todo"
  | "send_email"
  | "send_imessage"
  | "copy_to_clipboard"
  | "search"
  | "search_web"
  | "open_url"
  | "open_app"
  | "summarize"
  | "set_reminder"
  | "add_calendar"
  | "index_path"
  | "other";

export const ACTION_TYPES: ActionType[] = [
  "log_note",
  "create_todo",
  "send_email",
  "send_imessage",
  "copy_to_clipboard",
  "search",
  "search_web",
  "open_url",
  "open_app",
  "summarize",
  "set_reminder",
  "add_calendar",
  "index_path",
  "other"
];

export interface AgentAction {
  id: string;
  description: string;
  params: Record<string, unknown>;
  requireConfirm: boolean;
  priority: number;
  /** 行为类型，约束 LLM 输出，便于本地路由执行 */
  type?: ActionType;
}

export interface AgentSuggestion {
  id: string;
  type: string;
  title: string;
  content: string;
  detail?: string;
  priority: number;
}

export type EntityType =
  | "person"
  | "project"
  | "document"
  | "concept"
  | "organization"
  | "location"
  | "application"
  | "application_file"
  | "behavior_pattern"
  | "watchlist"
  | "interest_profile"
  | "learning_graph"
  | "action_type"
  | "insight_summary";

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  description?: string;
  attributes?: Record<string, unknown>;
}

export interface ExtractedRelation {
  source: string;
  target: string;
  relation: string;
  context?: string;
}

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

/**
 * Q1: 用户当下扮演的角色推断（不是职业，是此刻屏幕活动暗示的角色）。
 * 例：看 BTC 行情 → role="加密资产持有者"；看孩子学校群 → role="家长"
 */
export interface UserRoleHypothesis {
  role: string;
  /** 屏幕证据 + KG 历史活动支撑 */
  evidence: string[];
  /** 0-1 */
  confidence: number;
}

/**
 * Q1: ovo 长期能为用户做的"持续服务"，不是这一秒的 action。
 * 例：每天给 BTC 简报 / 跌破 90k 提醒 / 跟踪学习进度
 */
export interface OvoOffer {
  id: string;
  title: string;
  /** 用户接受这个 offer 能具体得到啥好处 */
  value_prop: string;
  /** 接受后 ovo 立即能给的样本预览，让用户先尝再决定 */
  first_action_preview?: string;
  frequency: "daily" | "weekly" | "event-driven" | "one-shot";
  /** 后端 capability id，用户接受后用它注册周期任务（capability 系统未上线时仅记录） */
  needs_capability?: string;
  /** 0-1，综合角色置信 + offer 契合度 */
  confidence: number;
}

export interface AgentParsedPayload {
  intent: string;
  prediction: string;
  actions: AgentAction[];
  suggestions: AgentSuggestion[];
  content: string[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelation[];
  /** O1: LLM 给的 30 字以内卡片标题，悬浮球 tooltip 用 */
  summary?: string;
  /** O1: LLM 自判风险等级 */
  risk?: RiskLevel;
  /** Q1: 当下角色推断 */
  user_role_hypothesis?: UserRoleHypothesis;
  /** Q1: 长期意图（不是此刻一秒，是这个月/这一年） */
  latent_intent?: string;
  /** Q1: ovo 提议的长期服务，每屏最多 2 个 */
  offers?: OvoOffer[];
}

export interface AgentSchemaMeta {
  repaired: boolean;
  degraded: boolean;
  notes: string[];
}

export interface AgentResponse {
  ok: boolean;
  backend: AgentBackend;
  duration: number;
  raw: string;
  parsed?: AgentParsedPayload;
  error?: string;
  schemaMeta?: AgentSchemaMeta;
}

export interface StageLog {
  status: "success" | "failed" | "skipped";
  startTime: number;
  duration: number;
  /** 此阶段的输入摘要（人类可读） */
  input?: Record<string, unknown>;
  /** 此阶段的输出摘要（人类可读） */
  output?: Record<string, unknown>;
  /** 出错时的错误信息 */
  error?: string;
  /** 兼容字段：旧代码塞了一堆杂项，等价于 output */
  data: Record<string, unknown>;
  rating?: "good" | "bad";
  ratingComment?: string;
}

export interface PipelineLog {
  id: string;
  timestamp: number;
  duration: number;
  status: "running" | "completed" | "failed";
  stages: Record<string, StageLog>;
  overallRating?: "good" | "neutral" | "bad";
}
