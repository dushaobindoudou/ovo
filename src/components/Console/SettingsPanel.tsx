import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useSettingsStore, type ThemeMode } from "../../stores/settingsStore";
import { useAgentBridge } from "../../hooks/useAgentBridge";
import { useCapture } from "../../hooks/useCapture";
import { useHealth } from "../../hooks/useHealth";

export function SettingsPanel() {
  const {
    theme,
    setTheme,
    captureInterval,
    setCaptureInterval,
    selectedBackend,
    setSelectedBackend,
    ttsEnabled,
    setTtsEnabled,
    healthCheckEnabled,
    setHealthCheckEnabled,
    healthCheckInterval,
    setHealthCheckInterval
  } = useSettingsStore();
  const { setBackend, setApiConfig } = useAgentBridge();
  const { takeScreenshot } = useCapture();
  const { getConfig, setConfig } = useHealth();
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.anthropic.com");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");

  useEffect(() => {
    void getConfig().then((cfg) => {
      if (!cfg) return;
      setHealthCheckEnabled(Boolean(cfg.enabled));
      setHealthCheckInterval(Number(cfg.intervalSeconds || 60));
    });
  }, [getConfig, setHealthCheckEnabled, setHealthCheckInterval]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">设置</h2>

      <Card title="外观">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">主题模式</p>
              <p className="text-xs text-[var(--text-muted)]">选择应用外观主题</p>
            </div>
            <Select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
              <option value="light">浅色</option>
              <option value="dark">暗黑</option>
              <option value="system">跟随系统</option>
            </Select>
          </div>
        </div>
      </Card>

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
          <div className="rounded border border-[var(--border)] px-3 py-2">
            <p className="text-sm">真实数据采集模式</p>
            <p className="text-xs text-[var(--text-muted)]">
              模拟数据已禁用。若截图失败，请在系统隐私设置中授予「屏幕录制」权限。
            </p>
            <GlowButton className="mt-2" onClick={() => void takeScreenshot()}>
              验证真实截图权限
            </GlowButton>
          </div>
          <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
            <div>
              <p className="text-sm">定期截屏自检</p>
              <p className="text-xs text-[var(--text-secondary)]">周期性验证捕获/OCR链路，异常会在状态面板告警</p>
            </div>
            <Toggle
              checked={healthCheckEnabled}
              onChange={(enabled) => {
                setHealthCheckEnabled(enabled);
                void setConfig({ enabled });
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">自检间隔</span>
            <Select
              value={healthCheckInterval}
              onChange={(e) => {
                const intervalSeconds = Number(e.target.value);
                setHealthCheckInterval(intervalSeconds);
                void setConfig({ intervalSeconds });
              }}
            >
              {[30, 60, 120, 300].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} 秒
                </option>
              ))}
            </Select>
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
              setApiConfig({
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
