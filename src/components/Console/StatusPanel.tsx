import { useEffect, useState, useCallback } from "react";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { GlowButton } from "../shared/GlowButton";
import { LogViewer } from "../shared/LogViewer";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { useAgentBridge } from "../../hooks/useAgentBridge";

/** 检查是否在 Electron 环境中 */
const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

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

  // 安全地获取知识图谱统计
  const safeGetStats = useCallback(async () => {
    try {
      return await getStats();
    } catch {
      return { entities: 0, relationships: 0, events: 0, pipelines: 0 };
    }
  }, [getStats]);

  // 安全地检测后端
  const safeDetectBackends = useCallback(async () => {
    try {
      return await detectBackends();
    } catch {
      return [];
    }
  }, [detectBackends]);

  // 安全地获取健康状态
  const safeGetLatestHealth = useCallback(async () => {
    if (!isElectron) return null;
    try {
      return await window.nudgeAPI.health.getLatest();
    } catch {
      return null;
    }
  }, []);

  // 安全地订阅管道更新
  const safeOnPipelineUpdate = useCallback(() => {
    if (!isElectron) return () => {};
    try {
      return window.nudgeAPI.on("pipeline:update", (data: unknown) => {
        const d = data as { id?: string; status?: string };
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Pipeline: ${d?.id ?? ""} ${d?.status ?? ""}`, ...prev].slice(0, 30));
      });
    } catch {
      return () => {};
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setStats(await safeGetStats());
      setBackends(await safeDetectBackends());
      setHealth(await safeGetLatestHealth());
    })();

    if (!isElectron) {
      setLogs((prev) => [...prev, "[开发模式] 非 Electron 环境，跳过实时事件"]);
      return;
    }

    const offPipeline = safeOnPipelineUpdate();
    return () => {
      offPipeline();
    };
  }, [safeGetStats, safeDetectBackends, safeGetLatestHealth, safeOnPipelineUpdate, isElectron]);

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
            <StatusBadge status={health?.ok ? "success" : "danger"} label={health?.ok ? "健康" : "异常"} />
            <p>模式: {health?.mode ?? "-"}</p>
            <p>最近自检: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "-"}</p>
            <p>OCR 置信度: {Math.round(health?.confidence ?? 0)}%</p>
            <p>文本长度: {health?.textLength ?? 0}</p>
            <p>距离最近捕获: {health?.sinceLastCaptureMs ?? -1} ms</p>
            {health?.error ? <p className="text-red-500">错误: {health.error}</p> : null}
          </div>
        </Card>
      </div>

      <Card title="实时日志">
        <LogViewer logs={logs} />
      </Card>
    </div>
  );
}
