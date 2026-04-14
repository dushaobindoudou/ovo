import { useState } from "react";
import { Card } from "../shared/Card";
import { Select } from "../shared/Select";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useAgentBridge } from "../../hooks/useAgentBridge";

const presets = [
  { id: "coding", name: "编码辅助" },
  { id: "learning", name: "学习场景" },
  { id: "debug", name: "调试场景" },
  { id: "creative", name: "创意场景" },
  { id: "ocr", name: "OCR 上下文" }
];

export function AgentTestPanel() {
  const { testScenario } = useAgentBridge();
  const [scenario, setScenario] = useState("coding");
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState<string>("");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agent 测试</h2>
      <div className="grid grid-cols-[320px_1fr] gap-4">
        <Card title="场景配置">
          <div className="space-y-3">
            <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {presets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="可选：自定义提示词"
            />
            <GlowButton
              onClick={() =>
                void testScenario(scenario, customPrompt).then((res) =>
                  setResult(JSON.stringify(res, null, 2))
                )
              }
            >
              运行测试
            </GlowButton>
          </div>
        </Card>
        <Card title="响应结果">
          <pre className="min-h-[300px] overflow-auto rounded bg-black/30 p-3 text-xs text-[var(--text-secondary)]">
            {result || "暂无结果"}
          </pre>
        </Card>
      </div>
    </div>
  );
}
