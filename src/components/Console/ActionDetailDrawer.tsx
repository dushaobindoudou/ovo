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
import { X, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import type { ActionDetail } from "../../types/ovo";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface Props {
  actionId: string;
  onClose: () => void;
}

/**
 * "去现场看"映射 — 用户反馈："我怎么知道笔记/todo/日历是否写上去了？"
 *
 * 当前是过渡方案：硬编码 action.type → 验证入口。下个版本计划改造为 builtin skill
 * 自己声明 verify target，本表会被 registry 替代。
 *
 * verifyAt: macOS stock app 名称（走 system:open-app 白名单）
 * verifyHint: 给用户的人话提示，告诉他打开后该看什么
 * verifyInternal: 在 Ovo 内部哪个 tab 能查到（log_note / summarize 走这条）
 */
const VERIFY_BY_TYPE: Record<string, {
  label: string;
  verifyAt?: string;
  verifyHint?: string;
  verifyInternal?: "memory-timeline";
}> = {
  create_todo:       { label: "去提醒事项查",   verifyAt: "Reminders",       verifyHint: "在提醒事项里看刚加的这一条" },
  set_reminder:      { label: "去提醒事项查",   verifyAt: "Reminders",       verifyHint: "在提醒事项里看是否有这条提醒" },
  add_calendar:      { label: "去日历查",       verifyAt: "Calendar",        verifyHint: "在日历里看是否新建了这个事件" },
  send_email:        { label: "去 Mail 草稿",   verifyAt: "Mail",            verifyHint: "Ovo 只写了 Mail 草稿，需要你在 Mail 应用确认后发送" },
  send_imessage:     { label: "去 Messages 查", verifyAt: "Messages",        verifyHint: "在 Messages 应用里查发出的消息" },
  log_note:          { label: "在时间线查看",   verifyInternal: "memory-timeline", verifyHint: "在记忆 → 时间线找 actor=Ovo 的笔记记录" },
  summarize:         { label: "在时间线查看",   verifyInternal: "memory-timeline", verifyHint: "总结被记到 Ovo 内部知识库" },
  copy_to_clipboard: { label: "按 Cmd+V 测试",  verifyHint: "已写入系统剪贴板，在任意输入框按 Cmd+V 验证" }
};

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
  // 反思 #2 新增状态：drafted / rejected 不是错误，是 Ovo 的"不主动"决策，用中性灰 + 友好文案
  if (status === "drafted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-muted)]/15 px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
        <Clock size={11} /> 草稿台
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-muted)]/15 px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
        <Clock size={11} /> 未执行
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
  if (v === null || v === undefined) return "无值";
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
              {detail.intent && <KV label="ovo 觉得你在" value={sanitizeForDisplay(detail.intent, "（涉及代码）", 120)} />}
              {detail.summary && <KV label="ovo 的总结" value={sanitizeForDisplay(detail.summary, "（含代码 / 配置，已隐藏）", 400)} multiline />}
              {detail.prediction && (
                <KV label="接下来可能" value={sanitizeForDisplay(detail.prediction, "（暂无明确预测）", 240)} multiline />
              )}
              {detail.ocrPreview && (
                <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    看屏幕原文（脱敏后 OCR 摘录）
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)]">{detail.ocrPreview}</pre>
                </details>
              )}
            </Section>

            {/* 因果链：同次推理的兄弟动作 + suggestions */}
            {(detail.siblingActions?.length || detail.siblingSuggestions?.length) ? (
              <Section title="同次推理 ovo 还想过">
                {detail.siblingActions?.length ? (
                  <div className="space-y-1">
                    <p className="text-[11px] text-[var(--text-muted)]">同批 {detail.siblingActions.length} 个其他动作：</p>
                    <ul className="space-y-1">
                      {detail.siblingActions.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-[12px]"
                        >
                          <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                            {TYPE_LABEL[s.type] ?? s.type}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{sanitizeForDisplay(s.description, "（含代码）", 120) || "—"}</span>
                          <span className="shrink-0">{statusBadge(s.status)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {detail.siblingSuggestions?.length ? (
                  <div className={`${detail.siblingActions?.length ? "mt-3" : ""} space-y-1`}>
                    <p className="text-[11px] text-[var(--text-muted)]">同次提的建议：</p>
                    <ul className="space-y-1">
                      {detail.siblingSuggestions.map((s, i) => (
                        <li key={`sg-${i}`} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-[12px]">
                          ▸ {sanitizeForDisplay(s.title, "（建议涉及代码）", 120)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Section>
            ) : null}

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
              {/* 反思 #2: drafted / rejected 用中性"未执行说明"，区别于 error 红框 */}
              {(detail.status === "drafted" || detail.status === "rejected") && (
                <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[11px] text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">
                    {detail.status === "drafted" ? "Ovo 准备了一版，没出手" : "Ovo 没出手"}
                  </p>
                  <p className="mt-1">
                    {detail.status === "drafted"
                      ? "屏幕证据不够明确，Ovo 把它放到了主面板的「草稿台」，等你来定。"
                      : "Ovo 自己也没把握，按「准确度优先」原则没执行，转成建议存在记忆里。"}
                  </p>
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

              {/* 用户反馈："我怎么知道结果真的写到系统里了？" → 去现场验证入口 */}
              <VerifyAtSection type={detail.type} />
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

/**
 * "去现场看"按钮 — 让用户能独立验证 action 真的去了它该去的地方。
 * 当前由 VERIFY_BY_TYPE 表硬编码；P0 skill 框架做出来后改由 skill 自己声明 verify target。
 */
function VerifyAtSection({ type }: { type?: string }) {
  const [status, setStatus] = useState<"idle" | "opening" | "ok" | "failed">("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const cfg = type ? VERIFY_BY_TYPE[type] : undefined;
  if (!cfg) return null;

  const handleOpen = async () => {
    if (!cfg.verifyAt || !isElectron) return;
    setStatus("opening");
    setErrMsg("");
    try {
      const res = await window.ovoAPI.system.openApp({ app: cfg.verifyAt });
      if (res?.ok) {
        setStatus("ok");
      } else {
        setStatus("failed");
        if (res?.error === "app-not-installed") {
          setErrMsg(`系统里没装"${cfg.verifyAt}"应用 — 这条记录只在 Ovo 内部留痕了`);
        } else {
          setErrMsg(`打开失败：${res?.error ?? "未知"}`);
        }
      }
    } catch (e) {
      setStatus("failed");
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mt-3 rounded-md border border-[var(--border)]/60 bg-[var(--bg-card)] p-2.5">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">想验证 Ovo 真的做了？</p>
      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{cfg.verifyHint ?? ""}</p>
      <div className="mt-2 flex items-center gap-2">
        {cfg.verifyAt ? (
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={status === "opening"}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-content)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            <ExternalLink size={11} />
            {status === "opening" ? "正在打开…" : cfg.label}
          </button>
        ) : cfg.verifyInternal === "memory-timeline" ? (
          <span className="text-[11px] text-[var(--text-muted)]">
            ▸ 切到「记忆 → 时间线」标签页找 actor 为 Ovo 的事件
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">▸ {cfg.label}</span>
        )}
      </div>
      {status === "ok" && cfg.verifyAt && (
        <p className="mt-1.5 text-[11px] text-[var(--accent)]">✓ 已切到 {cfg.verifyAt}，你应该能在那里看到</p>
      )}
      {status === "failed" && (
        <p className="mt-1.5 text-[11px] text-[var(--danger)]">⚠ {errMsg}</p>
      )}
    </div>
  );
}
