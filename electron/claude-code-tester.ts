import { AgentBridge } from "./agent-bridge.js";

export interface TestScenario {
  id: string;
  name: string;
  prompt: string;
}

export class ClaudeCodeTester {
  private readonly scenarios: TestScenario[] = [
    { id: "coding", name: "编码辅助", prompt: "用户正在写 React 组件，请给 3 条高价值建议。" },
    { id: "learning", name: "学习场景", prompt: "用户正在看技术文档，请给出理解和行动建议。" },
    { id: "debug", name: "调试场景", prompt: "用户在看报错日志，请判断根因并给排查步骤。" },
    { id: "creative", name: "创意场景", prompt: "用户在做产品设计，请给 3 个可执行创意方向。" },
    { id: "ocr", name: "OCR 上下文", prompt: "基于屏幕 OCR 内容推测用户意图并输出 actions。" }
  ];

  constructor(private readonly bridge: AgentBridge) {}

  getPresetScenarios() {
    return this.scenarios;
  }

  async runScenario(payload: { scenarioId: string; customPrompt?: string }) {
    const scenario = this.scenarios.find((item) => item.id === payload.scenarioId);
    if (!scenario) throw new Error("场景不存在");
    return this.bridge.call({
      prompt: payload.customPrompt?.trim() ? payload.customPrompt : scenario.prompt,
      outputFormat: "json",
      timeout: 60_000
    });
  }
}
