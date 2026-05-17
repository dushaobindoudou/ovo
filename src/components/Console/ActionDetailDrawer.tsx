/**
 * Sprint 3A · C: action 详情抽屉。
 *
 * 让用户能看到 ovo 对一个动作的全部上下文：
 *   - 触发原因（哪个应用 / 窗口 / 看到了什么 OCR 文本 / LLM 推断的意图）
 *   - 执行参数（params 字段化展示，不是 JSON dump）
 *   - 执行结果（status / output / error）
 *   - 完整 pipeline timeline（每个阶段耗时 + 状态）
 */
import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import type { ActionDetail } from "../../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface Props {
  actionId: string;
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  log_note: "记笔记",
  create_todo: "建待办",
  copy_to_clipboard: "复制到剪贴板",
  send_email: "发邮件",
  send_imessage: "发 iMessage",
  set_reminder: "设提醒",
  add_calendar: "加日历",
  open_url: "打开网址",
  open_app: "打开应用",
  search_web: "搜索",
  summarize: "总结",
  index_path: "扫描目录"
};

function statusBadge(status?: string) {
  if (!status) return null;
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--accent)]">
        <CheckCircle2 size={11} /> 成功
      </span>
    );
  }
  if (status === "failed" || status === "timeout") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] text-[var(--danger)]">
        <XCircle size={11} /> {status === "timeout" ? "超时" : "失败"}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)]/10 px-2 py-0.5 text-[11px] text-[var(--warning)]">
        <Clock size={11} /> 等确认
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
      {status}
    </span>
  );
}

function formatDateTime(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hh}:${mm}:${ss}`;
}

function formatParamValue(v: unknown): string {
  if (v === null || v === undefined) return "（空）";
  if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v, null, 0); } catch { return String(v); }
}

export function ActionDetailDrawer({ actionId, onClose }: Props) {
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isElectron) return;
    setLoading(true);
    let cancelled = false;
    void window.ovoAPI.action.getDetail(actionId)
      .then((d) => {
        if (cancelled) return;
        setDetail((d ?? null) as ActionDetail | null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    // 5 秒轮询，让 pending action 执行后 UI 自动刷新
    const t = setInterval(() => {
      void window.ovoAPI.action.getDetail(actionId).then((d) => {
        if (!cancelled) setDetail((d ?? null) as ActionDetail | null);
      }).catch(() => {});
    }, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [actionId]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-content)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">动作详情</p>
            <h2 className="mt-0.5 truncate text-[16px] font-semibold">
              {detail?.description || TYPE_LABEL[detail?.type ?? ""] || detail?.type || "动作"}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              {statusBadge(detail?.status)}
              {detail?.confirmedByUser && (
                <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] text-[var(--accent)]">已你确认</span>
              )}
              <span className="font-mono text-[10px]">{actionId.slice(0, 16)}…</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--text-muted)]">
            <Loader2 size={14} className="mr-2 animate-spin" />
            加载详情中…
          </div>
        ) : !detail || !detail.found ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[12px] text-[var(--text-muted)]">
            <AlertCircle size={20} />
            <p>没找到这个动作的执行记录</p>
            <p className="text-[11px]">动作可能还没被注册到 KG，或者已经被 retention 清掉了</p>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
            {/* 触发原因 */}
            <Section title="为什么 ovo 想做这个">
              <KV label="应用" value={detail.appName || "—"} />
              {detail.windowTitle && <KV label="窗口" value={detail.windowTitle} />}
              {detail.intent && <KV label="ovo 觉得你在" value={detail.intent} />}
              {detail.summary && <KV label="ovo 的总结" value={detail.summary} multiline />}
              {detail.ocrPreview && (
                <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    看屏幕原文（脱敏后 OCR 摘录）
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)]">{detail.ocrPreview}</pre>
                </details>
              )}
            </Section>

            {/* 执行参数 */}
            <Section title="ovo 准备的参数">
              {Object.keys(detail.params ?? {}).length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">无参数</p>
              ) : (
                <dl className="space-y-1.5">
                  {Object.entries(detail.params ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3 text-[12px]">
                      <dt className="w-24 shrink-0 text-[var(--text-muted)]">{k}</dt>
                      <dd className="min-w-0 flex-1 break-words text-[var(--text-primary)]">{formatParamValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            {/* 执行结果 */}
            <Section title="执行结果">
              <KV label="状态" value={
                <span className="inline-flex items-center gap-2">
                  {statusBadge(detail.status)}
                </span>
              } />
              <KV label="开始时间" value={formatDateTime(detail.startedAt)} />
              {detail.durationMs && detail.durationMs > 0 ? <KV label="耗时" value={`${detail.durationMs} ms`} /> : null}
              {detail.error && (
                <div className="mt-2 rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-2 text-[12px] text-[var(--danger)]">
                  <p className="font-medium">出错原因</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{detail.error}</p>
                </div>
              )}
              {detail.output && (
                <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    完整输出
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)]">{detail.output}</pre>
                </details>
              )}
            </Section>

            {/* Pipeline 时间线 */}
            {detail.timeline && detail.timeline.length > 0 && (
              <Section title="完整 pipeline 时间线">
                <p className="mb-2 text-[11px] text-[var(--text-muted)]">
                  pipeline {detail.pipelineId?.slice(-8)} · 始于 {formatDateTime(detail.pipelineStartedAt)}
                </p>
                <ul className="space-y-1">
                  {detail.timeline.map((t, i) => (
                    <li key={`${t.node}-${i}`} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-[11px]">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{i + 1}.</span>
                      <span className="font-medium">{t.node}</span>
                      <span className="ml-auto flex items-center gap-2 text-[var(--text-muted)]">
                        <span>{t.durationMs}ms</span>
                        {statusBadge(t.status === "success" ? "success" : t.status === "failed" ? "failed" : t.status)}
                      </span>
                      {t.error && (
                        <span className="block w-full text-[var(--danger)]">↳ {t.error.slice(0, 120)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function KV({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div className={`flex ${multiline ? "flex-col" : "items-start"} gap-2 text-[12px]`}>
      <span className="w-24 shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
