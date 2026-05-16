import { useCallback, useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, RotateCcw, X, Zap } from "lucide-react";
import { Card } from "../shared/Card";
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

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
  };

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
        <div className="mb-2 flex items-center gap-1.5">
          <Zap size={13} className="text-[var(--warning)]" />
          <p className="text-[12px] font-medium text-[var(--text-primary)]">
            等你确认 <span className="text-[var(--text-muted)]">({pending.length})</span>
          </p>
        </div>
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">
          ovo 想替你做这些事，需要你点头才会执行
        </p>
        <ul className="space-y-1.5">
          {pending.map((item) => (
            <li
              key={`${item.pipelineId}-${item.action.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {item.action.description || item.action.id}
              </span>
              <button
                type="button"
                onClick={() => setDialog(item)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                查看
                <ChevronRight size={11} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {dialog && (
        <ConfirmDialog
          dialog={dialog}
          busy={busy}
          error={error}
          onConfirm={() => void confirmExecute()}
          onCancel={() => void handleCancelAction()}
          onClose={closeDialog}
          onRetry={() => { setError(null); void confirmExecute(); }}
        />
      )}
    </>
  );
}

interface ConfirmDialogProps {
  dialog: PendingActionItem;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
}

function ConfirmDialog({ dialog, busy, error, onConfirm, onCancel, onClose, onRetry }: ConfirmDialogProps) {
  const params = dialog.action.params ?? {};
  const paramEntries = Object.entries(params);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
            <Zap size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              要让 ovo 执行吗？
            </h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {dialog.action.description || "ovo 准备执行一个操作，需要你确认"}
            </p>
          </div>
        </div>

        {/* 参数预览：人话表格而不是 JSON dump */}
        {paramEntries.length > 0 && (
          <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              执行参数
            </p>
            <dl className="space-y-1.5">
              {paramEntries.map(([k, v]) => (
                <div key={k} className="flex items-start gap-3 text-[12px]">
                  <dt className="w-20 shrink-0 text-[var(--text-muted)]">{k}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--text-primary)]">
                    {formatParamValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* 错误提示 —— 人话 */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 text-[12px] text-[var(--danger)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">没成功</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{error}</p>
            </div>
          </div>
        )}

        {/* 操作区：主次按钮分明 */}
        <div className="flex items-center gap-2">
          {error ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                {busy ? "重试中…" : "再试一次"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                关闭
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {busy ? "执行中…" : "执行"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--danger)]/50 hover:text-[var(--danger)] disabled:opacity-50"
                title="告诉 ovo 这次不要执行"
              >
                不执行
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="先放一边"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatParamValue(v: unknown): string {
  if (v === null || v === undefined) return "（空）";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
