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
import { usePermissions } from "../../hooks/usePermissions";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";

export function SettingsPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const {
    theme, setTheme, captureInterval, setCaptureInterval, selectedBackend, setSelectedBackend,
    agentInterval, setAgentInterval,
    ttsEnabled, setTtsEnabled, healthCheckEnabled, setHealthCheckEnabled,
    healthCheckInterval, setHealthCheckInterval,
    apiBaseUrl, apiKey, apiModel, setApiBaseUrl, setApiKey, setApiModel,
    toastVerbosity, setToastVerbosity,
    developerMode, setDeveloperMode
  } = useSettingsStore();
  const { setBackend, setApiConfig } = useAgentBridge();
  const {
    takeScreenshot,
    setInterval: setCaptureIntervalIPC,
    setAgentInterval: setAgentIntervalIPC,
    getAgentInterval: getAgentIntervalIPC
  } = useCapture();
  const { getConfig, setConfig } = useHealth();
  const { screenRecordingMissing, openSettings, requestScreenRecording, checkStatus } = usePermissions();
  const { getStats } = useKnowledgeGraph();
  const [kgStats, setKgStats] = useState<{ entities: number; relationships: number; events: number } | null>(null);
  const [permResult, setPermResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleRequestPermission = async () => {
    setPermResult(null);
    const result = await requestScreenRecording();
    setPermResult(result);
  };

  useEffect(() => {
    void getConfig().then((cfg) => {
      if (!cfg) return;
      setHealthCheckEnabled(Boolean(cfg.enabled));
      setHealthCheckInterval(Number(cfg.intervalSeconds || 60));
    });
    void getStats().then(setKgStats).catch(() => null);
    // 启动时把主进程的 agent interval 同步到前端 store（首次或重装后）
    void getAgentIntervalIPC().then((sec) => {
      if (typeof sec === "number" && sec > 0 && sec !== agentInterval) setAgentInterval(sec);
    });
    // 启动时把前端的 toastVerbosity 同步到主进程
    void window.ovoAPI?.toast?.setVerbosity(toastVerbosity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getConfig, setHealthCheckEnabled, setHealthCheckInterval, getStats]);

  // UI-S5: 单页滚动，所有 section 都展示。原 section ctx 不再起作用
  void ctx;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">设置</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">从重要的开始：先隐私，再外观，最后开发者工具</p>
      </div>

      {/* 隐私与暂停 — 最重要，第一位 */}
      <PrivacyView />

      {(
        <div className="space-y-3">
          <Card title="外观">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">主题模式</p>
                  <p className="text-xs text-[var(--text-secondary)]">选择应用外观主题</p>
                </div>
                <Select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
                  <option value="light">浅色</option>
                  <option value="dark">暗黑</option>
                  <option value="system">跟随系统</option>
                </Select>
              </div>
            </div>
          </Card>
          <Card title="开发者模式">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">显示开发者工具</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  打开后会显示「流水线」标签 + 系统/业务日志 + Prompt 自评建议——给会用 ovo 调试的高级用户。
                </p>
              </div>
              <Toggle checked={developerMode} onChange={setDeveloperMode} />
            </div>
          </Card>
        </div>
      )}

      {(
        <div className="space-y-3">
          {/* 权限状态 */}
          <Card title="屏幕录制权限">
            {screenRecordingMissing ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/5 px-3 py-2.5">
                  <p className="text-sm font-medium text-[var(--warning)]">权限未授权</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">屏幕录制权限未授权，截图/OCR/主动建议功能将不可用</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GlowButton className="!py-1.5 !text-xs" onClick={() => void handleRequestPermission()}>
                    触发系统授权
                  </GlowButton>
                  <GlowButton className="!py-1.5 !text-xs" onClick={() => openSettings("screen")}>
                    前往系统设置
                  </GlowButton>
                  <GlowButton className="!py-1.5 !text-xs" onClick={() => void checkStatus()}>
                    重新检查
                  </GlowButton>
                </div>
                {permResult && permResult.message && (
                  <div className={`rounded-lg border px-3 py-2.5 text-sm ${
                    permResult.ok
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent)]"
                      : "border-[var(--warning)]/40 bg-[var(--warning)]/5 text-[var(--warning)]"
                  }`}>
                    {permResult.message}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2">
                <p className="text-sm text-[var(--accent)]">已授权</p>
              </div>
            )}
          </Card>

          {/* 捕获配置 */}
          <Card title="截屏设置">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">捕获间隔</span>
                <Select
                  value={captureInterval}
                  onChange={(e) => {
                    const seconds = Number(e.target.value);
                    setCaptureInterval(seconds);
                    void setCaptureIntervalIPC(seconds);
                  }}
                >
                  {[1, 3, 5, 10, 15, 30, 60].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} 秒</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">AI 思考间隔</span>
                <Select
                  value={agentInterval}
                  onChange={(e) => {
                    const seconds = Number(e.target.value);
                    setAgentInterval(seconds);
                    void setAgentIntervalIPC(seconds);
                  }}
                >
                  {[5, 10, 15, 30, 60, 120, 300].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} 秒</option>
                  ))}
                </Select>
                <span className="text-xs text-[var(--text-muted)]">看到屏幕之后多久叫 AI 分析一次</span>
              </div>
              <GlowButton className="!text-xs" onClick={() => void takeScreenshot()}>验证截图权限</GlowButton>
            </div>
          </Card>

          {/* 自检配置 */}
          <Card title="定期自检">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">启用自检</p>
                  <p className="text-xs text-[var(--text-secondary)]">周期性验证捕获/OCR 链路</p>
                </div>
                <Toggle checked={healthCheckEnabled} onChange={(enabled) => { setHealthCheckEnabled(enabled); void setConfig({ enabled }); }} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">自检间隔</span>
                <Select value={healthCheckInterval} onChange={(e) => { const v = Number(e.target.value); setHealthCheckInterval(v); void setConfig({ intervalSeconds: v }); }}>
                  {[30, 60, 120, 300].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} 秒</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>
        </div>
      )}

      {(
        <div className="space-y-3">
          {/* 后端选择 */}
          <Card title="AI 后端">
            <div className="space-y-3">
              <Select value={selectedBackend} onChange={(e) => { const b = e.target.value as typeof selectedBackend; setSelectedBackend(b); void setBackend(b); }}>
                <option value="claude-code">Claude Code</option>
                <option value="openclaw">OpenClaw</option>
                <option value="hermes">Hermes</option>
                <option value="api">直接 API</option>
              </Select>
            </div>
          </Card>

          {/* API 配置 */}
          {selectedBackend === "api" && (
            <Card title="API 配置">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">Base URL</label>
                  <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.anthropic.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">API Key</label>
                  <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" type="password" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">模型</label>
                  <Input value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder="claude-sonnet-4-20250514" />
                </div>
                <GlowButton onClick={() => setApiConfig({ baseUrl: apiBaseUrl, key: apiKey, model: apiModel })}>保存 API 配置</GlowButton>
              </div>
            </Card>
          )}

          {/* TTS */}
          <Card title="语音输出">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">启用 Edge TTS</p>
                <p className="text-xs text-[var(--text-secondary)]">使用 Edge 在线语音合成引擎</p>
              </div>
              <Toggle checked={ttsEnabled} onChange={setTtsEnabled} />
            </div>
          </Card>

          {/* 提醒级别（合并了原本重复的两个版本，留三按钮版） */}
          <Card title="提醒级别">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-[var(--text-secondary)]">
                屏幕角落弹建议卡片的范围。控制台始终看得到，这里只控制是否弹提醒。
              </p>
              <div className="flex gap-2">
                {(["silent", "alerts", "all"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setToastVerbosity(v);
                      void window.ovoAPI?.toast?.setVerbosity(v);
                    }}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      toastVerbosity === v
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    {v === "silent" ? "静默" : v === "alerts" ? "仅预警（推荐）" : "全部"}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)]">
                {toastVerbosity === "silent"
                  ? "✓ 完全不弹，所有建议都进控制台"
                  : toastVerbosity === "alerts"
                    ? "✓ 仅风险预警和需要确认的动作会弹"
                    : "✓ 所有建议都会弹到屏幕角"}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* 关于 */}
      <AboutView />

      {/* 开发者模式：所有工程师向工具都放这里，普通用户默认看不到 */}
      {developerMode && (
        <div className="space-y-3">
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">开发者工具</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">关闭"显示开发者工具"即可隐藏以下内容</p>
          </div>

          {/* 知识图谱统计 */}
          <Card title="知识图谱（原始数据）">
            {kgStats ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-[var(--accent)]">{kgStats.entities}</p>
                  <p className="text-xs text-[var(--text-secondary)]">实体</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[var(--accent)]">{kgStats.relationships}</p>
                  <p className="text-xs text-[var(--text-secondary)]">关系</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[var(--secondary)]">{kgStats.events}</p>
                  <p className="text-xs text-[var(--text-secondary)]">事件</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">加载中...</p>
            )}
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">导出 / 清空 等操作请到「记忆」tab 的 ⋯ 菜单。</p>
          </Card>

          <PromptEvalView />
          <SystemLogsView />
          <BusinessLogsView />
        </div>
      )}
    </div>
  );
}

const isElectronInternal = typeof window !== "undefined" && !!window.ovoAPI;

/* UI-1: 系统日志（含错误日志） */
function SystemLogsView() {
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; source: string; message: string }>>([]);
  const [errors, setErrors] = useState<Array<{ timestamp: string; level: string; source: string; message: string }>>([]);

  useEffect(() => {
    if (!isElectronInternal) return;
    void window.ovoAPI.logs.getSystem(100).then((rows) => setLogs(rows ?? [])).catch(() => {});
    void window.ovoAPI.errorLog.getRecent(50).then((rows) => setErrors(rows ?? [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <Card title="错误日志（主进程）">
        {errors.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">暂无错误</p>
        ) : (
          <div className="max-h-[300px] space-y-1 overflow-y-auto text-xs">
            {errors.map((e, i) => (
              <div key={i} className="border-b border-[var(--border)] py-1">
                <span className="text-[var(--danger)]">[{e.level}]</span>{" "}
                <span className="text-[var(--text-muted)]">{e.source}</span>{" "}
                <span className="text-[var(--text-secondary)]">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="系统日志（最近 100 条）">
        {logs.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">暂无日志</p>
        ) : (
          <div className="max-h-[400px] space-y-1 overflow-y-auto text-xs">
            {logs.map((l, i) => (
              <div key={i} className="border-b border-[var(--border)] py-1">
                <span className="text-[var(--text-muted)]">[{l.level}]</span>{" "}
                <span className="text-[var(--accent)]">{l.source}</span>{" "}
                <span className="text-[var(--text-secondary)]">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* UI-1: 业务日志（pipeline 业务节点） */
function BusinessLogsView() {
  const [logs, setLogs] = useState<Array<{ id: string; node: string; status: string; created_at: number }>>([]);

  useEffect(() => {
    if (!isElectronInternal) return;
    void window.ovoAPI.logs.getBusiness({ limit: 100 }).then((rows) => setLogs(rows ?? [])).catch(() => {});
  }, []);

  return (
    <Card title="业务日志（最近 100 条）">
      {logs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">暂无业务日志</p>
      ) : (
        <div className="max-h-[500px] space-y-1 overflow-y-auto text-xs">
          {logs.map((l) => (
            <div key={l.id} className="border-b border-[var(--border)] py-1">
              <span className={
                l.status === "success" ? "text-[var(--success)]" :
                l.status === "failed" ? "text-[var(--danger)]" :
                "text-[var(--text-muted)]"
              }>[{l.status}]</span>{" "}
              <span className="text-[var(--accent)]">{l.node}</span>{" "}
              <span className="text-[var(--text-muted)]">{new Date(l.created_at * 1000).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* T2 + T3 + T6: 隐私与暂停面板 —— 信任的核心设置 */
function PrivacyView() {
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [newApp, setNewApp] = useState("");
  const [pauseState, setPauseState] = useState<{ pausedUntil: number; isPaused: boolean }>({ pausedUntil: 0, isPaused: false });
  const [, tick] = useState(0);

  const refresh = async () => {
    if (!isElectronInternal) return;
    setBlacklist((await window.ovoAPI.privacy.getBlacklist().catch(() => [])) ?? []);
    setPauseState(await window.ovoAPI.privacy.getPauseState().catch(() => ({ pausedUntil: 0, isPaused: false })));
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => tick((n) => n + 1), 1000); // 实时更新倒计时
    return () => clearInterval(t);
  }, []);

  const addApp = async () => {
    const v = newApp.trim();
    if (!v) return;
    if (blacklist.includes(v)) { setNewApp(""); return; }
    const next = [...blacklist, v];
    if (isElectronInternal) await window.ovoAPI.privacy.setBlacklist(next);
    setBlacklist(next);
    setNewApp("");
  };
  const removeApp = async (app: string) => {
    const next = blacklist.filter((a) => a !== app);
    if (isElectronInternal) await window.ovoAPI.privacy.setBlacklist(next);
    setBlacklist(next);
  };
  const pause = async (minutes: number) => {
    if (!isElectronInternal) return;
    const r = await window.ovoAPI.privacy.pause(minutes);
    setPauseState({ pausedUntil: r.pausedUntil, isPaused: true });
  };
  const resume = async () => {
    if (!isElectronInternal) return;
    await window.ovoAPI.privacy.resume();
    setPauseState({ pausedUntil: 0, isPaused: false });
  };

  const remainingMs = pauseState.pausedUntil - Date.now();
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60_000));
  const isPaused = remainingMs > 0;

  return (
    <div className="space-y-3">
      <Card title="暂停 ovo">
        <div className="space-y-3 text-sm">
          {isPaused ? (
            <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-dim)] px-3 py-2">
              <p className="font-medium text-[var(--accent)]">⏸ ovo 已暂停</p>
              <p className="mt-0.5 text-xs">{remainingMin > 0 ? `${remainingMin} 分钟后自动恢复` : "即将恢复"}</p>
              <GlowButton className="!mt-2 !text-xs" onClick={() => void resume()}>立即恢复</GlowButton>
            </div>
          ) : (
            <>
              <p className="text-[var(--text-secondary)]">
                需要做敏感事情时，先暂停 ovo——它就不再截屏，不再观察。到时间后自动恢复。
              </p>
              <div className="flex gap-2">
                {[5, 15, 60].map((min) => (
                  <GlowButton key={min} className="!text-xs" onClick={() => void pause(min)}>
                    暂停 {min < 60 ? `${min} 分钟` : `${min / 60} 小时`}
                  </GlowButton>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="永不观察这些应用">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">
            黑名单里的应用 ovo 完全不截、不 OCR、不分析。默认已加密码管理器、钥匙串。
          </p>
          <div className="flex flex-wrap gap-1.5">
            {blacklist.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">（黑名单为空——点下方添加）</p>
            ) : (
              blacklist.map((app) => (
                <span
                  key={app}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-1 text-[11px]"
                >
                  {app}
                  <button
                    type="button"
                    onClick={() => void removeApp(app)}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newApp}
              onChange={(e) => setNewApp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addApp(); }}
              placeholder="输入要禁的 app 名（如 1Password / 工商银行）"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <GlowButton className="!text-xs" onClick={() => void addApp()}>添加</GlowButton>
          </div>
        </div>
      </Card>

      <Card title="敏感信息自动脱敏">
        <p className="text-sm text-[var(--text-secondary)]">
          OCR 抽出的文本送 LLM 之前，ovo 会用 regex 自动擦掉以下内容（替换成 <code className="rounded bg-[var(--bg-base)] px-1 text-[10px]">[REDACTED]</code>）：
        </p>
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-[var(--text-secondary)]">
          <li>API token（sk- / ghp- / AIza- / AKIA- / xoxb 等前缀）</li>
          <li>JWT</li>
          <li>信用卡 / 银行卡 13-19 位数字</li>
          <li>中国身份证 / 手机号</li>
          <li>SSH / RSA 私钥</li>
          <li>.env 文件里的密钥</li>
          <li>"密码: xxx" / "验证码: xxx" 这类标记</li>
        </ul>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">默认开启，无需配置。命中时会在「错误日志」里记类型 + 数量（不记原内容）。</p>
      </Card>
    </div>
  );
}

/* P8: Prompt 自评建议 */
function PromptEvalView() {
  const [items, setItems] = useState<Array<{
    id: string; created_at: number; scope: string; problem: string;
    proposed_change: string; evidence: string; confidence: number; status: string;
  }>>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!isElectronInternal) return;
    const list = await window.ovoAPI.promptEval.list(50).catch(() => []);
    setItems(list ?? []);
  };
  useEffect(() => { void refresh(); }, []);

  const runNow = async () => {
    if (!isElectronInternal) return;
    setBusy(true);
    try {
      await window.ovoAPI.promptEval.runNow();
      // 给 LLM 60s
      setTimeout(() => { void refresh(); setBusy(false); }, 60_000);
    } catch {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "applied" | "dismissed" | "pending") => {
    if (!isElectronInternal) return;
    await window.ovoAPI.promptEval.setStatus({ id, status });
    await refresh();
  };

  const pending = items.filter((x) => x.status === "pending");
  const others = items.filter((x) => x.status !== "pending");

  return (
    <div className="space-y-3">
      <Card title="Prompt 自评（GEPA 简化版）">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">
            ovo 每天自动跑一次：拉过去 24 小时低分 pipeline → 用 LLM 分析共性问题 → 提具体的 prompt 修改建议。
            <br />
            <span className="text-[var(--text-muted)]">建议都需要你**人工 review**，不会自动改 prompt。</span>
          </p>
          <div className="flex items-center gap-2">
            <GlowButton className="!text-xs" onClick={() => void runNow()} disabled={busy}>
              {busy ? "运行中（约 60 秒）" : "立即运行一次"}
            </GlowButton>
            <span className="text-xs text-[var(--text-muted)]">{items.length} 条历史 · {pending.length} 条待 review</span>
          </div>
        </div>
      </Card>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">待 review</p>
          {pending.map((it) => (
            <Card key={it.id}>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{it.scope}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {new Date(it.created_at).toLocaleString()} · 置信 {(it.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">问题</p>
                  <p>{it.problem}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">建议改动</p>
                  <p className="rounded bg-[var(--bg-base)] p-2 font-mono text-xs whitespace-pre-wrap">{it.proposed_change}</p>
                </div>
                {it.evidence && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">证据</p>
                    <p className="text-xs text-[var(--text-secondary)]">{it.evidence}</p>
                  </div>
                )}
                <div className="flex gap-2 border-t border-[var(--border)] pt-2">
                  <GlowButton className="!text-xs" onClick={() => void setStatus(it.id, "applied")}>标记为已采纳</GlowButton>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                    onClick={() => void setStatus(it.id, "dismissed")}
                  >
                    驳回
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-muted)]">历史（{others.length}）</p>
          {others.slice(0, 20).map((it) => (
            <div key={it.id} className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-1 text-xs">
              <span className={`rounded px-1.5 py-0.5 ${
                it.status === "applied" ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "bg-[var(--bg-base)] text-[var(--text-muted)]"
              }`}>
                {it.status === "applied" ? "已采纳" : "已驳回"}
              </span>
              <span className="truncate">{it.problem}</span>
              <span className="ml-auto shrink-0 text-[var(--text-muted)]">{it.scope}</span>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <Card>
          <p className="py-4 text-center text-xs text-[var(--text-muted)]">暂无自评结果——明天 ovo 第一次自评后会出现，或点上面"立即运行"</p>
        </Card>
      )}
    </div>
  );
}

/* UI-1: 关于（合并自旧 AboutPanel） */
function AboutView() {
  return (
    <Card title="关于 ovo">
      <div className="space-y-2 text-sm">
        <p><span className="text-[var(--text-muted)]">版本:</span> v0.1.0</p>
        <p><span className="text-[var(--text-muted)]">平台:</span> macOS</p>
        <p className="text-xs text-[var(--text-secondary)]">
          ovo 是一个观察屏幕、推断意图、长期跟随用户成长的桌面副驾驶。
        </p>
      </div>
    </Card>
  );
}
