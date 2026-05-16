import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { PipelineDetail } from "./PipelineDetail";
import { usePipeline } from "../../hooks/usePipeline";
import { useLogs, type SystemLogRow, type BusinessLogRow } from "../../hooks/useLogs";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function PipelinePanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { items, refresh, clear, getDetail } = usePipeline();
  const { getSystemLogs, getBusinessLogs } = useLogs();
  const [errors, setErrors] = useState<Array<{ level: string; timestamp: string; source: string; message: string }>>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);
  const [systemLogs, setSystemLogs] = useState<SystemLogRow[]>([]);
  const [businessLogs, setBusinessLogs] = useState<BusinessLogRow[]>([]);

  useEffect(() => {
    if (ctx?.selectedId === "_errors" && isElectron) {
      void window.ovoAPI.errorLog.getRecent(50).then(setErrors).catch(() => setErrors([]));
      void window.ovoAPI.errorLog.getCount().then(setErrorCount).catch(() => setErrorCount(0));
    }
    if (ctx?.selectedId === "_system_logs") {
      void getSystemLogs(100).then(setSystemLogs);
    }
    if (ctx?.selectedId === "_business_logs") {
      void getBusinessLogs({ limit: 100 }).then(setBusinessLogs);
    }
  }, [ctx?.selectedId, getSystemLogs, getBusinessLogs]);

  const fallback = items.find((item) => item.id === ctx?.selectedId) ?? null;
  const showErrors = ctx?.selectedId === "_errors";
  const showSystemLogs = ctx?.selectedId === "_system_logs";
  const showBusinessLogs = ctx?.selectedId === "_business_logs";
  const active = detail && detail.id === ctx?.selectedId ? detail : fallback;

  useEffect(() => {
    const id = ctx?.selectedId;
    if (!id || id === "_errors" || id.startsWith("_")) {
      setDetail(null);
      return;
    }
    void getDetail(id).then((d) => {
      if (d) setDetail(d);
    });
  }, [ctx?.selectedId, getDetail]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">运行日志</h2>
        <div className="flex gap-2">
          <GlowButton onClick={() => void refresh()}>刷新</GlowButton>
          <GlowButton onClick={() => void clear().then(refresh)}>清空</GlowButton>
        </div>
      </div>

      {showErrors ? (
        <div className="space-y-4">
          <h3 className="text-md font-semibold">错误日志 ({errorCount} 条)</h3>
          {errors.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--text-secondary)]">暂无错误日志。应用运行正常。</p>
            </Card>
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
        </div>
      ) : showSystemLogs ? (
        <Card title="系统日志">
          {systemLogs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">暂无系统日志。</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {systemLogs.map((row) => (
                <div key={row.id} className="rounded-md border border-[var(--border)] px-2.5 py-1.5">
                  <div className="flex items-center justify-between text-[var(--text-secondary)]">
                    <span className={`font-medium ${
                      row.level === "error" ? "text-[var(--danger)]" :
                      row.level === "warning" ? "text-[var(--warning)]" : "text-[var(--accent)]"
                    }`}>{row.level.toUpperCase()} · {row.source}</span>
                    <span className="text-[var(--text-muted)]">{new Date(row.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 font-mono">{row.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : showBusinessLogs ? (
        <Card title="业务日志">
          {businessLogs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">暂无业务日志。</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {businessLogs.map((row) => (
                <div key={row.id} className="rounded-md border border-[var(--border)] px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{row.node}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                      row.status === "failed" ? "bg-[var(--danger)]/10 text-[var(--danger)]" :
                      row.status === "success" ? "bg-[var(--success)]/10 text-[var(--success)]" :
                      "bg-[var(--bg-base)] text-[var(--text-secondary)]"
                    }`}>{row.status}</span>
                  </div>
                  <p className="mt-0.5 text-[var(--text-secondary)]">pipeline: {row.pipeline_id ?? "—"}</p>
                  <p className="mt-0.5 text-[var(--text-muted)]">{new Date(row.start_time).toLocaleString()}</p>
                  {row.error && <p className="mt-0.5 font-mono text-[var(--danger)]">{row.error}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : active ? (
        <Card title={`Pipeline 详情 — ${active.id}`} className="h-[70vh] overflow-auto">
          <PipelineDetail item={active} />
        </Card>
      ) : (
        <Card>
          <div className="space-y-3 text-sm">
            <p className="text-[var(--text-secondary)]">请在左侧列表选择一条 Pipeline 查看详情。</p>
            <p className="text-xs text-[var(--text-muted)]">如果列表为空，可以先在「设置 → 数据管理」运行示例 Pipeline。</p>
            <GlowButton
              className="!text-xs"
              onClick={async () => {
                if (!isElectron) return;
                try { await window.ovoAPI.dev.runSamplePipeline(); await refresh(); } catch { /* ignore */ }
              }}
            >
              运行示例 Pipeline
            </GlowButton>
          </div>
        </Card>
      )}
    </div>
  );
}
