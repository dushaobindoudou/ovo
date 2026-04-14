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

  useEffect(() => {
    void (async () => {
      setStats(await getStats());
      setBackends(await detectBackends());
    })();
    const offCapture = window.nudgeAPI.on("capture:result", (data) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] OCR: ${data?.appName ?? "unknown"} ${Math.round(data?.confidence ?? 0)}%`, ...prev].slice(0, 30));
    });
    const offPipeline = window.nudgeAPI.on("pipeline:update", (data) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Pipeline: ${data?.id ?? ""} ${data?.status ?? ""}`, ...prev].slice(0, 30));
    });
    return () => {
      offCapture();
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
      </div>

      <Card title="实时日志">
        <LogViewer logs={logs} />
      </Card>
    </div>
  );
}
