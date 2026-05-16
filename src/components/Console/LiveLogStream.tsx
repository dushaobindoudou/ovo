import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../shared/Card";
import type { AlertPayload, LogStreamEntry } from "../../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface UnifiedRow {
  kind: "log" | "alert";
  timestamp: number;
  level: string;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_OPTIONS = ["info", "warning", "warn", "error", "critical"] as const;

export function LiveLogStream() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Set<string>>(() => new Set(LEVEL_OPTIONS));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!isElectron) return;
    const offLog = window.ovoAPI.on("log:stream", (entry: LogStreamEntry) => {
      if (pausedRef.current) return;
      setRows((prev) => [
        ...prev.slice(-499),
        {
          kind: "log",
          timestamp: entry.timestamp,
          level: entry.level,
          source: entry.source,
          message: entry.message,
          context: entry.context
        }
      ]);
    });
    const offAlert = window.ovoAPI.on("alert:new", (entry: AlertPayload) => {
      if (pausedRef.current) return;
      setRows((prev) => [
        ...prev.slice(-499),
        {
          kind: "alert",
          timestamp: new Date(entry.timestamp).getTime(),
          level: entry.level,
          source: entry.source,
          message: entry.message,
          context: entry.context
        }
      ]);
    });
    return () => { offLog(); offAlert(); };
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const lv = row.level === "warn" ? "warn" : row.level;
      return filter.has(lv);
    });
  }, [rows, filter]);

  const toggleLevel = (lv: string) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lv)) next.delete(lv); else next.add(lv);
      return next;
    });
  };

  return (
    <Card title="实时日志流（主进程 + 告警）">
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        {LEVEL_OPTIONS.map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => toggleLevel(lv)}
            className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
              filter.has(lv)
                ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-secondary)]"
            }`}
          >
            {lv}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] hover:bg-[var(--bg-card-hover)]"
          >
            {paused ? "继续" : "暂停"}
          </button>
          <button
            type="button"
            onClick={() => setRows([])}
            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] hover:bg-[var(--bg-card-hover)]"
          >
            清空
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto rounded-md bg-[var(--bg-base)] p-2 font-mono text-[11px]">
        {filtered.length === 0 ? (
          <p className="text-[var(--text-muted)]">等待日志事件…</p>
        ) : (
          filtered.map((row, i) => (
            <div
              key={`${row.timestamp}-${i}`}
              className={`flex gap-2 border-b border-[var(--border)]/40 py-1 last:border-b-0 ${
                row.level === "critical" || row.level === "error" ? "text-[var(--danger)]" :
                row.level === "warning" || row.level === "warn" ? "text-[var(--warning)]" :
                "text-[var(--text-secondary)]"
              }`}
            >
              <span className="shrink-0 text-[var(--text-muted)]">
                {new Date(row.timestamp).toLocaleTimeString()}
              </span>
              <span className="shrink-0 uppercase">{row.level}</span>
              <span className="shrink-0">[{row.kind === "alert" ? "alert:" : ""}{row.source}]</span>
              <span className="break-all">{row.message}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
