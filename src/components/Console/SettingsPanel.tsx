import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAgentBridge } from "../../hooks/useAgentBridge";

export function SettingsPanel() {
  const {
    captureInterval,
    setCaptureInterval,
    selectedBackend,
    setSelectedBackend,
    ttsEnabled,
    setTtsEnabled,
    simulationMode,
    setSimulationMode
  } = useSettingsStore();
  const { setBackend } = useAgentBridge();
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.anthropic.com");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");

  useEffect(() => {
    void window.nudgeAPI.capture.getSimulation().then((result) => {
      setSimulationMode(Boolean(result?.simulationMode));
    });
  }, [setSimulationMode]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">设置</h2>
      <Card title="屏幕捕获">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">捕获间隔</span>
            <Select value={captureInterval} onChange={(e) => setCaptureInterval(Number(e.target.value))}>
              {[1, 3, 5, 10, 15, 30, 60].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} 秒
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
            <div>
              <p className="text-sm">权限模拟模式</p>
              <p className="text-xs text-[var(--text-secondary)]">无屏幕录制权限时可走完整链路测试</p>
            </div>
            <Toggle
              checked={simulationMode}
              onChange={(enabled) => {
                setSimulationMode(enabled);
                void window.nudgeAPI.capture.setSimulation(enabled);
              }}
            />
          </div>
        </div>
      </Card>

      <Card title="Agent 后端">
        <div className="space-y-3">
          <Select
            value={selectedBackend}
            onChange={(e) => {
              const backend = e.target.value as typeof selectedBackend;
              setSelectedBackend(backend);
              void setBackend(backend);
            }}
          >
            <option value="claude-code">Claude Code</option>
            <option value="openclaw">OpenClaw</option>
            <option value="hermes">Hermes</option>
            <option value="api">直接 API</option>
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="API Base URL" />
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" />
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
          </div>
          <GlowButton
            onClick={() =>
              window.nudgeAPI.invoke("agent:set-api-config", {
                baseUrl: apiBaseUrl,
                key: apiKey,
                model
              })
            }
          >
            保存 API 配置
          </GlowButton>
        </div>
      </Card>

      <Card title="语音输出">
        <div className="flex items-center justify-between">
          <p className="text-sm">启用 Edge TTS</p>
          <Toggle checked={ttsEnabled} onChange={setTtsEnabled} />
        </div>
      </Card>
    </div>
  );
}
