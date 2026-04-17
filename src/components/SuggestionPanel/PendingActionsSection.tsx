import { useCallback, useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { usePendingActions, type PendingActionItem } from "../../hooks/usePendingActions";

export function PendingActionsSection() {
  const { pending, confirmAction, cancelAction, removePending } = usePendingActions();
  const [dialog, setDialog] = useState<PendingActionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback((actionId: string) => {
    removePending(actionId);
    setDialog((d) => (d?.action.id === actionId ? null : d));
  }, [removePending]);

  const confirmExecute = useCallback(async () => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmAction({
        action: dialog.action,
        pipelineId: dialog.pipelineId
      });
      if (result?.status === "failed") {
        setError(result.error ?? "执行失败");
        return;
      }
      remove(dialog.action.id);
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "执行异常");
    } finally {
      setBusy(false);
    }
  }, [confirmAction, dialog, remove]);

  const handleCancelAction = useCallback(async () => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      await cancelAction({
        actionId: dialog.action.id,
        pipelineId: dialog.pipelineId
      });
      remove(dialog.action.id);
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消异常");
    } finally {
      setBusy(false);
    }
  }, [cancelAction, dialog, remove]);

  if (pending.length === 0 && !dialog) return null;

  return (
    <>
      <Card>
        <p className="mb-2 text-xs text-[var(--text-muted)]">待确认的操作需要您确认后才会执行</p>
        <ul className="space-y-2">
          {pending.map((item) => (
            <li
              key={`${item.pipelineId}-${item.action.id}`}
              className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{item.action.description || item.action.id}</span>
              <GlowButton onClick={() => setDialog(item)}>确认…</GlowButton>
            </li>
          ))}
        </ul>
      </Card>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-white/15 bg-[#12121c] p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold">确认执行 Action</h3>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">Pipeline: {dialog.pipelineId}</p>
            <pre className="mb-3 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs text-[var(--text-secondary)]">
              {JSON.stringify(
                { id: dialog.action.id, description: dialog.action.description, params: dialog.action.params },
                null,
                2
              )}
            </pre>
            {error ? <p className="mb-3 text-xs text-red-400">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <GlowButton onClick={() => void confirmExecute()} disabled={busy}>
                {busy ? "处理中…" : "执行"}
              </GlowButton>
              <GlowButton onClick={() => void handleCancelAction()} disabled={busy}>
                取消
              </GlowButton>
              <GlowButton
                onClick={() => {
                  setError(null);
                  void confirmExecute();
                }}
                disabled={busy}
              >
                重试
              </GlowButton>
              <GlowButton
                onClick={() => {
                  setDialog(null);
                  setError(null);
                }}
                disabled={busy}
              >
                关闭
              </GlowButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
