import { useState } from "react";
import { Card } from "../shared/Card";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useAgentBridge } from "../../hooks/useAgentBridge";

const presets = [
  { id: "coding", name: "编码辅助", desc: "代码生成与审查" },
  { id: "learning", name: "学习场景", desc: "知识问答与解释" },
  { id: "debug", name: "调试场景", desc: "Bug 定位与修复" },
  { id: "creative", name: "创意场景", desc: "创意写作与头脑风暴" },
  { id: "ocr", name: "OCR 上下文", desc: "屏幕文字识别分析" }
];

export function AgentTestPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { testScenario } = useAgentBridge();
  const [scenario, setScenario] = useState(ctx?.selectedId ?? "coding");
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const selectedPreset = presets.find((p) => p.id === scenario);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agent 测试</h2>

      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <Card title="场景配置">
          <div className="space-y-3">
            {selectedPreset && (
              <div className="rounded-lg bg-[var(--accent-dim)] px-3 py-2">
                <p className="font-medium text-[var(--accent)]">{selectedPreset.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{selectedPreset.desc}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setScenario(p.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition-all ${
                    scenario === p.id
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <Input value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="可选：自定义提示词" />
            <GlowButton
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void testScenario(scenario, customPrompt).then((res) => setResult(JSON.stringify(res, null, 2))).finally(() => setLoading(false));
              }}
            >
              {loading ? "运行中..." : "运行测试"}
            </GlowButton>
          </div>
        </Card>

        <Card title="响应结果">
          <pre className="min-h-[300px] overflow-auto rounded-lg bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]">
            {result || "暂无结果"}
          </pre>
        </Card>
      </div>
    </div>
  );
}
