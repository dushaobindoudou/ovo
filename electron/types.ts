export type AgentBackend = "claude-code" | "openclaw" | "hermes" | "api";

export interface WindowInfo {
  windowId: string;
  appName: string;
  windowTitle: string;
  bundleId?: string;
  isActive?: boolean;
}

export interface OCRTextEntry {
  timestamp: number;
  text: string;
  confidence: number;
}

export interface WindowBuffer {
  windowId: string;
  appName: string;
  windowTitle: string;
  entries: OCRTextEntry[];
  lastFullText: string;
}

export interface AgentAction {
  id: string;
  description: string;
  params: Record<string, unknown>;
  requireConfirm: boolean;
  priority: number;
}

export interface AgentSuggestion {
  id: string;
  type: string;
  title: string;
  content: string;
  detail?: string;
  priority: number;
}

export interface ExtractedEntity {
  name: string;
  type: "person" | "project" | "document" | "concept" | "organization" | "location" | "application";
  description?: string;
  attributes?: Record<string, unknown>;
}

export interface ExtractedRelation {
  source: string;
  target: string;
  relation: string;
  context?: string;
}

export interface AgentParsedPayload {
  intent: string;
  prediction: string;
  actions: AgentAction[];
  suggestions: AgentSuggestion[];
  content: string[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelation[];
}

export interface AgentResponse {
  ok: boolean;
  backend: AgentBackend;
  duration: number;
  raw: string;
  parsed?: AgentParsedPayload;
  error?: string;
}

export interface StageLog {
  status: "success" | "failed" | "skipped";
  startTime: number;
  duration: number;
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
