import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { GlowButton } from "../shared/GlowButton";
import { LogViewer } from "../shared/LogViewer";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { useAgentBridge } from "../../hooks/useAgentBridge";

export function StatusPanel() {
  const { getStats } = useKnowledgeGraph();
  const { detectBackends } = useAgentBridge();
  const [stats, setStats] = useState<{ entities: number; relationships: number; events: number; pipelines: number } | null>(null);
  const [backends, setBackends] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [health, setHealth] = useState<{
    ok: boolean;
    timestamp: number;
    mode: "simulation" | "real";
    confidence?: number;
    textLength?: number;
    sinceLastCaptureMs: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      setStats(await getStats());
      setBackends(await detectBackends());
    })();
    const offCapture = window.nudgeAPI.on("capture:result", (data) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] OCR: ${data?.appName ?? "unknown"} ${Math.round(data?.confidence ?? 0)}%`, ...prev].slice(0, 30));
    });
    const offHealth = window.nudgeAPI.on("health:update", (data) => {
      setHealth(data ?? null);
      setLogs((prev) => {
        const line = data?.ok
          ? `[${new Date().toLocaleTimeString()}] Health: PASS ${data?.mode ?? ""} conf=${Math.round(data?.confidence ?? 0)}`
          : `[${new Date().toLocaleTimeString()}] Health: FAIL ${data?.error ?? "unknown"}`;
        return [line, ...prev].slice(0, 30);
      });
    });
    const offPipeline = window.nudgeAPI.on("pipeline:update", (data) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Pipeline: ${data?.id ?? ""} ${data?.status ?? ""}`, ...prev].slice(0, 30));
    });
    void window.nudgeAPI.health.getLatest().then((data) => setHealth(data ?? null));
    return () => {
      offCapture();
      offHealth();
      offPipeline();
    };
  }, [detectBackends, getStats]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">状态总览</h2>
        <GlowButton onClick={() => window.location.reload()}>刷新</GlowButton>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Agent 引擎">
          <div className="space-y-2 text-sm">
            <StatusBadge status={backends.length > 0 ? "success" : "warning"} label={backends.length > 0 ? "可用" : "不可用"} />
            <p>后端: {backends.join(", ") || "无"}</p>
          </div>
        </Card>
        <Card title="知识图谱">
          <div className="space-y-1 text-sm text-[var(--text-secondary)]">
            <p>实体: {stats?.entities ?? 0}</p>
            <p>关系: {stats?.relationships ?? 0}</p>
            <p>事件: {stats?.events ?? 0}</p>
            <p>Pipeline: {stats?.pipelines ?? 0}</p>
          </div>
        </Card>
        <Card title="截屏自检">
          <div className="space-y-2 text-sm">
            <StatusBadge
              status={health?.ok ? "success" : "danger"}
              label={health?.ok ? "健康" : "异常"}
            />
            <p>模式: {health?.mode ?? "-"}</p>
            <p>最近自检: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "-"}</p>
            <p>OCR 置信度: {Math.round(health?.confidence ?? 0)}%</p>
            <p>文本长度: {health?.textLength ?? 0}</p>
            <p>距离最近捕获: {health?.sinceLastCaptureMs ?? -1} ms</p>
            {health?.error ? <p className="text-rose-300">错误: {health.error}</p> : null}
          </div>
        </Card>
      </div>

      <Card title="实时日志">
        <LogViewer logs={logs} />
      </Card>
    </div>
  );
}
