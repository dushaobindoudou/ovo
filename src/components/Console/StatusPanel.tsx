import { useEffect, useState, useCallback } from "react";
import { RefreshCcw, ShieldCheck, ListTodo } from "lucide-react";
import { Card } from "../shared/Card";
import { Empty } from "../shared/Empty";
import { StatusBadge } from "../shared/StatusBadge";
import { LogViewer } from "../shared/LogViewer";
import { GlowButton } from "../shared/GlowButton";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { useAgentBridge } from "../../hooks/useAgentBridge";
import { useHealth } from "../../hooks/useHealth";
import { usePermissions } from "../../hooks/usePermissions";
import { LiveLogStream } from "./LiveLogStream";
import type { AlertPayload, SchedulerTaskStatusPayload } from "../../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface SubsystemStatus {
  name: string;
  status: "ok" | "warning" | "error" | "loading";
  detail: string;
  icon: string;
}

function useAllSystemChecks() {
  const { getLatest, getConfig } = useHealth();
  const { detectBackends } = useAgentBridge();
  const { getStats } = useKnowledgeGraph();
  const [statuses, setStatuses] = useState<SubsystemStatus[]>([]);
  const [checking, setChecking] = useState(false);

  const checkAll = useCallback(async () => {
    if (!isElectron) return;
    setChecking(true);
    try {
      const results: SubsystemStatus[] = [];

      // 1. Health check
      try {
        const [health, config] = await Promise.all([getLatest(), getConfig()]);
        if (health?.ok) {
          results.push({
            name: "截屏自检",
            status: "ok",
            detail: `最近: ${new Date(health.timestamp).toLocaleTimeString()} · OCR ${Math.round(health.confidence ?? 0)}%`,
            icon: "check",
          });
        } else if (health) {
          results.push({
            name: "截屏自检",
            status: "error",
            detail: health.error ?? "自检未通过",
            icon: "x",
          });
        } else {
          results.push({ name: "截屏自检", status: "warning", detail: "尚未运行", icon: "clock" });
        }
        results[results.length - 1].detail += config?.enabled ? " (自检开启)" : " (自检关闭)";
      } catch {
        results.push({ name: "截屏自检", status: "error", detail: "检查失败", icon: "x" });
      }

      // 2. Agent backends
      try {
        const backends = await detectBackends();
        if (backends.length > 0) {
          results.push({ name: "Agent 引擎", status: "ok", detail: `可用: ${backends.join(", ")}`, icon: "check" });
        } else {
          results.push({ name: "Agent 引擎", status: "warning", detail: "未检测到后端", icon: "clock" });
        }
      } catch {
        results.push({ name: "Agent 引擎", status: "error", detail: "检测失败", icon: "x" });
      }

      // 3. Knowledge graph
      try {
        const stats = await getStats();
        results.push({
          name: "知识图谱",
          status: "ok",
          detail: `实体 ${stats.entities} · 关系 ${stats.relationships} · 事件 ${stats.events}`,
          icon: "check",
        });
      } catch {
        results.push({ name: "知识图谱", status: "warning", detail: "未初始化", icon: "clock" });
      }

      // 4. Pipeline
      try {
        const pipelines = await window.ovoAPI.pipeline.getRecent(1);
        const count = pipelines?.length ?? 0;
        results.push({ name: "Pipeline", status: count > 0 ? "ok" : "warning", detail: count > 0 ? `最近: ${pipelines[0].id.slice(0, 8)}` : "无记录", icon: "check" });
      } catch {
        results.push({ name: "Pipeline", status: "warning", detail: "无记录", icon: "clock" });
      }

      // 5. Error log
      try {
        const errorCount = await window.ovoAPI.errorLog.getCount();
        if (errorCount > 0) {
          results.push({ name: "错误日志", status: "error", detail: `${errorCount} 条错误`, icon: "x" });
        } else {
          results.push({ name: "错误日志", status: "ok", detail: "无错误", icon: "check" });
        }
      } catch {
        results.push({ name: "错误日志", status: "warning", detail: "无法读取", icon: "clock" });
      }

      // 6. Permissions
      try {
        const perms = await window.ovoAPI.permissions.getStatus();
        const screenGranted = perms.screenRecording === "granted" || perms.screenRecording === "not-available";
        results.push({
          name: "系统权限",
          status: screenGranted ? "ok" : "warning",
          detail: screenGranted ? "屏幕录制权限已授权" : "屏幕录制权限未授权",
          icon: screenGranted ? "check" : "x",
        });
      } catch {
        results.push({ name: "系统权限", status: "warning", detail: "无法检测", icon: "clock" });
      }

      setStatuses(results);
    } finally {
      setChecking(false);
    }
  }, [getLatest, getConfig, detectBackends, getStats]);

  useEffect(() => { void checkAll(); }, [checkAll]);

  // 关键事件触发即刻重检
  useEffect(() => {
    if (!isElectron) return;
    const offHealth = window.ovoAPI.on("health:update", () => { void checkAll(); });
    const offAlert = window.ovoAPI.on("alert:new", () => { void checkAll(); });
    const offCapture = window.ovoAPI.on("capture:result", () => { void checkAll(); });
    const offPerms = window.ovoAPI.on("permissions:status", () => { void checkAll(); });
    return () => {
      try { offHealth(); offAlert(); offCapture(); offPerms(); } catch { /* ignore */ }
    };
  }, [checkAll]);

  return { statuses, checkAll, checking };
}

function SystemOverview() {
  const { statuses, checkAll, checking } = useAllSystemChecks();
  const errorCount = statuses.filter((s) => s.status === "error").length;
  const warningCount = statuses.filter((s) => s.status === "warning").length;
  const okCount = statuses.filter((s) => s.status === "ok").length;

  return (
    <div className="space-y-4">
      {/* 总览卡片 */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold">系统状态总览</h3>
            <p className="text-xs text-[var(--text-secondary)]">实时检测各子系统健康度</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={errorCount > 0 ? "danger" : warningCount > 0 ? "warning" : "success"}
              label={checking ? "检查中" : errorCount > 0 ? `${errorCount} 项异常` : "全部正常"}
            />
            <button
              type="button"
              onClick={() => void checkAll()}
              disabled={checking}
              title="重新检查"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <RefreshCcw size={14} className={checking ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </Card>

      {/* 统计网格 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <p className="text-2xl font-semibold text-[var(--success)]">{okCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">正常</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-[var(--warning)]">{warningCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">待确认</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-[var(--danger)]">{errorCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">异常</p>
        </Card>
      </div>

      {/* 子系统列表 */}
      <div className="space-y-2">
        {statuses.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--text-secondary)]">检查中...</p>
          </Card>
        ) : (
          statuses.map((s) => (
            <Card key={s.name}>
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  s.status === "ok" ? "bg-[var(--success)]/10 text-[var(--success)]" :
                  s.status === "error" ? "bg-[var(--danger)]/10 text-[var(--danger)]" :
                  "bg-[var(--warning)]/10 text-[var(--warning)]"
                }`}>
                  {s.status === "ok" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {s.status === "error" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
                  {s.status === "warning" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">{s.detail}</p>
                </div>
                <StatusBadge
                  status={s.status === "ok" ? "success" : s.status === "error" ? "danger" : "warning"}
                  label={s.status === "ok" ? "正常" : s.status === "error" ? "异常" : "待确认"}
                />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function HealthDetail() {
  const { getLatest, getConfig } = useHealth();
  const { screenRecordingMissing } = usePermissions();
  const [health, setHealth] = useState<{
    ok: boolean; timestamp: number; mode: string;
    confidence?: number; textLength?: number; sinceLastCaptureMs: number; error?: string;
  } | null>(null);
  const [config, setConfig] = useState<{ enabled: boolean; intervalSeconds: number } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    void getLatest().then(setHealth).catch(() => {});
    void getConfig().then(setConfig).catch(() => {});
    const off = window.ovoAPI.on("health:update", (payload) => {
      if (payload) setHealth(payload as typeof health);
    });
    return () => { try { off(); } catch { /* ignore */ } };
  }, [getLatest, getConfig]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">截屏健康</h2>
      {config && (
        <Card title="配置">
          <div className="flex items-center justify-between text-sm">
            <span>自检状态</span>
            <StatusBadge status={config.enabled ? "success" : "warning"} label={config.enabled ? "已开启" : "已关闭"} />
          </div>
          <p className="mt-2 text-sm">间隔: {config.intervalSeconds} 秒</p>
        </Card>
      )}
      {!health ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            {!isElectron
              ? "开发模式：需要 Electron 环境"
              : screenRecordingMissing
                ? "等待屏幕录制授权后自动开始自检"
                : "健康数据加载中..."}
          </p>
        </Card>
      ) : (
        <Card title="最近自检报告">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>结果</span>
              <StatusBadge status={health.ok ? "success" : "danger"} label={health.ok ? "健康" : "异常"} />
            </div>
            <p>模式: {health.mode}</p>
            <p>时间: {new Date(health.timestamp).toLocaleString()}</p>
            <p>OCR 置信度: {Math.round(health.confidence ?? 0)}%</p>
            <p>文本长度: {health.textLength ?? 0}</p>
            <p>距离最近捕获: {health.sinceLastCaptureMs} ms</p>
            {health.error && <p className="text-[var(--danger)]">错误: {health.error}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function AgentEngineDetail() {
  const { detectBackends, getStatus } = useAgentBridge();
  const [backends, setBackends] = useState<string[]>([]);
  const [status, setStatus] = useState<{
    availableBackends?: string[];
    current?: string | null;
    callCount?: number;
    failureCount?: number;
    lastCallAt?: number;
    lastDurationMs?: number;
    lastError?: string | null;
    expandedPath?: string;
  } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    void detectBackends().then(setBackends);
    const refresh = async () => {
      const s = await getStatus();
      if (s) setStatus(s);
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [detectBackends, getStatus]);

  const failureRate = status && status.callCount && status.callCount > 0
    ? Math.round(((status.failureCount ?? 0) / status.callCount) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agent 引擎</h2>
      {isElectron ? (
        <Card>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>后端状态</span>
              <StatusBadge status={backends.length > 0 ? "success" : "warning"} label={backends.length > 0 ? "可用" : "不可用"} />
            </div>
            <p>已连接后端: {backends.join(", ") || "无"}</p>
            {status && (
              <>
                <p>当前后端: {status.current ?? "未选择"}</p>
                <p>调用次数: {status.callCount ?? 0} (失败 {status.failureCount ?? 0}, 失败率 {failureRate}%)</p>
                <p>最近调用: {status.lastCallAt ? new Date(status.lastCallAt).toLocaleString() : "尚未调用"}</p>
                <p>最近耗时: {status.lastDurationMs ?? 0} ms</p>
                {status.lastError && (
                  <p className="text-[var(--danger)]">最近错误: {status.lastError}</p>
                )}
                {status.expandedPath && (
                  <details className="text-xs text-[var(--text-muted)]">
                    <summary className="cursor-pointer">扩展 PATH（{status.expandedPath.split(":").length} 项）</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg-base)] p-2 font-mono text-[10px]">{status.expandedPath.split(":").join("\n")}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">开发模式：需要 Electron 环境</p>
        </Card>
      )}
    </div>
  );
}

function GraphDetail() {
  const { getStats } = useKnowledgeGraph();
  const [stats, setStats] = useState<{ entities: number; relationships: number; events: number; pipelines: number } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    void getStats().then(setStats);
  }, [getStats]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">知识图谱</h2>
      {isElectron ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Card>
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.entities ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">实体</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.relationships ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">关系</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.events ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">事件</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.pipelines ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">Pipeline</p>
          </Card>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">开发模式：需要 Electron 环境</p>
        </Card>
      )}
    </div>
  );
}

function PipelineOverviewDetail() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!isElectron) return;
    try {
      return window.ovoAPI.on("pipeline:update", (d: { id?: string; status?: string }) => {
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Pipeline: ${d?.id ?? ""} ${d?.status ?? ""}`, ...prev].slice(0, 30));
      });
    } catch { return () => {}; }
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Pipeline 概览</h2>
      <Card title="实时日志">
        <LogViewer logs={logs} />
      </Card>
    </div>
  );
}

function ErrorLogDetail() {
  const [errors, setErrors] = useState<Array<{ level: string; timestamp: string; source: string; message: string }>>([]);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    if (!isElectron) return;
    void window.ovoAPI.errorLog.getRecent(50).then(setErrors).catch(() => setErrors([]));
    void window.ovoAPI.errorLog.getCount().then(setErrorCount).catch(() => setErrorCount(0));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">错误日志</h2>
        <StatusBadge status={errorCount > 0 ? "warning" : "success"} label={`${errorCount} 条错误`} />
      </div>
      <Card>
        {errors.length === 0 ? (
          <Empty icon={ShieldCheck} title="没有错误日志" hint="应用运行正常" />
        ) : (
          <div className="space-y-2 text-sm">
            {errors.map((entry, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${
                entry.level === "error" ? "border-[var(--danger)]/30 bg-[var(--danger)]/5" :
                "border-[var(--border)]"
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    entry.level === "error" ? "text-[var(--danger)]" : "text-[var(--warning)]"
                  }`}>{entry.level.toUpperCase()}</span>
                  <span className="text-xs text-[var(--text-muted)]">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{entry.source}</p>
                <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">{entry.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PermissionsDetail() {
  const { screenRecordingMissing, openSettings, requestScreenRecording, checkStatus } = usePermissions();
  const [permResult, setPermResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleRequestPermission = async () => {
    setPermResult(null);
    const result = await requestScreenRecording();
    setPermResult(result);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">系统权限</h2>
      <Card title="屏幕录制权限">
        {screenRecordingMissing ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/5 px-3 py-2.5">
              <p className="text-sm font-medium text-[var(--warning)]">未授权</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">截图/OCR/主动建议功能将不可用</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <GlowButton className="!py-1.5 !text-xs" onClick={() => void handleRequestPermission()}>触发授权</GlowButton>
              <GlowButton className="!py-1.5 !text-xs" onClick={() => openSettings("screen")}>系统设置</GlowButton>
              <GlowButton className="!py-1.5 !text-xs" onClick={() => void checkStatus()}>重新检查</GlowButton>
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
    </div>
  );
}

function SchedulerDetail() {
  const [tasks, setTasks] = useState<SchedulerTaskStatusPayload[]>([]);
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);

  const refresh = useCallback(async () => {
    if (!isElectron) return;
    try {
      const [taskList, alertList] = await Promise.all([
        window.ovoAPI.scheduler.getStatus(),
        window.ovoAPI.alerts.getRecent(30)
      ]);
      setTasks(taskList ?? []);
      setAlerts(alertList ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    const off = isElectron
      ? window.ovoAPI.on("alert:new", (entry) => {
          setAlerts((prev) => [...prev.slice(-29), entry]);
        })
      : null;
    return () => {
      window.clearInterval(interval);
      try { off?.(); } catch { /* ignore */ }
    };
  }, [refresh]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">调度器与告警</h2>
      <Card title="活动任务">
        {tasks.length === 0 ? (
          <Empty compact icon={ListTodo} title="还没有注册任务" />
        ) : (
          <div className="space-y-2 text-sm">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                <div>
                  <p className="font-medium">{task.id}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    间隔 {Math.round(task.intervalMs / 1000)}s · 运行 {task.runCount} · 错误 {task.errorCount}
                    {typeof task.queueSize === "number" ? ` · 队列 ${task.queueSize}` : ""}
                  </p>
                  {task.lastError && (
                    <p className="mt-1 font-mono text-xs text-[var(--danger)]">{task.lastError}</p>
                  )}
                </div>
                <StatusBadge
                  status={task.errorCount > 0 ? "warning" : "success"}
                  label={task.running ? "运行中" : "待触发"}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
      <LiveLogStream />
      <Card title="最近告警">
        {alerts.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">无告警</p>
        ) : (
          <div className="space-y-2 text-sm">
            {alerts.slice().reverse().map((alert, i) => (
              <div
                key={`${alert.timestamp}-${i}`}
                className={`rounded-lg border px-3 py-2 ${
                  alert.level === "critical" ? "border-[var(--danger)]/40 bg-[var(--danger)]/5" :
                  alert.level === "error" ? "border-[var(--danger)]/30 bg-[var(--danger)]/5" :
                  alert.level === "warn" ? "border-[var(--warning)]/30 bg-[var(--warning)]/5" :
                  "border-[var(--border)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    alert.level === "critical" || alert.level === "error" ? "text-[var(--danger)]" :
                    alert.level === "warn" ? "text-[var(--warning)]" :
                    "text-[var(--text-secondary)]"
                  }`}>
                    {alert.level.toUpperCase()} · {alert.source}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{alert.message}</p>
                {alert.context && Object.keys(alert.context).length > 0 && (
                  <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg-base)] px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">
                    {JSON.stringify(alert.context)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function StatusPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const detail = ctx?.selectedId ?? "_overview";

  if (detail === "_overview") return <SystemOverview />;
  if (detail === "health") return <HealthDetail />;
  if (detail === "agent") return <AgentEngineDetail />;
  if (detail === "graph") return <GraphDetail />;
  if (detail === "pipeline") return <PipelineOverviewDetail />;
  if (detail === "error_log") return <ErrorLogDetail />;
  if (detail === "scheduler") return <SchedulerDetail />;
  if (detail === "permissions") return <PermissionsDetail />;

  return <SystemOverview />;
}
