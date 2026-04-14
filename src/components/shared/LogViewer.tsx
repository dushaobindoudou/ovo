interface LogViewerProps {
  logs: string[];
}

export function LogViewer({ logs }: LogViewerProps) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-[var(--bg-input)] p-3 text-xs text-[var(--text-secondary)]">
      {logs.length === 0 ? <p>暂无日志</p> : null}
      {logs.map((log) => (
        <p key={log} className="mb-1 leading-5">
          {log}
        </p>
      ))}
    </div>
  );
}
