import { KnowledgeGraphEngine } from "./knowledge-graph.js";

export interface PersonalityProfile {
  traits: Array<{ name: string; score: number; evidence: string }>;
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

export class PersonalityAnalyzer {
  constructor(private readonly kg: KnowledgeGraphEngine) {}

  analyze(): PersonalityProfile {
    const stats = this.kg.getStats();
    const scoreBase = Math.min(1, stats.events / 200);
    return {
      traits: [
        { name: "技术专注型", score: Math.min(0.9, 0.4 + scoreBase), evidence: "代码与文档场景占比高" },
        { name: "多任务并行", score: Math.min(0.85, 0.35 + scoreBase * 0.8), evidence: "多窗口切换频繁" }
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
      summary: "你是偏技术驱动、重效率的工作风格，建议默认给出结构化与可执行的建议。",
      lastUpdated: Date.now()
    };
  }

  getToneForContext(appName: string) {
    if (/mail|gmail|outlook/i.test(appName)) return "正式礼貌";
    if (/wechat|slack|discord/i.test(appName)) return "自然亲和";
    return "专业高效";
  }
}
