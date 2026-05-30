import { useEffect, useState } from "react";
import { Pause, X as XIcon, Trash2, Download, Shield, Clock, AlertTriangle, ShieldCheck, ChevronDown, ChevronRight, Eye, EyeOff, Check, FileText, Ban, Bot } from "lucide-react";
import { Empty } from "../shared/Empty";
import type { ActionType, TrustLevel } from "../../types/ovo";
import { translateError } from "../../utils/errorTranslator";
import { Card } from "../shared/Card";
import { NegativePatternsCard } from "./NegativePatternsCard";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useTranslation } from "react-i18next";
import { useSettingsStore, type ThemeMode, type AppLanguage } from "../../stores/settingsStore";
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
    developerMode, setDeveloperMode,
    language, setLanguage
  } = useSettingsStore();
  const { t } = useTranslation();
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

  // SEC-12 / Bug 2 修复：把 ttsEnabled 同步独立成依赖 ttsEnabled 的 effect，
  // 让 zustand persist 异步加载完成后能正确同步。原来塞在 mount-only effect 里，
  // 用户切换 Toggle 第一次主进程没收到 → speak 永久拒绝。
  useEffect(() => {
    void window.ovoAPI?.tts?.setEnabled?.(ttsEnabled);
  }, [ttsEnabled]);

  // UI-S5: 单页滚动，所有 section 都展示。原 section ctx 不再起作用
  void ctx;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("settingsPanel.title")}</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("settingsPanel.subtitle")}</p>
      </div>

      {/* P1.22: 锚点快捷导航 — 长页面让用户快速跳转 */}
      <nav className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-base)]/95 px-2 py-1.5 text-[11px] backdrop-blur">
        {[
          { id: "section-language", label: "语言/Language" },
          { id: "section-privacy",  label: t("settingsPanel.navPrivacy") },
          { id: "section-appearance", label: t("settingsPanel.navAppearance") },
          { id: "section-permissions", label: t("settingsPanel.navPermissions") },
          { id: "section-capture", label: t("settingsPanel.navCapture") },
          { id: "section-tts", label: t("settingsPanel.navTts") },
          { id: "section-toast", label: t("settingsPanel.navToast") },
          { id: "section-api", label: t("settingsPanel.navAi") },
          { id: "section-about", label: t("settingsPanel.navAbout") }
        ].map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="rounded px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* 语言 — 放最顶部，双语标题让任何语言下都能一眼找到 */}
      <Card title="语言 / Language" id="section-language">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("settings.languageTitle")} / Language</p>
            <p className="text-xs text-[var(--text-secondary)]">{t("settings.languageHint")}</p>
          </div>
          <Select value={language} onChange={(e) => setLanguage(e.target.value as AppLanguage)}>
            <option value="system">{t("settings.system")}</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </Select>
        </div>
      </Card>

      {/* 隐私与暂停 — 最重要 */}
      <div id="section-privacy"><PrivacyView /></div>

      {/* P1-1: 教过 Ovo 的规则（查看 / 撤销禁忌） */}
      <NegativePatternsCard />

      {(
        <div className="space-y-3">
          <Card title={t("settingsPanel.appearance")} id="section-appearance">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("settingsPanel.themeMode")}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{t("settingsPanel.themeHint")}</p>
                </div>
                <Select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
                  <option value="light">{t("settingsPanel.themeLight")}</option>
                  <option value="dark">{t("settingsPanel.themeDark")}</option>
                  <option value="system">{t("settingsPanel.themeSystem")}</option>
                </Select>
              </div>
            </div>
          </Card>
          <Card title={t("settingsPanel.devTools")}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("settingsPanel.devShowAdvanced")}</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {t("settingsPanel.devShowAdvancedHint")}
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
          <Card title="屏幕录制权限" id="section-permissions">
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
          <Card title={t("settingsPanel.capture")} id="section-capture">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">{t("settingsPanel.captureInterval")}</span>
                <Select
                  value={captureInterval}
                  onChange={(e) => {
                    const seconds = Number(e.target.value);
                    setCaptureInterval(seconds);
                    void setCaptureIntervalIPC(seconds);
                  }}
                >
                  {[1, 3, 5, 10, 15, 30, 60].map((seconds) => (
                    <option key={seconds} value={seconds}>{t("settingsPanel.seconds", { n: seconds })}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">{t("settingsPanel.aiInterval")}</span>
                <Select
                  value={agentInterval}
                  onChange={(e) => {
                    const seconds = Number(e.target.value);
                    setAgentInterval(seconds);
                    void setAgentIntervalIPC(seconds);
                  }}
                >
                  {[5, 10, 15, 30, 60, 120, 300].map((seconds) => (
                    <option key={seconds} value={seconds}>{t("settingsPanel.seconds", { n: seconds })}</option>
                  ))}
                </Select>
                <span className="text-xs text-[var(--text-muted)]">{t("settingsPanel.aiIntervalHint")}</span>
              </div>
              <GlowButton className="!text-xs" onClick={() => void takeScreenshot()}>{t("settingsPanel.verifyScreenshot")}</GlowButton>
            </div>
          </Card>

          {/* 健康检查 — P1.24 jargon 翻译：自检 → 健康检查 */}
          <Card title={t("settingsPanel.health")}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("settingsPanel.healthEnable")}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{t("settingsPanel.healthHint")}</p>
                </div>
                <Toggle checked={healthCheckEnabled} onChange={(enabled) => { setHealthCheckEnabled(enabled); void setConfig({ enabled }); }} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">{t("settingsPanel.healthFreq")}</span>
                <Select value={healthCheckInterval} onChange={(e) => { const v = Number(e.target.value); setHealthCheckInterval(v); void setConfig({ intervalSeconds: v }); }}>
                  {[30, 60, 120, 300].map((seconds) => (
                    <option key={seconds} value={seconds}>{t("settingsPanel.seconds", { n: seconds })}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>
        </div>
      )}

      {(
        <div className="space-y-3">
          {/* 后端选择 — P1.23: 切换有提示影响范围，避免误点 */}
          <Card title={t("settingsPanel.aiBackend")} id="section-api">
            <div className="space-y-2">
              <Select
                value={selectedBackend}
                onChange={(e) => {
                  const b = e.target.value as typeof selectedBackend;
                  const labels: Record<string, string> = {
                    "hermes": t("settingsPanel.backendLabelHermes"),
                    "api": t("settingsPanel.backendLabelApi")
                  };
                  if (!confirm(t("settingsPanel.backendSwitchConfirm", { label: labels[b] ?? b }))) return;
                  setSelectedBackend(b);
                  void setBackend(b);
                }}
              >
                {/* 只列验证过的后端。claude-code(claude -p 噪音)/openclaw(集成未跑通) 已下掉 */}
                <option value="hermes">Hermes</option>
                <option value="api">{t("settingsPanel.backendApiCloud")}</option>
              </Select>
              <p className="text-[10px] text-[var(--text-muted)]">
                {t("settingsPanel.backendHint")}
              </p>
            </div>
          </Card>

          {/* API 配置 */}
          {selectedBackend === "api" && (
            <ApiConfigCard
              draftBaseUrl={apiBaseUrl}
              draftKey={apiKey}
              draftModel={apiModel}
              onChangeBaseUrl={setApiBaseUrl}
              onChangeKey={setApiKey}
              onChangeModel={setApiModel}
              onSave={setApiConfig}
            />
          )}

          {/* TTS */}
          <Card title={t("settingsPanel.tts")} id="section-tts">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("settingsPanel.ttsEnable")}</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{t("settingsPanel.ttsHint")}</p>
                <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-[var(--warning)]/10 px-2 py-1 text-[11px] text-[var(--warning)]">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{t("settingsPanel.ttsWarn")}</span>
                </p>
              </div>
              <Toggle
                checked={ttsEnabled}
                onChange={(v) => {
                  setTtsEnabled(v);
                  // SEC-12: 同步到主进程，否则主进程会拒绝 tts:speak 调用
                  void window.ovoAPI?.tts?.setEnabled?.(v);
                }}
              />
            </div>
          </Card>

          {/* 提醒级别（合并了原本重复的两个版本，留三按钮版） */}
          <Card title={t("settingsPanel.toast")} id="section-toast">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-[var(--text-secondary)]">
                {t("settingsPanel.toastHint")}
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
                    {v === "silent" ? t("settingsPanel.toastSilent") : v === "alerts" ? t("settingsPanel.toastAlerts") : t("settingsPanel.toastAll")}
                  </button>
                ))}
              </div>
              <p className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
                <Check size={11} className="text-[var(--success)]" />
                {toastVerbosity === "silent"
                  ? t("settingsPanel.toastHintSilent")
                  : toastVerbosity === "alerts"
                    ? t("settingsPanel.toastHintAlerts")
                    : t("settingsPanel.toastHintAll")}
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
          <Empty compact icon={ShieldCheck} title="没有错误" hint="主进程运行正常" />
        ) : (
          <>
            <div className="max-h-[300px] space-y-1 overflow-y-auto text-xs">
              {errors.map((e, i) => (
                <div key={i} className="border-b border-[var(--border)] py-1">
                  <span className="text-[var(--danger)]">[{e.level}]</span>{" "}
                  <span className="text-[var(--text-muted)]">{e.source}</span>{" "}
                  <span className="text-[var(--text-secondary)]">{e.message}</span>
                </div>
              ))}
            </div>
            {/* P2.14: 导出错误日志（人话格式 + raw JSON 副本） */}
            <button
              type="button"
              onClick={() => {
                // 格式化成 [时间] [级别] [来源] message
                const lines = errors.map((e) => {
                  const ts = (e as { timestamp?: string }).timestamp ?? "—";
                  return `[${ts}] [${e.level.toUpperCase()}] ${e.source} — ${e.message}`;
                });
                const text = lines.join("\n");
                const blob = new Blob([text], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `ovo-error-log-${new Date().toISOString().slice(0, 10)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="mt-2 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)]"
            >
              导出错误日志（.txt）
            </button>
          </>
        )}
      </Card>
      <Card title="系统日志（最近 100 条）">
        {logs.length === 0 ? (
          <Empty compact icon={FileText} title="还没有日志" hint="主进程开始活动后会在这里显示" />
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
    <Card title="Ovo 的行动记录（最近 100 条）">
      {logs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">还没有行动记录</p>
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
    // P1.23: 危险操作二次确认 — 移除黑名单 = 让 Ovo 重新观察这个 app
    if (!confirm(`确定要让 Ovo 重新观察「${app}」吗？\n\n移除后 Ovo 会再次截屏 / OCR 这个应用的内容。`)) return;
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
              <p className="flex items-center gap-1.5 font-medium text-[var(--accent)]">
                <Pause size={13} /> ovo 已暂停
              </p>
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
              <div className="w-full">
                <Empty compact icon={Ban} title="黑名单为空" hint="点下方按钮添加要永远屏蔽的应用" />
              </div>
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
                    className="flex h-4 w-4 items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)]"
                    aria-label={`移除 ${app}`}
                  >
                    <XIcon size={12} />
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

      {/* P0.3 / P0.10 信任分级 — 哲学第五章机制 1 */}
      <TrustLevelsCard />

      {/* P0.11 数据保留期 */}
      <RetentionCard />

      {/* P0.11 脱敏强度（替换旧的"自动脱敏"说明性卡片） */}
      <RedactionCard />

      {/* DATA-12 脱敏命中统计 */}
      <RedactionStatsCard />

      {/* P0.11 数据管理 — 导出 / 删除所有数据 */}
      <DataManagementCard />
    </div>
  );
}

// ============================================================
// P0.3 / P0.10 信任分级 5 级 × 14 action
// ============================================================

const ACTION_LABELS: Record<ActionType, string> = {
  log_note: "记笔记",
  create_todo: "创建待办",
  copy_to_clipboard: "复制到剪贴板",
  search: "本地搜索",
  summarize: "总结归纳",
  set_reminder: "创建提醒",
  add_calendar: "添加日历事件",
  index_path: "扫描目录",
  open_url: "打开链接",
  open_app: "打开应用",
  search_web: "网页搜索",
  send_email: "发送邮件",
  send_imessage: "发送 iMessage",
  other: "其他动作"
};

const LEVEL_DESCRIPTIONS: Record<TrustLevel, { label: string; hint: string }> = {
  0: { label: "Lv.0 仅展示", hint: "出现在建议列表，Ovo 不动手" },
  1: { label: "Lv.1 草拟",    hint: "替我准备好草稿，等我点发" },
  2: { label: "Lv.2 一键确认", hint: "弹窗问我，按一下大按钮才执行" },
  3: { label: "Lv.3 自动执行", hint: "立即执行，给我 5 秒撤销窗口" },
  4: { label: "Lv.4 完全托管", hint: "立即执行，不打扰我（谨慎）" }
};

function TrustLevelsCard() {
  const [levels, setLevels] = useState<Record<ActionType, TrustLevel> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<ActionType | null>(null);

  const refresh = async () => {
    if (!isElectronInternal) return;
    try {
      const r = await window.ovoAPI.prefs.getTrustLevels();
      setLevels(r);
    } catch { /* keep previous */ }
  };

  useEffect(() => { void refresh(); }, []);

  const handleChange = async (type: ActionType, level: TrustLevel) => {
    if (!isElectronInternal || !levels) return;
    setSaving(type);
    try {
      await window.ovoAPI.prefs.setTrustLevel({ type, level });
      setLevels({ ...levels, [type]: level });
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    if (!isElectronInternal) return;
    if (!confirm("把所有动作的信任级别重置为默认？")) return;
    await window.ovoAPI.prefs.resetTrustLevels();
    await refresh();
  };

  if (!levels) {
    return (
      <Card title="信任与授权">
        <p className="text-xs text-[var(--text-muted)]">加载中…</p>
      </Card>
    );
  }

  // 默认折叠：只显示"非默认值"的 action 数和一个展开按钮
  const customCount = (Object.entries(levels) as [ActionType, TrustLevel][])
    .filter(([t, l]) => l !== getDefaultLevel(t)).length;

  return (
    <Card title="信任与授权">
      <div className="space-y-3 text-sm">
        <p className="text-[var(--text-secondary)]">
          每种动作独立设置——决定 Ovo 该多主动。
          <span className="ml-1 text-[var(--text-muted)]">默认克制：本地无害 = 自动；外发 = 必须确认。</span>
        </p>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs hover:border-[var(--accent)]"
        >
          <span className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            14 种动作 · {customCount > 0 ? `${customCount} 项已自定义` : "全部使用默认"}
          </span>
          <span className="text-[var(--text-muted)]">{expanded ? "收起" : "展开调整"}</span>
        </button>

        {expanded && (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((type) => (
              <div key={type} className="flex items-center gap-3 border-b border-[var(--border-light)] pb-2 last:border-b-0 last:pb-0">
                <div className="w-28 shrink-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">{ACTION_LABELS[type]}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{type}</p>
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={levels[type]}
                    onChange={(e) => void handleChange(type, Number(e.target.value) as TrustLevel)}
                    className="flex-1 accent-[var(--accent)]"
                    aria-label={`${ACTION_LABELS[type]} 信任级别`}
                  />
                  <span className="w-24 shrink-0 text-[11px] font-medium" style={{ color: levelColor(levels[type]) }}>
                    {LEVEL_DESCRIPTIONS[levels[type]].label}
                  </span>
                </div>
                <p className="w-44 shrink-0 text-[10px] text-[var(--text-muted)]">
                  {LEVEL_DESCRIPTIONS[levels[type]].hint}
                  {saving === type && <span className="ml-1 text-[var(--accent)]">保存中…</span>}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-[var(--text-muted)]">
                每次出手都尊重你设的级别 · LLM 自标的"需要确认"始终生效
              </p>
              <button
                type="button"
                onClick={() => void handleReset()}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)]"
              >
                重置默认
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function getDefaultLevel(type: ActionType): TrustLevel {
  const defaults: Record<ActionType, TrustLevel> = {
    log_note: 3, create_todo: 3, copy_to_clipboard: 3,
    search: 2, summarize: 2, set_reminder: 2, add_calendar: 2,
    index_path: 2, open_url: 2, open_app: 2, search_web: 2,
    send_email: 2, send_imessage: 2, other: 2
  };
  return defaults[type];
}

function levelColor(level: TrustLevel): string {
  if (level === 0) return "var(--text-muted)";
  if (level === 1) return "var(--text-secondary)";
  if (level === 2) return "var(--accent)";
  if (level === 3) return "var(--success)";
  return "var(--warning)";
}

// ============================================================
// P0.11 数据保留期
// ============================================================

const RETENTION_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: -1, label: "不保留",  hint: "用完即弃 — 关闭 Ovo 后所有屏幕历史立刻删" },
  { value: 7,  label: "7 天",    hint: "过去一周——只够当下回顾" },
  { value: 30, label: "30 天",   hint: "默认 — 平衡记忆与隐私" },
  { value: 90, label: "90 天",   hint: "三个月 — 适合长项目复盘" },
  { value: 0,  label: "永久",    hint: "永不删除（注意磁盘空间）" }
];

function RetentionCard() {
  const [current, setCurrent] = useState<number | null>(null);

  const refresh = async () => {
    if (!isElectronInternal) return;
    try { setCurrent(await window.ovoAPI.prefs.getRetentionDays()); } catch { /* keep */ }
  };
  useEffect(() => { void refresh(); }, []);

  const handleChange = async (days: number) => {
    if (!isElectronInternal) return;
    setCurrent(days);
    await window.ovoAPI.prefs.setRetentionDays(days);
  };

  return (
    <Card title="数据保留期">
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Clock size={13} /> 屏幕历史保留多久后自动删除？
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {RETENTION_OPTIONS.map((opt) => {
            const selected = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void handleChange(opt.value)}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50"
                }`}
              >
                <div>
                  <p className={`font-medium ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{opt.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{opt.hint}</p>
                </div>
                {selected && <ShieldCheck size={14} className="text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          清理每天后台运行一次，仅影响 memory_events / pipeline_logs / business_logs / system_logs；钉住的实体永不删。
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// P0.11 脱敏强度
// ============================================================

const REDACTION_OPTIONS: Array<{ value: "basic" | "strict" | "paranoid"; label: string; hint: string }> = [
  {
    value: "basic",
    label: "基础（默认）",
    hint: "脱敏 API token / JWT / 信用卡 / 身份证 / 手机号 / 私钥 / 密码字段"
  },
  {
    value: "strict",
    label: "严格",
    hint: "基础 + 邮箱地址 + URL + 文件路径全部 [REDACTED]"
  },
  {
    value: "paranoid",
    label: "偏执",
    hint: "严格 + 所有数字串（≥6 位）+ 域名 + 代码片段全部脱敏，可能影响 AI 理解"
  }
];

function RedactionCard() {
  const [current, setCurrent] = useState<"basic" | "strict" | "paranoid" | null>(null);

  const refresh = async () => {
    if (!isElectronInternal) return;
    try { setCurrent(await window.ovoAPI.prefs.getRedactionLevel()); } catch { /* keep */ }
  };
  useEffect(() => { void refresh(); }, []);

  const handleChange = async (level: "basic" | "strict" | "paranoid") => {
    if (!isElectronInternal) return;
    setCurrent(level);
    await window.ovoAPI.prefs.setRedactionLevel(level);
  };

  return (
    <Card title="敏感信息脱敏强度">
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Shield size={13} /> OCR 文本送 LLM 之前，脱掉哪些内容？
        </p>
        <div className="space-y-1.5">
          {REDACTION_OPTIONS.map((opt) => {
            const selected = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void handleChange(opt.value)}
                className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50"
                }`}
              >
                <div className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border ${selected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"}`} />
                <div>
                  <p className={`font-medium ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{opt.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{opt.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          脱敏命中会在「错误日志」记类型 + 数量（不记原内容）。
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// P0.11 数据管理：导出 / 删除所有数据
// ============================================================

function DataManagementCard() {
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async () => {
    if (!isElectronInternal) return;
    setExporting(true);
    setExportMsg(null);
    try {
      // SEC-16: 主进程二次握手 — 第一次拿 token，第二次带 token 才真正执行
      let data = await window.ovoAPI.kg.export();
      if (data && typeof data === "object" && "requiresConfirm" in (data as Record<string, unknown>)) {
        const token = (data as { confirmToken?: string }).confirmToken;
        if (!token) throw new Error("主进程二次握手 token 缺失");
        data = await (window.ovoAPI.kg.export as unknown as (p: { confirmToken: string }) => Promise<unknown>)({ confirmToken: token });
      }
      // 触发浏览器下载（renderer 端 blob）
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ovo-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg("导出完成");
    } catch (e) {
      setExportMsg(e instanceof Error ? `导出失败：${e.message}` : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!isElectronInternal) return;
    if (deleteText !== "DELETE") return;
    setDeleting(true);
    try {
      // SEC-16: 二次握手
      const first = await window.ovoAPI.kg.clear();
      if (first && typeof first === "object" && "requiresConfirm" in (first as Record<string, unknown>)) {
        const token = (first as { confirmToken?: string }).confirmToken;
        if (!token) throw new Error("主进程二次握手 token 缺失");
        await (window.ovoAPI.kg.clear as unknown as (p: { confirmToken: string }) => Promise<unknown>)({ confirmToken: token });
      }
      setShowDeleteConfirm(false);
      setDeleteText("");
      alert("已删除全部数据。建议重启 Ovo 让所有窗口重新加载。");
    } catch (e) {
      // P0.12 / P2.6: 用 errorTranslator 翻译，给用户人话
      const t = translateError(e);
      alert(`${t.title}：${t.detail}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card title="数据管理">
      <div className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <Download size={13} /> 导出我的所有数据
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              把知识库 + 屏幕历史 + Ovo 的人格画像导成 JSON 文件，可备份或迁移到别的 Mac。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)] disabled:opacity-50"
          >
            {exporting ? "导出中…" : "导出 JSON"}
          </button>
        </div>
        {exportMsg && (
          <p className="text-xs text-[var(--text-secondary)]">{exportMsg}</p>
        )}

        <div className="my-1 h-px bg-[var(--border-light)]" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-medium text-[var(--danger)]">
              <Trash2 size={13} /> 删除我的所有数据
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              不可恢复。屏幕历史 / 知识图谱 / 人格画像 / Pipeline 日志 / 业务日志全部清空。建议先导出备份。
            </p>
          </div>
          {!showDeleteConfirm && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
            >
              永久删除…
            </button>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-3 text-xs">
            <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--danger)]">
              <AlertTriangle size={13} /> 这个操作不可恢复
            </p>
            <p className="mb-2 text-[var(--text-secondary)]">在下面输入 <code className="rounded bg-[var(--bg-base)] px-1 font-mono">DELETE</code> 确认。</p>
            <input
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="输入 DELETE"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-[var(--danger)]"
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteText !== "DELETE" || deleting}
                className="rounded-md bg-[var(--danger)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {deleting ? "删除中…" : "永久删除"}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteText(""); }}
                disabled={deleting}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--text-secondary)]"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
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
      <Card title="Ovo 的自我反思">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">
            Ovo 每天自动反思一次：把过去 24 小时表现差的判断挑出来，分析哪里出错，给自己提改进建议。
            <br />
            <span className="text-[var(--text-muted)]">建议不会自动生效——需你点「标记为已采纳」；采纳后，该规则会在之后每一轮判断时自动注入 Ovo 的提示词中生效。</span>
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
              {it.status === "applied" && (
                <button
                  type="button"
                  className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                  title="撤销采纳：该规则将不再注入 Ovo 的提示词"
                  onClick={() => void setStatus(it.id, "pending")}
                >
                  撤销
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <Card>
          <Empty
            compact
            icon={Bot}
            title="还没有自评结果"
            hint={<>明天 ovo 第一次自评后会出现，或点上面"立即运行"</>}
          />
        </Card>
      )}
    </div>
  );
}

/* UI-1: 关于（合并自旧 AboutPanel） */
function AboutView() {
  return (
    <Card title="关于 ovo" id="section-about">
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

// SEC-4: API 配置卡片——key 通过主进程 safeStorage 加密落盘，renderer 永远拿不到明文。
// 已配置态显示「sk-***abc」遮罩 + 清除按钮；未配置态显示输入框。
interface ApiConfigCardProps {
  draftBaseUrl: string;
  draftKey: string;
  draftModel: string;
  onChangeBaseUrl: (v: string) => void;
  onChangeKey: (v: string) => void;
  onChangeModel: (v: string) => void;
  onSave: (config: { baseUrl: string; key: string; model: string }) => Promise<{ ok: boolean; error?: string }>;
}

function ApiConfigCard({
  draftBaseUrl, draftKey, draftModel,
  onChangeBaseUrl, onChangeKey, onChangeModel, onSave
}: ApiConfigCardProps) {
  const [status, setStatus] = useState<{
    hasKey: boolean; maskedKey: string; baseUrl: string; model: string; encryptionAvailable: boolean;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    if (typeof window === "undefined" || !window.ovoAPI?.agent?.getApiConfigStatus) return;
    try {
      const s = await window.ovoAPI.agent.getApiConfigStatus();
      setStatus(s);
      if (!editing) {
        onChangeBaseUrl(s.baseUrl || draftBaseUrl);
        onChangeModel(s.model || draftModel);
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const r = await onSave({ baseUrl: draftBaseUrl, key: draftKey, model: draftModel });
      if (!r.ok) {
        // P0.12 / P2.6: 把可能是 raw 的 error 走 translateError 转人话
        const raw = r.error || "保存失败";
        const t = translateError(raw);
        // 如果命中 errorTranslator 规则就用翻译版本；否则原文（多半是业务校验消息）
        setError(t.category !== "unknown" ? `${t.title} · ${t.detail}` : raw);
      } else {
        onChangeKey("");
        setEditing(false);
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (typeof window === "undefined" || !window.ovoAPI?.agent?.clearApiConfig) return;
    await window.ovoAPI.agent.clearApiConfig();
    onChangeKey("");
    await refresh();
  };

  return (
    <Card title="API 配置">
      <div className="space-y-3">
        {status && !status.encryptionAvailable && (
          <p className="rounded bg-[var(--warning)]/10 px-2 py-1.5 text-[11px] text-[var(--warning)]">
            系统未提供凭证存储（safeStorage 不可用），API key 暂时无法持久保存
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Base URL</label>
          <Input value={draftBaseUrl} onChange={(e) => onChangeBaseUrl(e.target.value)} placeholder="https://api.anthropic.com" />
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            仅支持 api.anthropic.com / api.openai.com / api.deepseek.com / openrouter.ai / api.groq.com
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">API Key</label>
          {status?.hasKey && !editing ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-[var(--bg-input)] px-2 py-1.5 text-[12px] text-[var(--text-secondary)]">
                {status.maskedKey || "已配置"}
              </code>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]"
              >
                修改
              </button>
              <button
                type="button"
                onClick={() => void handleClear()}
                className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--danger)] hover:bg-[var(--bg-card-hover)]"
              >
                清除
              </button>
            </div>
          ) : (
            <ApiKeyInput
              value={draftKey}
              onChange={onChangeKey}
              placeholder={status?.hasKey ? "输入新 key 以替换" : "API Key"}
            />
          )}
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            存储位置：macOS Keychain（safeStorage 加密）。renderer 进程读不到明文。
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">模型</label>
          <Input value={draftModel} onChange={(e) => onChangeModel(e.target.value)} placeholder="claude-sonnet-4-20250514" />
        </div>

        {error && (
          <p className="rounded bg-[var(--danger)]/10 px-2 py-1.5 text-[11px] text-[var(--danger)]">{error}</p>
        )}

        <div className="flex items-center gap-2">
          <GlowButton onClick={() => void handleSave()} disabled={saving}>
            {saving ? "保存中…" : "保存 API 配置"}
          </GlowButton>
          {editing && (
            <button
              type="button"
              onClick={() => { setEditing(false); onChangeKey(""); setError(null); }}
              className="rounded px-2 py-1 text-[12px] text-[var(--text-muted)]"
            >
              取消
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// P2.11: API Key 输入 — eye toggle 显示/隐藏
// ============================================================
// ============================================================
// DATA-12: 脱敏命中统计 — 让用户感知 "Ovo 保护了我 N 次"（哲学命中感知轴）
// ============================================================
const REDACT_LABELS: Record<string, string> = {
  api_token: "API token", jwt: "JWT", card_number: "卡号", id_card_cn: "身份证",
  phone_cn: "手机号", sensitive_email: "敏感邮箱", password_label: "密码字段",
  private_key: "私钥", env_secret: ".env 密钥", otp_cn: "验证码",
  email_any: "邮箱", url_any: "URL", file_path: "文件路径",
  long_number: "数字串", domain_any: "域名", code_block: "代码块", code_inline: "代码片段"
};
function RedactionStatsCard() {
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const refresh = async () => {
    if (!isElectronInternal) return;
    try { setStats(await window.ovoAPI.privacy.getRedactionStats()); } catch { /* */ }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return null;
  const entries = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <Card title="Ovo 为你保护了什么">
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <ShieldCheck size={13} className="text-[var(--success)]" />
          自启动至今，Ovo 在发送给云端 AI 之前一共擦掉 <strong className="text-[var(--success)]">{stats.total}</strong> 条敏感信息。
        </p>
        {entries.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {entries.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-1 text-xs">
                <span className="text-[var(--text-secondary)]">{REDACT_LABELS[type] ?? type}</span>
                <span className="font-mono text-[var(--text-primary)]">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">还没有命中——目前看到的屏幕内容没有触发任何敏感规则。</p>
        )}
        <button
          type="button"
          onClick={() => {
            if (!isElectronInternal) return;
            void window.ovoAPI.privacy.resetRedactionStats().then(() => void refresh());
          }}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          重置计数
        </button>
      </div>
    </Card>
  );
}

function ApiKeyInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={show ? "text" : "password"}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        title={show ? "隐藏" : "显示"}
        aria-label={show ? "隐藏 API key" : "显示 API key"}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
