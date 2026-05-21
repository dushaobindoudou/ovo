import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, RotateCcw, X, Zap, ShieldOff, Undo2 } from "lucide-react";
import { Card } from "../shared/Card";
import { Modal } from "../shared/Modal";
import { usePendingActions, type PendingActionItem } from "../../hooks/usePendingActions";
import { translateError, type TranslatedError } from "../../utils/errorTranslator";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectronInternal = typeof window !== "undefined" && !!window.ovoAPI;

// P1.28: 参数 key 翻译表（英文 → 中文，给非工程师用户）
const PARAM_LABELS: Record<string, string> = {
  to: "收件人",
  cc: "抄送",
  bcc: "密送",
  subject: "主题",
  body: "正文",
  text: "内容",
  url: "链接",
  query: "搜索词",
  target: "目标",
  title: "标题",
  summary: "摘要",
  tags: "标签",
  priority: "优先级",
  dueAt: "截止时间",
  startsAt: "开始时间",
  endsAt: "结束时间",
  location: "地点",
  path: "文件路径",
  recursive: "递归扫描",
  maxFiles: "最多文件数"
};

function paramLabel(key: string): string {
  return PARAM_LABELS[key] ?? key;
}

// P1.4 / T10: Gmail 风格 5 秒撤销窗口
const UNDO_WINDOW_MS = 5000;

export function PendingActionsSection() {
  const { pending, confirmAction, cancelAction, removePending } = usePendingActions();
  const [dialog, setDialog] = useState<PendingActionItem | null>(null);
  const [busy, setBusy] = useState(false);
  // 3C-1: error 字段从 string 升级为 TranslatedError——给用户看「为什么 + 怎么办」
  const [error, setError] = useState<TranslatedError | null>(null);
  // PHIL-1 / P0.4: "永远不要这样" 子对话框
  const [neverDialog, setNeverDialog] = useState<PendingActionItem | null>(null);
  // P1.26: 退避重试 — 失败次数 + 下次允许重试的时间
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryAt, setNextRetryAt] = useState<number>(0);
  // P1.27: 长 action cancel + 超时提示
  const [busyStartedAt, setBusyStartedAt] = useState<number>(0);
  const [showSlowHint, setShowSlowHint] = useState(false);
  // T10 / P1.4: 5 秒撤销窗口 — 用户点"让它做"后给 5 秒可撤销
  const [undoExpiresAt, setUndoExpiresAt] = useState<number>(0);
  // 用 ref 让 timer cleanup 拿到稳定句柄
  const undoTimerRef = useRef<number | null>(null);

  const remove = useCallback((actionId: string) => {
    removePending(actionId);
    setDialog((d) => (d?.action.id === actionId ? null : d));
  }, [removePending]);

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
    setRetryCount(0);
    setNextRetryAt(0);
    setShowSlowHint(false);
    // 关闭对话框时清掉撤销窗口
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoExpiresAt(0);
  };

  // T10: 触发"5 秒后执行" — UI 显示倒计时，用户可点撤销
  const startUndoWindow = useCallback(() => {
    if (!dialog) return;
    setUndoExpiresAt(Date.now() + UNDO_WINDOW_MS);
    undoTimerRef.current = window.setTimeout(() => {
      // 5 秒到了，真正执行
      undoTimerRef.current = null;
      setUndoExpiresAt(0);
      void confirmExecuteImmediate();
    }, UNDO_WINDOW_MS);
  // confirmExecuteImmediate 在下方定义，runtime 引用 ok
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  // T10: 撤销按钮
  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoExpiresAt(0);
  }, []);

  // 卸载时清 timer
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // P1.27: 执行超过 15 秒时显示"还在处理...想取消吗？"
  useEffect(() => {
    if (!busy) {
      setShowSlowHint(false);
      return;
    }
    const t = window.setTimeout(() => setShowSlowHint(true), 15_000);
    return () => window.clearTimeout(t);
  }, [busy]);

  // T10 / P1.4: 真正的"执行"逻辑（无延迟）。被 5 秒撤销窗口的 timer 调用 / 重试也调它
  const confirmExecuteImmediate = useCallback(async () => {
    if (!dialog) return;
    // P1.26: 退避策略 — 已失败 N 次时强制等待
    if (nextRetryAt > Date.now()) {
      const waitSec = Math.ceil((nextRetryAt - Date.now()) / 1000);
      setError(translateError(`请等 ${waitSec} 秒后再试 — Ovo 正在退避以避免触发限流`));
      return;
    }
    setBusy(true);
    setError(null);
    setBusyStartedAt(Date.now());
    try {
      const result = await confirmAction({
        action: dialog.action,
        pipelineId: dialog.pipelineId
      });
      if (result?.status === "failed") {
        setError(translateError(result.error ?? "执行失败"));
        // P1.26: 第 1 次立即可重试 / 第 2 次延迟 2s / 第 3 次延迟 5s / 第 4 次以上 30s + 提示
        const next = retryCount + 1;
        setRetryCount(next);
        const delayMs = next === 1 ? 0 : next === 2 ? 2000 : next === 3 ? 5000 : 30_000;
        setNextRetryAt(Date.now() + delayMs);
        return;
      }
      remove(dialog.action.id);
      setDialog(null);
      setRetryCount(0);
      setNextRetryAt(0);
    } catch (e) {
      setError(translateError(e));
      const next = retryCount + 1;
      setRetryCount(next);
      const delayMs = next === 1 ? 0 : next === 2 ? 2000 : next === 3 ? 5000 : 30_000;
      setNextRetryAt(Date.now() + delayMs);
    } finally {
      setBusy(false);
      setBusyStartedAt(0);
    }
  }, [confirmAction, dialog, remove, retryCount, nextRetryAt]);

  // 用户 Bug 3 反馈："点击确认执行没任何效果"
  // 根因：之前用 startUndoWindow 包 5 秒延迟，UI 倒计时 + 真正执行在 5 秒后。
  //   用户 confirm 对话框里点"让它做"已经是显式同意 = 立即执行最自然。
  //   5 秒撤销机制留给 Lv.3 自动执行场景（用户没确认对话框就执行的情况）。
  const confirmExecute = useCallback(() => {
    if (!dialog) return;
    if (nextRetryAt > Date.now()) {
      const waitSec = Math.ceil((nextRetryAt - Date.now()) / 1000);
      setError(translateError(`请等 ${waitSec} 秒后再试 — Ovo 正在退避以避免触发限流`));
      return;
    }
    // 立即执行（不再 startUndoWindow 5 秒等待）
    void confirmExecuteImmediate();
  }, [dialog, nextRetryAt, confirmExecuteImmediate]);

  // startUndoWindow 保留但当前没人调；未来 Lv.3 自动执行 toast 撤销用
  void startUndoWindow;

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
      setError(translateError(e));
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
                {sanitizeForDisplay(item.action.description, "（动作描述含代码，已隐藏）", 180) || item.action.id}
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
          retryCount={retryCount}
          retryBlockedUntil={nextRetryAt}
          showSlowHint={showSlowHint}
          busyStartedAt={busyStartedAt}
          undoExpiresAt={undoExpiresAt}
          onConfirm={confirmExecute}
          onCancel={() => void handleCancelAction()}
          onClose={closeDialog}
          onRetry={() => { setError(null); void confirmExecuteImmediate(); }}
          onNever={() => { setNeverDialog(dialog); }}
          onUndo={handleUndo}
        />
      )}

      {/* PHIL-1 / P0.4: "永远不要这样" — Reflect 层入口 */}
      {neverDialog && (
        <NeverDialog
          dialog={neverDialog}
          onClose={() => setNeverDialog(null)}
          onSaved={async () => {
            // 同时取消当前 pending action（用户教完 Ovo 就不需要再确认这次）
            try {
              await cancelAction({
                actionId: neverDialog.action.id,
                pipelineId: neverDialog.pipelineId
              });
            } catch { /* 让上层错误展示，已写入 KG 不回滚 */ }
            remove(neverDialog.action.id);
            setNeverDialog(null);
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

// ============================================================
// PHIL-1 / P0.4: "永远不要这样" 对话框
// 用户主动教 Ovo 禁忌 — Reflect 层从此开口
// ============================================================

function NeverDialog({ dialog, onClose, onSaved }: {
  dialog: PendingActionItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"this-type" | "everywhere">("this-type");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = dialog.action;
  const actionDesc = sanitizeForDisplay(action.description, "（动作描述含代码）", 160) || `${action.type ?? "动作"}`;

  const handleSave = async () => {
    if (!isElectronInternal) return;
    if (!reason.trim()) {
      setError("请告诉 Ovo 为什么不要这样——这是它学习的关键");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await window.ovoAPI.kg.addNegativePattern({
        actionType: scope === "this-type" ? (action.type as never) : undefined,
        patternText: reason.trim(),
        contextSignature: actionDesc
      });
      if (!r.ok) {
        setError(r.error ?? "写入失败");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "写入失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" danger showCloseButton={false}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--danger)]/15 text-[var(--danger)]">
            <ShieldOff size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              告诉 Ovo：永远不要这样
            </h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              Ovo 会记下这条禁忌，下次想做类似的事会先看一眼。
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 text-[12px]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">这次想做的事</p>
          <p className="text-[var(--text-primary)]">{actionDesc}</p>
        </div>

        <label className="mb-1 block text-[11px] font-medium text-[var(--text-primary)]">
          为什么不要这样？<span className="ml-1 text-[var(--text-muted)]">（必填，越具体越好）</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`例：\n· 不要替我自动回邮件，我喜欢自己写\n· 别在工作时间打开娱乐链接\n· 这种群消息不需要 todo`}
          rows={4}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-[var(--danger)]"
          autoFocus
        />

        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-[var(--text-primary)]">范围</p>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <input
                type="radio"
                checked={scope === "this-type"}
                onChange={() => setScope("this-type")}
                className="accent-[var(--danger)]"
              />
              只针对「{action.type ?? "这类"}」动作
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <input
                type="radio"
                checked={scope === "everywhere"}
                onChange={() => setScope("everywhere")}
                className="accent-[var(--danger)]"
              />
              对所有动作都适用（更严格）
            </label>
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--danger)]">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={saving || !reason.trim()}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--danger)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
            {saving ? "写入中…" : "教 Ovo 这条禁忌"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:border-[var(--text-muted)] disabled:opacity-50"
          >
            算了
          </button>
        </div>
    </Modal>
  );
}

interface ConfirmDialogProps {
  dialog: PendingActionItem;
  busy: boolean;
  error: TranslatedError | null;
  retryCount: number;
  retryBlockedUntil: number;
  showSlowHint: boolean;
  busyStartedAt: number;
  undoExpiresAt: number;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onNever: () => void;
  onUndo: () => void;
}

function ConfirmDialog({ dialog, busy, error, retryCount, retryBlockedUntil, showSlowHint, busyStartedAt, undoExpiresAt, onConfirm, onCancel, onClose, onRetry, onNever, onUndo }: ConfirmDialogProps) {
  // P1.27 / P1.26 / T10: 实时 tick 让倒计时显示流畅
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy && retryBlockedUntil <= Date.now() && undoExpiresAt <= Date.now()) return;
    const t = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(t);
  }, [busy, retryBlockedUntil, undoExpiresAt]);

  const now = Date.now();
  const retryWaitSec = Math.max(0, Math.ceil((retryBlockedUntil - now) / 1000));
  const elapsedSec = busyStartedAt > 0 ? Math.floor((now - busyStartedAt) / 1000) : 0;
  const retryExhausted = retryCount >= 4;
  // T10: 5 秒撤销窗口剩余时间 + 进度
  const undoRemainingMs = Math.max(0, undoExpiresAt - now);
  const inUndoWindow = undoRemainingMs > 0;
  const undoProgress = inUndoWindow ? undoRemainingMs / 5000 : 0;

  const params = dialog.action.params ?? {};
  const paramEntries = Object.entries(params);
  // PHIL-1: 玻璃管家三层叙述结构（看见 / 想做 / 因为）
  // action 自身只有 description + params；"看见"和"因为"目前从 action.description 拆，
  // 待主进程后续把 ctx (windowTitle / intent / observation) 附在 action:pending 事件里时可强化
  const wantTo = sanitizeForDisplay(dialog.action.description, "（动作描述含代码，已隐藏）", 200) || "执行一个动作";
  const reason = sanitizeForDisplay(dialog.action.reason, "", 200); // 如果 AgentAction 类型有 reason 字段则显示

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
              Ovo 想替你做这件事
            </h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              点头才会执行 · 拒绝就跳过 · 也可以告诉它"永远不要这样"
            </p>
          </div>
        </div>

        {/* PHIL-1: 三层叙述 — 想做 / 因为 */}
        <div className="mb-3 space-y-1.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 text-[12px]">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">想做</p>
            <p className="text-[var(--text-primary)]">{wantTo}</p>
          </div>
          {reason && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">因为</p>
              <p className="text-[var(--text-secondary)]">{reason}</p>
            </div>
          )}
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
                  <dt className="w-20 shrink-0 text-[var(--text-muted)]" title={k}>{paramLabel(k)}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--text-primary)]">
                    {formatParamValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* P1.27: 长 action 超时提示 */}
        {showSlowHint && busy && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3 text-[12px]">
            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-[var(--warning)]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--warning)]">还在处理…</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                已等 {elapsedSec} 秒。LLM 规划长动作有时会慢一点。如果不想等，点"取消"。
              </p>
            </div>
          </div>
        )}

        {/* 错误提示 —— translateError 后的「为什么 + 怎么办」+ P0.13 action 按钮 */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 text-[12px]">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--danger)]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--danger)]">{error.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-secondary)]">{error.detail}</p>
              {/* P0.13: 显示 errorTranslator 提供的"怎么办"按钮 */}
              {error.action && (
                <button
                  type="button"
                  onClick={() => {
                    const a = error.action!;
                    if (!isElectronInternal) return;
                    if (a.type === "open-permissions") {
                      const target = a.target === "screen" || a.target === "camera" || a.target === "microphone"
                        ? a.target : "screen";
                      void window.ovoAPI.permissions.openSettings({ target });
                    } else if (a.type === "open-settings") {
                      // 切到"设置" tab — 跨窗口通信靠 hash route
                      window.location.hash = "#console";
                    } else if (a.type === "external-link" && a.target) {
                      // 外部链接（罕见）— 用 ovoAPI 没暴露 shell.openExternal，先 console
                      console.info("open external:", a.target);
                    }
                  }}
                  className="mt-2 rounded-md border border-[var(--danger)]/40 px-2.5 py-1 text-[11px] text-[var(--danger)] hover:bg-[var(--danger)]/10"
                >
                  {error.action.label}
                </button>
              )}
              {error.raw && error.raw !== error.detail && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">技术细节</summary>
                  <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-muted)]">{error.raw}</p>
                </details>
              )}
            </div>
          </div>
        )}

        {/* 操作区：主次按钮分明 */}
        <div className="flex items-center gap-2">
          {error ? (
            retryExhausted ? (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[var(--text-secondary)]">
                  看起来一直失败了。先放一边，等环境恢复或换个时机再试。
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="self-start rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  先放一边
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy || retryWaitSec > 0}
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  {busy
                    ? "重试中…"
                    : retryWaitSec > 0
                    ? `${retryWaitSec}s 后可重试`
                    : retryCount > 0
                    ? `再试一次（第 ${retryCount + 1} 次）`
                    : "再试一次"}
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
            )
          ) : inUndoWindow ? (
            // T10 / P1.4: 5 秒撤销窗口 — Gmail 风格
            <div className="flex flex-1 items-center gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--accent)]">
                    {Math.ceil(undoRemainingMs / 1000)} 秒后执行
                  </span>
                  <span className="text-[var(--text-muted)]">点撤销可取消</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className="h-full bg-[var(--accent)] transition-[width]"
                    style={{ width: `${undoProgress * 100}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)]"
              >
                <Undo2 size={13} />
                撤销
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {busy
                  ? elapsedSec > 0
                    ? `执行中…（${elapsedSec}s）`
                    : "执行中…"
                  : "让它做"}
              </button>
              {/* P1.27: busy 时把"不要做"按钮换成"取消" */}
              {busy ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:border-[var(--danger)]/50 hover:text-[var(--danger)]"
                  title="取消正在进行的执行"
                >
                  取消
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--danger)]/50 hover:text-[var(--danger)]"
                    title="这次跳过，但下次还可以这样做"
                  >
                    不要做
                  </button>
                  <button
                    type="button"
                    onClick={onNever}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--danger)]/40 px-3 py-2 text-[12px] text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                    title="教 Ovo 永远不要这样做（写入禁忌）"
                  >
                    <ShieldOff size={11} />
                    永远不要这样
                  </button>
                </>
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="先放一边（保留在面板）"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatParamValue(v: unknown): string {
  if (v === null || v === undefined) return "无值";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
