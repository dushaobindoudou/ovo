import { useMemo, useState } from "react";
import { Check, X, Minus, ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";
import { useFeedback } from "../../hooks/useFeedback";
import { GlowButton } from "../shared/GlowButton";
import { Card } from "../shared/Card";

interface PipelineDetailProps {
  item: any;
}

const STAGE_ORDER: Array<{ key: string; label: string }> = [
  { key: "aggregate", label: "聚合" },
  { key: "agent", label: "Agent 调用" },
  { key: "schema", label: "Schema 校验" },
  { key: "suggestions", label: "建议生成" },
  { key: "actions", label: "Action 执行" },
  { key: "graphUpdate", label: "图谱更新" }
];

type StatusKind = "success" | "failed" | "skipped" | "pending" | "unknown";

function statusKind(stage: any): StatusKind {
  if (!stage) return "pending";
  const s = stage.status;
  if (s === "success") return "success";
  if (s === "failed") return "failed";
  if (s === "skipped") return "skipped";
  if (s === "pending" || s === "running") return "pending";
  return "unknown";
}

function StageNode({
  index, label, kind, active, onClick
}: {
  index: number;
  label: string;
  kind: StatusKind;
  active: boolean;
  onClick: () => void;
}) {
  const palette: Record<StatusKind, string> = {
    success: "border-[var(--success)] bg-[var(--success)]/15 text-[var(--success)]",
    failed: "border-[var(--danger)] bg-[var(--danger)]/15 text-[var(--danger)]",
    skipped: "border-[var(--text-muted)] bg-[var(--bg-base)] text-[var(--text-muted)]",
    pending: "border-[var(--warning)] bg-[var(--warning)]/15 text-[var(--warning)]",
    unknown: "border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)]"
  };
  const icon = kind === "success" ? <Check size={14} /> :
               kind === "failed" ? <X size={14} /> :
               kind === "skipped" ? <Minus size={14} /> :
               <span className="text-xs font-bold">{index + 1}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center gap-1 transition-transform hover:-translate-y-0.5 ${active ? "scale-105" : ""}`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${palette[kind]} ${active ? "ring-2 ring-[var(--accent)]/60 ring-offset-2 ring-offset-[var(--bg-card)]" : ""}`}
      >
        {icon}
      </div>
      <span className={`max-w-[90px] truncate text-[11px] ${active ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
        {label}
      </span>
    </button>
  );
}

function StageBlock({ label, value, fallback }: { label: string; value: unknown; fallback: string }) {
  const isEmpty = value === undefined || value === null
    || (typeof value === "object" && value !== null && Object.keys(value as object).length === 0);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      {isEmpty ? (
        <p className="text-xs text-[var(--text-muted)]">{fallback}</p>
      ) : (
        <pre className="max-h-72 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px] text-[var(--text-secondary)]">
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function PipelineDetail({ item }: PipelineDetailProps) {
  const { ratePipelineStage, ratePipelineOverall } = useFeedback();

  // 兼容：stages 可能存的是 string（旧版 JSON），先 normalize
  const normalized = useMemo(() => {
    if (typeof item?.stages === "string") {
      try { return JSON.parse(item.stages); } catch { return {}; }
    }
    return (item?.stages ?? {}) as Record<string, any>;
  }, [item]);

  const ordered = STAGE_ORDER.map(({ key, label }) => ({
    key,
    label,
    data: normalized[key],
    kind: statusKind(normalized[key])
  }));

  const firstActiveIdx = ordered.findIndex((s) => s.kind === "failed") !== -1
    ? ordered.findIndex((s) => s.kind === "failed")
    : 0;
  const [activeKey, setActiveKey] = useState<string>(ordered[firstActiveIdx]?.key ?? STAGE_ORDER[0].key);
  const activeStage = ordered.find((s) => s.key === activeKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">Pipeline</p>
          <p className="truncate text-sm font-mono">{item.id}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {item.timestamp ? new Date(item.timestamp).toLocaleString() : ""} · 耗时 {item.duration ?? 0}ms · 状态 {item.status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void ratePipelineOverall(item.id, "good")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--success)] hover:text-[var(--success)]"
            title="好评"
          >
            <ThumbsUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => void ratePipelineOverall(item.id, "bad")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            title="差评"
          >
            <ThumbsDown size={13} />
          </button>
        </div>
      </div>

      {/* 横向节点条 */}
      <Card>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {ordered.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <StageNode
                index={i}
                label={s.label}
                kind={s.kind}
                active={s.key === activeKey}
                onClick={() => setActiveKey(s.key)}
              />
              {i < ordered.length - 1 && (
                <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 当前节点详情 */}
      {activeStage && (
        <Card title={`阶段详情 — ${activeStage.label}`}>
          {activeStage.data ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  activeStage.kind === "success" ? "bg-[var(--success)]/15 text-[var(--success)]" :
                  activeStage.kind === "failed" ? "bg-[var(--danger)]/15 text-[var(--danger)]" :
                  activeStage.kind === "skipped" ? "bg-[var(--bg-base)] text-[var(--text-muted)]" :
                  "bg-[var(--warning)]/15 text-[var(--warning)]"
                }`}>{activeStage.kind}</span>
                {typeof activeStage.data.duration === "number" && (
                  <span className="text-xs text-[var(--text-secondary)]">耗时 {activeStage.data.duration} ms</span>
                )}
                {activeStage.data.startTime && (
                  <span className="text-xs text-[var(--text-muted)]">
                    @ {new Date(activeStage.data.startTime).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {activeStage.data.error && (
                <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3 py-2">
                  <p className="text-xs font-medium text-[var(--danger)]">错误</p>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--danger)]">{String(activeStage.data.error)}</p>
                </div>
              )}
              <StageBlock label="输入 (input)" value={activeStage.data.input} fallback="（无）" />
              <StageBlock label="输出 (output)" value={activeStage.data.output ?? activeStage.data.data} fallback="（无）" />
              <div className="flex gap-2 pt-1">
                <GlowButton className="!py-1 !text-xs" onClick={() => void ratePipelineStage(item.id, activeStage.key, "good")}>
                  这步靠谱
                </GlowButton>
                <GlowButton className="!py-1 !text-xs" onClick={() => void ratePipelineStage(item.id, activeStage.key, "bad")}>
                  这步有问题
                </GlowButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">该阶段没有数据（可能未运行或已跳过）。</p>
          )}
        </Card>
      )}
    </div>
  );
}
