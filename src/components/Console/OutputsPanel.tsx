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
import { Bell, Calendar, FileText, ClipboardCopy, Mail, MessageSquare, Globe, Search as SearchIcon, Sparkles, ExternalLink, RefreshCw } from "lucide-react";
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

function formatTime(iso?: string): string {
  if (!iso) return "—";
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

export function OutputsPanel() {
  const { t } = useTranslation();
  const [future, setFuture] = useState<FutureData>({ reminders: [], events: [] });
  const [past, setPast] = useState<PastEntry[]>([]);
  const [loadingFuture, setLoadingFuture] = useState(true);
  const [loadingPast, setLoadingPast] = useState(true);
  const [futureError, setFutureError] = useState<string>("");

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
    // 已发生的轮询 10s 刷新；未来的不轮询（osascript 慢），靠用户手动刷新
    const t = setInterval(() => { void loadPast(); }, 10_000);
    return () => clearInterval(t);
  }, [loadFuture, loadPast]);

  // 按类型分组 past
  const groupedPast = useMemo(() => {
    const map = new Map<string, PastEntry[]>();
    for (const p of past) {
      const k = p.type || "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries()).map(([k, items]) => ({ type: k, items: items.slice(0, 10) }));
  }, [past]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ovo 的产出物</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            左侧：未来要发生的 / 右侧：已经做完的。点任意 [去看] 跳到对应系统应用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadFuture(); void loadPast(); }}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

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

        {/* ───── 右：已经做完 ───── */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">已经做完</p>
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
            <div className="space-y-3">
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
                          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
                        >
                          <p className="font-medium">{sanitizeForDisplay(p.description, "（动作描述含代码）", 160)}</p>
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
