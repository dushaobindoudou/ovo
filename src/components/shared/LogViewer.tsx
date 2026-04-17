interface LogViewerProps {
  logs: string[];
}

export function LogViewer({ logs }: LogViewerProps) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 text-xs text-[var(--text-secondary)] font-mono">
      {logs.length === 0 ? <p className="text-[var(--text-muted)]">暂无日志</p> : null}
      {logs.map((log, i) => (
        <p key={i} className="mb-1 leading-5 break-all">
          {log}
        </p>
      ))}
    </div>
  );
}
