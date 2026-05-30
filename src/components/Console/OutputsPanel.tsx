/**
 * OutputsPanel —— "产出物"一级 tab。
 *
 * 用户反馈："Ovo 替我做的事我在哪看？提醒在哪？todo 在哪？"
 *
 * 设计原则：
 *   左：未来要发生的（macOS Reminders / Calendar 未来 48h 拉取）
 *   右：已经做完的（从 KG business_logs 拉 success 状态的 action 历史）
 *
 * 每条产出物有一个"去原 app 看"按钮（reminders→Reminders.app, email→Mail.app 等），
 * 完全跟 ActionDetailDrawer 的 VerifyAt 共享映射逻辑。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../shared/Card";
import { Bell, Calendar, FileText, ClipboardCopy, Mail, MessageSquare, Globe, Search as SearchIcon, Sparkles, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface FutureData {
  reminders: Array<{ name: string; dueAt?: string; listName?: string; completed: boolean }>;
  events: Array<{ title: string; startsAt: string; endsAt?: string; calendarName?: string; location?: string }>;
}

interface PastEntry {
  actionId: string;
  type: string;
  description: string;
  status: string;
  timestamp: number;
  pipelineId?: string;
  params?: Record<string, unknown>;
  output?: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Bell; openApp?: string }> = {
  log_note:          { label: "笔记",       icon: FileText },
  create_todo:       { label: "待办",       icon: Bell,           openApp: "Reminders" },
  set_reminder:      { label: "提醒",       icon: Bell,           openApp: "Reminders" },
  add_calendar:      { label: "日历",       icon: Calendar,       openApp: "Calendar" },
  copy_to_clipboard: { label: "已复制",     icon: ClipboardCopy },
  send_email:        { label: "邮件草稿",   icon: Mail,           openApp: "Mail" },
  send_imessage:     { label: "iMessage",   icon: MessageSquare,  openApp: "Messages" },
  open_url:          { label: "打开链接",   icon: Globe },
  search_web:        { label: "搜索",       icon: SearchIcon },
  summarize:         { label: "总结",       icon: Sparkles },
  other:             { label: "动作",       icon: Sparkles }
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) {
    // 未来时间
    const future = -diff;
    if (future < 60_000) return "马上";
    if (future < 3_600_000) return `${Math.floor(future / 60_000)} 分钟后`;
    if (future < 86_400_000) return `${Math.floor(future / 3_600_000)} 小时后`;
    return `${Math.floor(future / 86_400_000)} 天后`;
  }
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function formatTime(iso?: string | number): string {
  if (iso === undefined || iso === null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const isSameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (isSameDay) return `今天 ${hh}:${mm}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `明天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

async function openApp(name: string) {
  if (!isElectron) return;
  try {
    await window.ovoAPI.system.openApp({ app: name });
  } catch { /* ignore */ }
}

const ABANDON_KEY = "ovo.outputs.abandoned";
const ATTENTION_STATUSES = new Set(["failed", "timeout", "pending", "drafted"]);

/** 把 ActionResult.output / error 提炼成一句失败原因 */
function extractError(p: { output?: string }): string {
  if (!p.output) return "执行失败";
  try {
    const parsed = JSON.parse(p.output) as { error?: string; summary?: string };
    return (parsed.error || parsed.summary || "").slice(0, 200) || "执行失败";
  } catch {
    return p.output.slice(0, 200);
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    success:  { label: "已完成", cls: "border-[var(--success,#22c55e)]/40 text-[var(--success,#22c55e)]" },
    failed:   { label: "失败",   cls: "border-[var(--danger)]/40 text-[var(--danger)]" },
    timeout:  { label: "超时",   cls: "border-[var(--danger)]/40 text-[var(--danger)]" },
    pending:  { label: "待验收", cls: "border-[var(--accent)]/40 text-[var(--accent)]" },
    drafted:  { label: "待验收", cls: "border-[var(--accent)]/40 text-[var(--accent)]" },
    rejected: { label: "已放弃", cls: "border-[var(--border)] text-[var(--text-muted)]" }
  };
  const m = map[status] ?? { label: status, cls: "border-[var(--border)] text-[var(--text-muted)]" };
  return <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${m.cls}`}>{m.label}</span>;
}

interface OutputsPanelProps {
  ctx?: { requestOpenAction?: (actionId: string) => void };
}

export function OutputsPanel({ ctx }: OutputsPanelProps) {
  const { t } = useTranslation();
  const [future, setFuture] = useState<FutureData>({ reminders: [], events: [] });
  const [past, setPast] = useState<PastEntry[]>([]);
  const [loadingFuture, setLoadingFuture] = useState(true);
  const [loadingPast, setLoadingPast] = useState(true);
  const [futureError, setFutureError] = useState<string>("");
  type SchedRow = Awaited<ReturnType<typeof window.ovoAPI.kg.listScheduledActions>>[number];
  const [scheduled, setScheduled] = useState<SchedRow[]>([]);

  const loadScheduled = useMemo(() => async () => {
    if (!isElectron) return;
    try {
      const data = await window.ovoAPI.kg.listScheduledActions(50);
      setScheduled((data ?? []) as SchedRow[]);
    } catch {
      setScheduled([]);
    }
  }, []);

  const cancelScheduled = async (id: string) => {
    if (!isElectron) return;
    try {
      await window.ovoAPI.kg.cancelScheduledAction(id);
    } finally {
      void loadScheduled();
    }
  };

  const loadFuture = useMemo(() => async () => {
    if (!isElectron) return;
    setLoadingFuture(true);
    setFutureError("");
    try {
      const data = await window.ovoAPI.outputs.listFuture();
      setFuture(data ?? { reminders: [], events: [] });
    } catch (e) {
      setFutureError(e instanceof Error ? e.message : String(e));
      setFuture({ reminders: [], events: [] });
    } finally {
      setLoadingFuture(false);
    }
  }, []);

  const loadPast = useMemo(() => async () => {
    if (!isElectron) return;
    setLoadingPast(true);
    try {
      const data = await window.ovoAPI.outputs.listPast(60);
      setPast((data ?? []) as PastEntry[]);
    } finally {
      setLoadingPast(false);
    }
  }, []);

  useEffect(() => {
    void loadFuture();
    void loadPast();
    void loadScheduled();
    // 已发生的轮询 10s 刷新；未来的不轮询（osascript 慢），靠用户手动刷新
    const t = setInterval(() => { void loadPast(); void loadScheduled(); }, 10_000);
    return () => clearInterval(t);
  }, [loadFuture, loadPast, loadScheduled]);

  const pendingScheduled = useMemo(
    () => scheduled.filter((s) => s.status === "pending").sort((a, b) => a.fireAt - b.fireAt),
    [scheduled]
  );

  // P1-3 验收台：用户「放弃」的产出物（本地记住，不再出现在「需要你处理」）
  const [abandoned, setAbandoned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(ABANDON_KEY) || "[]") as string[]); }
    catch { return new Set(); }
  });
  const [retrying, setRetrying] = useState<string | null>(null);

  const abandon = (actionId: string) => {
    setAbandoned((prev) => {
      const next = new Set(prev).add(actionId);
      try { localStorage.setItem(ABANDON_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const retry = async (p: PastEntry) => {
    if (!isElectron) return;
    setRetrying(p.actionId);
    try {
      await window.ovoAPI.action.rerun({
        actionId: p.actionId, type: p.type, description: p.description, params: p.params
      });
    } finally {
      setRetrying(null);
      void loadPast();
    }
  };

  // 需要你处理（失败/待验收，排除已放弃） vs 已完成
  const needsAttention = useMemo(
    () => past.filter((p) => ATTENTION_STATUSES.has(p.status) && !abandoned.has(p.actionId)),
    [past, abandoned]
  );
  const donePast = useMemo(() => past.filter((p) => p.status === "success"), [past]);

  // 按类型分组「已完成」
  const groupedPast = useMemo(() => {
    const map = new Map<string, PastEntry[]>();
    for (const p of donePast) {
      const k = p.type || "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries()).map(([k, items]) => ({ type: k, items: items.slice(0, 10) }));
  }, [donePast]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ovo 的产出物</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            左侧：未来要发生 / 右侧：验收台——失败可重试或放弃，待验收的去对应 App 完成，已完成可看详情。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadFuture(); void loadPast(); void loadScheduled(); }}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

      {/* ───── Ovo 已安排到点执行（scheduled_actions）───── */}
      {pendingScheduled.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-1.5">
            <Clock size={13} className="text-[var(--accent)]" />
            <p className="text-sm font-semibold">Ovo 已安排到点执行（{pendingScheduled.length}）</p>
          </div>
          <p className="mb-2 text-[11px] text-[var(--text-muted)]">
            到点由 Ovo 自动执行。发送类（邮件 / iMessage）到点只会弹出待确认，不会自动发出。
          </p>
          <ul className="space-y-1">
            {pendingScheduled.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
              >
                <Clock size={12} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{sanitizeForDisplay(s.title, "（含代码）", 120)}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {formatTime(s.fireAt)}
                    {s.recurrence !== "none" ? ` · ${s.recurrence === "daily" ? "每天" : "每周"}` : ""}
                    {s.action?.type ? ` · ${s.action.type}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void cancelScheduled(s.id)}
                  className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--warning)] hover:text-[var(--warning)]"
                >
                  取消
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* ───── 左：未来要发生 ───── */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">未来要发生</p>
            <span className="text-[10px] text-[var(--text-muted)]">未来 48 小时</span>
          </div>
          {loadingFuture ? (
            <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">加载中…</p>
          ) : futureError ? (
            <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-2 text-[11px] text-[var(--text-secondary)]">
              <p>读取系统应用失败：{futureError}</p>
              <p className="mt-1 text-[var(--text-muted)]">可能需要授予 ovo 控制"提醒事项 / 日历"的权限。</p>
            </div>
          ) : future.reminders.length === 0 && future.events.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center">
              <p className="text-[12px] text-[var(--text-muted)]">未来 48 小时没有提醒和日程</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Ovo 帮你设的提醒和事件会出现在这里</p>
            </div>
          ) : (
            <div className="space-y-3">
              {future.reminders.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    提醒（{future.reminders.length}）
                  </p>
                  <ul className="space-y-1">
                    {future.reminders.map((r, i) => (
                      <li
                        key={`r-${i}`}
                        className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
                      >
                        <Bell size={12} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{sanitizeForDisplay(r.name, "（含代码）", 120)}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {formatTime(r.dueAt)} {r.listName ? `· ${r.listName}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void openApp("Reminders")}
                          className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                        >
                          <ExternalLink size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {future.events.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    日程（{future.events.length}）
                  </p>
                  <ul className="space-y-1">
                    {future.events.map((ev, i) => (
                      <li
                        key={`e-${i}`}
                        className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
                      >
                        <Calendar size={12} className="mt-0.5 shrink-0 text-[var(--secondary)]" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{sanitizeForDisplay(ev.title, "（含代码）", 120)}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {formatTime(ev.startsAt)}
                            {ev.endsAt ? ` - ${formatTime(ev.endsAt).split(" ").pop()}` : ""}
                            {ev.location ? ` · ${ev.location}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void openApp("Calendar")}
                          className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                        >
                          <ExternalLink size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ───── 右：验收台（需要你处理 + 已完成） ───── */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">验收台</p>
            <span className="text-[10px] text-[var(--text-muted)]">最近 60 条</span>
          </div>
          {loadingPast ? (
            <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">加载中…</p>
          ) : past.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center">
              <p className="text-[12px] text-[var(--text-muted)]">Ovo 还没替你做过事</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">用一会儿，它做过的每件事都会出现在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 需要你处理：失败（重试/放弃）+ 待验收（去对应 App 完成） */}
              {needsAttention.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--warning)]">
                    需要你处理（{needsAttention.length}）
                  </p>
                  <ul className="space-y-1">
                    {needsAttention.map((p) => {
                      const meta = TYPE_META[p.type] ?? TYPE_META.other;
                      const isFailed = p.status === "failed" || p.status === "timeout";
                      return (
                        <li
                          key={p.actionId}
                          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
                        >
                          <div className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 font-medium">
                              {sanitizeForDisplay(p.description, "（动作描述含代码）", 160)}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                          {isFailed ? (
                            <p className="mt-0.5 text-[10px] text-[var(--danger)]">
                              {sanitizeForDisplay(extractError(p), "（错误含代码）", 160)}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                              {meta.openApp ? `去 ${meta.openApp} 确认并完成` : "等待你确认"}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {isFailed && (
                              <button
                                type="button"
                                disabled={retrying === p.actionId}
                                onClick={() => void retry(p)}
                                className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                              >
                                {retrying === p.actionId ? "重试中…" : "重试"}
                              </button>
                            )}
                            {!isFailed && meta.openApp && (
                              <button
                                type="button"
                                onClick={() => void openApp(meta.openApp!)}
                                className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              >
                                去 {meta.openApp} <ExternalLink size={9} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => abandon(p.actionId)}
                              className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                            >
                              放弃
                            </button>
                            {ctx?.requestOpenAction && (
                              <button
                                type="button"
                                onClick={() => ctx.requestOpenAction!(p.actionId)}
                                className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                              >
                                详情
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 已完成：按类型分组，可跳原 App / 看详情 */}
              {groupedPast.map((g) => {
                const meta = TYPE_META[g.type] ?? TYPE_META.other;
                const Icon = meta.icon;
                return (
                  <div key={g.type}>
                    <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <Icon size={11} /> {t(`actionType.${g.type}`, meta.label)} ({g.items.length})
                      {meta.openApp && (
                        <button
                          type="button"
                          onClick={() => void openApp(meta.openApp!)}
                          className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                        >
                          去 {meta.openApp} <ExternalLink size={9} />
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {g.items.map((p) => (
                        <li
                          key={p.actionId}
                          className="group rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
                        >
                          <div className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 font-medium">
                              {sanitizeForDisplay(p.description, "（动作描述含代码）", 160)}
                            </span>
                            {ctx?.requestOpenAction && (
                              <button
                                type="button"
                                onClick={() => ctx.requestOpenAction!(p.actionId)}
                                className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent)] group-hover:opacity-100"
                              >
                                详情
                              </button>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {formatRelative(p.timestamp)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
