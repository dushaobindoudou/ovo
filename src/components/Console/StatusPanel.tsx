import { useEffect, useState, useCallback } from "react";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { LogViewer } from "../shared/LogViewer";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { useAgentBridge } from "../../hooks/useAgentBridge";

/** 检查是否在 Electron 环境中 */
const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

function HealthDetail() {
  const [health, setHealth] = useState<{
    ok: boolean; timestamp: number; mode: "simulation" | "real";
    confidence?: number; textLength?: number; sinceLastCaptureMs: number; error?: string;
  } | null>(null);

  const safeGetLatest = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.health.getLatest(); } catch { return null; }
  }, []);

  useEffect(() => { void safeGetLatest().then(setHealth); }, [safeGetLatest]);

  if (!health) {
    return (
      <Card title="截屏自检详情">
        <div className="space-y-2 text-sm">
          {isElectron ? (
            <p className="text-sm text-[var(--text-secondary)]">健康数据加载中...</p>
          ) : (
            <div className="rounded-lg border border-[var(--border)] px-3 py-2">
              <p className="text-sm text-[var(--text-secondary)]">开发模式：健康检查需要 Electron 环境。</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">请在 Electron 中运行以查看实时健康数据。</p>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card title="截屏自检详情">
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span>状态</span>
          <StatusBadge status={health.ok ? "success" : "danger"} label={health.ok ? "健康" : "异常"} />
        </div>
        <p>模式: {health.mode}</p>
        <p>最近自检: {new Date(health.timestamp).toLocaleString()}</p>
        <p>OCR 置信度: {Math.round(health.confidence ?? 0)}%</p>
        <p>文本长度: {health.textLength ?? 0}</p>
        <p>距离最近捕获: {health.sinceLastCaptureMs} ms</p>
        {health.error ? <p className="text-[var(--danger)]">错误: {health.error}</p> : null}
      </div>
    </Card>
  );
}

function AgentEngineDetail() {
  const { detectBackends } = useAgentBridge();
  const [backends, setBackends] = useState<string[]>([]);

  const safeDetect = useCallback(async () => {
    try { return await detectBackends(); } catch { return []; }
  }, [detectBackends]);

  useEffect(() => { void safeDetect().then(setBackends); }, [safeDetect]);

  return (
    <Card title="Agent 引擎状态">
      <div className="space-y-2 text-sm">
        {isElectron ? (
          <>
            <div className="flex items-center justify-between">
              <span>后端状态</span>
              <StatusBadge status={backends.length > 0 ? "success" : "warning"} label={backends.length > 0 ? "可用" : "不可用"} />
            </div>
            <p>已连接后端: {backends.join(", ") || "无"}</p>
          </>
        ) : (
          <div className="rounded-lg border border-[var(--border)] px-3 py-2">
            <p className="text-sm text-[var(--text-secondary)]">开发模式：Agent 后端检测需要 Electron 环境。</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function GraphDetail() {
  const { getStats } = useKnowledgeGraph();
  const [stats, setStats] = useState<{ entities: number; relationships: number; events: number; pipelines: number } | null>(null);

  const safeStats = useCallback(async () => {
    try { return await getStats(); } catch { return { entities: 0, relationships: 0, events: 0, pipelines: 0 }; }
  }, [getStats]);

  useEffect(() => { void safeStats().then(setStats); }, [safeStats]);

  return (
    <Card title="知识图谱统计">
      {isElectron ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-[var(--bg-base)] p-3 text-center">
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.entities ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">实体</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] p-3 text-center">
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.relationships ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">关系</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] p-3 text-center">
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.events ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">事件</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] p-3 text-center">
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.pipelines ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Pipeline</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
          <p className="text-sm text-[var(--text-secondary)]">开发模式：知识图谱需要 Electron 环境。</p>
        </div>
      )}
    </Card>
  );
}

function PipelineOverviewDetail() {
  const [logs, setLogs] = useState<string[]>([]);

  const safeOnPipeline = useCallback(() => {
    if (!isElectron) return () => {};
    try {
      return window.nudgeAPI.on("pipeline:update", (d: { id?: string; status?: string }) => {
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Pipeline: ${d?.id ?? ""} ${d?.status ?? ""}`, ...prev].slice(0, 30));
      });
    } catch { return () => {}; }
  }, []);

  useEffect(() => {
    if (!isElectron) {
      setLogs((prev) => ["[开发模式] 非 Electron 环境，跳过实时事件", ...prev]);
      return;
    }
    const off = safeOnPipeline();
    return () => off();
  }, [safeOnPipeline]);

  return (
    <Card title="实时 Pipeline 日志">
      <LogViewer logs={logs} />
    </Card>
  );
}

function ErrorLogDetail() {
  const [errors, setErrors] = useState<Array<{ level: string; timestamp: string; source: string; message: string }>>([]);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    if (!isElectron) return;
    void window.nudgeAPI.errorLog.getRecent(50).then(setErrors).catch(() => setErrors([]));
    void window.nudgeAPI.errorLog.getCount().then(setErrorCount).catch(() => setErrorCount(0));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">错误日志</h2>
        <StatusBadge status={errorCount > 0 ? "warning" : "success"} label={`${errorCount} 条错误`} />
      </div>
      <Card>
        {errors.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">暂无错误日志。应用运行正常。</p>
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

export function StatusPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const detail = ctx?.selectedId ?? "health";

  if (detail === "health") return <div className="space-y-4"><h2 className="text-lg font-semibold">截屏健康</h2><HealthDetail /></div>;
  if (detail === "agent") return <div className="space-y-4"><h2 className="text-lg font-semibold">Agent 引擎</h2><AgentEngineDetail /></div>;
  if (detail === "graph") return <div className="space-y-4"><h2 className="text-lg font-semibold">知识图谱</h2><GraphDetail /></div>;
  if (detail === "pipeline") return <div className="space-y-4"><h2 className="text-lg font-semibold">Pipeline 概览</h2><PipelineOverviewDetail /></div>;
  if (detail === "error_log") return <ErrorLogDetail />;

  return <div className="space-y-4"><h2 className="text-lg font-semibold">状态总览</h2><p className="text-sm text-[var(--text-secondary)]">请选择左侧列表项查看详情。</p></div>;
}
