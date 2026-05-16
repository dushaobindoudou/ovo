import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { preferencesStore } from "./preferences-store.js";

export interface PersonalityEvidence {
  eventId?: string;
  appName?: string;
  snippet: string;
  timestamp: number;
}

export interface PersonalityTrait {
  name: string;
  score: number;
  /** 文字总结，向后兼容旧前端 */
  evidence: string;
  /** 结构化证据点，按事件来源展示 */
  evidenceSources: PersonalityEvidence[];
}

export interface PersonalityProfile {
  traits: PersonalityTrait[];
  workPatterns: {
    peakHours: string[];
    commonApps: string[];
    focusDuration: number;
  };
  communicationStyle: {
    formal: number;
    verbose: number;
    responseSpeed: string;
  };
  summary: string;
  lastUpdated: number;
}

interface MemoryEventRow {
  id: string;
  timestamp: number;
  app_name: string;
  window_title: string | null;
  intent: string | null;
  summary: string | null;
  content: string | null;
}

const TECH_APP_PATTERN = /vscode|visual studio code|terminal|iterm|xcode|jetbrains|webstorm|pycharm|chrome devtools|github|stackoverflow/i;
const MULTI_TASK_PATTERN = /(切换|switch|tab|多窗口|multi)/i;

function pickRecentEvidence(
  events: MemoryEventRow[],
  predicate: (event: MemoryEventRow) => boolean,
  limit = 3
): PersonalityEvidence[] {
  const matched: PersonalityEvidence[] = [];
  for (const event of events) {
    if (matched.length >= limit) break;
    if (!predicate(event)) continue;
    const snippet = (event.summary || event.intent || event.content || "").slice(0, 120);
    matched.push({
      eventId: event.id,
      appName: event.app_name,
      snippet,
      timestamp: event.timestamp
    });
  }
  return matched;
}

export class PersonalityAnalyzer {
  constructor(private readonly kg: KnowledgeGraphEngine) {}

  analyze(): PersonalityProfile {
    const stats = this.kg.getStats();
    const events = this.kg.getEvents(80) as MemoryEventRow[];
    const scoreBase = Math.min(1, stats.events / 200);

    const techEvents = events.filter((event) => TECH_APP_PATTERN.test(event.app_name || ""));
    const techRatio = events.length === 0 ? 0 : techEvents.length / events.length;
    const techScore = Math.min(0.95, 0.35 + scoreBase * 0.5 + techRatio * 0.3);

    const multiTaskHits = events.filter((event) =>
      MULTI_TASK_PATTERN.test(event.window_title || "") || MULTI_TASK_PATTERN.test(event.intent || "")
    );
    const multiTaskScore = Math.min(0.9, 0.3 + scoreBase * 0.4 + Math.min(0.4, multiTaskHits.length / 20));

    const techEvidence = pickRecentEvidence(events, (event) => TECH_APP_PATTERN.test(event.app_name || ""));
    const multiEvidence = pickRecentEvidence(events, (event) =>
      MULTI_TASK_PATTERN.test(event.window_title || "") || MULTI_TASK_PATTERN.test(event.intent || "")
    );

    const overrides = preferencesStore.get().personalityOverrides ?? {};
    const applyOverride = (name: string, base: number) => {
      const ov = overrides[name];
      return typeof ov === "number" && ov >= 0 && ov <= 1 ? ov : base;
    };
    const overriddenNames = Object.keys(overrides);

    return {
      traits: [
        {
          name: "技术专注型",
          score: applyOverride("技术专注型", techScore),
          evidence: overrides["技术专注型"] !== undefined
            ? "用户手动设置"
            : techEvidence.length
              ? `近期 ${techEvidence.length} 条事件命中技术类应用`
              : "代码与文档场景占比高",
          evidenceSources: techEvidence
        },
        {
          name: "多任务并行",
          score: applyOverride("多任务并行", multiTaskScore),
          evidence: overrides["多任务并行"] !== undefined
            ? "用户手动设置"
            : multiEvidence.length
              ? `近期检测到 ${multiEvidence.length} 次窗口/标签切换`
              : "多窗口切换频繁",
          evidenceSources: multiEvidence
        }
      ],
      workPatterns: {
        peakHours: ["09:00-12:00", "14:00-17:00"],
        commonApps: ["VS Code", "Chrome", "微信"],
        focusDuration: 25
      },
      communicationStyle: {
        formal: 0.62,
        verbose: 0.48,
        responseSpeed: "快速回复"
      },
      summary: overriddenNames.length > 0
        ? `你是偏技术驱动、重效率的工作风格（用户已手动覆盖 ${overriddenNames.length} 个维度：${overriddenNames.join("、")}），建议默认给出结构化与可执行的建议。`
        : "你是偏技术驱动、重效率的工作风格，建议默认给出结构化与可执行的建议。",
      lastUpdated: Date.now()
    };
  }

  getToneForContext(appName: string) {
    if (/mail|gmail|outlook/i.test(appName)) return "正式礼貌";
    if (/wechat|slack|discord/i.test(appName)) return "自然亲和";
    return "专业高效";
  }
}
