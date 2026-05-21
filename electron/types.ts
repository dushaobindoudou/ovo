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

/**
 * 信号强度分级 — 决定 action 是直接执行 / 进草稿台 / 拒绝。
 * 参考 docs/REFLECTION_LOG.md 反思 #2。
 *
 *   - direct      用户在屏幕上明确表达了这个意图（选中文本、输入框打字、点了按钮）
 *   - inferred    屏幕行为强暗示（写邮件中、在 IDE 编辑 TODO 注释等）
 *   - speculative LLM 概念关联，没有屏幕直接证据 → 应该转 suggestion 而不是 action
 *
 * LLM 自报这个值，但主进程 evidence-grounder.ts 会验证 evidence[] 字符串是否
 * 真在 OCR 里找得到。验证不通过的 inferred → 走草稿台（grounded=false），
 * 不会直接执行。这是反幻觉的硬性 check。
 */
export type EvidenceLevel = "direct" | "inferred" | "speculative";

export interface AgentAction {
  id: string;
  description: string;
  params: Record<string, unknown>;
  requireConfirm: boolean;
  priority: number;
  /** 行为类型，约束 LLM 输出，便于本地路由执行 */
  type?: ActionType;
  /** PHIL-1: 玻璃管家三层叙述中的"因为"——LLM 给的执行理由（可选） */
  reason?: string;
  /**
   * 反思 #2 核心字段：LLM 自报的信号等级。缺失时降级为 speculative（最保守）。
   */
  evidence_level?: EvidenceLevel;
  /**
   * LLM 列出的具体屏幕证据，1-3 条短句。例：
   *   ["收件人栏: wang@example.com", "subject 是空的", "用户刚切到 Mail.app"]
   * 主进程 grounder 会用这个数组在 OCR preview 里做子串匹配验证。
   */
  evidence?: string[];
}

export interface AgentSuggestion {
  id: string;
  type: string;
  title: string;
  content: string;
  detail?: string;
  priority: number;
  /** R4-2: 该回执对应的 actionId（撤销复制用）*/
  actionId?: string;
  /** R4-2: 回执是否可撤销（目前仅 copy_to_clipboard）*/
  undoable?: boolean;
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
