/**
 * 问题4：「ovo 做过的事」的人类可读时间线。
 * 与 ProcessPanel（技术回放）互补——只看 ovo 实际执行的动作，按时间分组。
 * Sprint 3A: 加「通知历史」子 tab + 点击行展开 action 详情抽屉。
 */
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCopy, FileText, ListTodo, Mail, MessageSquare, Bell, Calendar,
  Globe, Search, AppWindow, Folder, Sparkles, AlertCircle, CheckCircle2, Clock, XCircle,
  BellRing
} from "lucide-react";
import { ActionDetailDrawer } from "./ActionDetailDrawer";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface ActionRecord {
  id: string;
  timestamp: number;
  type: string;
  actionId: string;
  status: "success" | "failed" | "cancelled" | "timeout" | "pending";
  description: string;
  preview: string;
  error?: string;
  confirmedByUser: boolean;
  pipelineId?: string;
  appName?: string;
  windowTitle?: string;
}

const TYPE_META: Record<string, { label: string; Icon: typeof FileText }> = {
  log_note: { label: "记笔记", Icon: FileText },
  create_todo: { label: "建待办", Icon: ListTodo },
  copy_to_clipboard: { label: "复制", Icon: ClipboardCopy },
  send_email: { label: "邮件", Icon: Mail },
  send_imessage: { label: "iMessage", Icon: MessageSquare },
  set_reminder: { label: "提醒", Icon: Bell },
  add_calendar: { label: "日历", Icon: Calendar },
  open_url: { label: "打开网址", Icon: Globe },
  search_web: { label: "搜索", Icon: Search },
  open_app: { label: "打开应用", Icon: AppWindow },
  index_path: { label: "扫描目录", Icon: Folder },
  summarize: { label: "总结", Icon: Sparkles },
  other: { label: "动作", Icon: Sparkles }
};

function metaFor(type: string) {
  return TYPE_META[type] ?? TYPE_META.other;
}

function clockOf(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function groupKey(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return { key: "today", label: "今天" };
  if (diffDays === 1) return { key: "yesterday", label: "昨天" };
  if (diffDays < 7) return { key: `d${diffDays}`, label: `${diffDays} 天前` };
  return {
    key: `${d.getFullYear()}-${d.getMonth()}`,
    label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
  };
}

function StatusBadge({ status, confirmedByUser }: { status: ActionRecord["status"]; confirmedByUser: boolean }) {
  if (status === "success") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] text-[var(--accent)]"
        title={confirmedByUser ? "你确认后执行" : "自动执行"}
      >
        <CheckCircle2 size={10} />
        {confirmedByUser ? "已确认" : "自动"}
      </span>
    );
  }
  if (status === "failed" || status === "timeout") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[10px] text-[var(--danger)]">
        <XCircle size={10} />
        {status === "timeout" ? "超时" : "失败"}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-muted)]/15 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
        <XCircle size={10} />
        已取消
      </span>
    );
  }
  // pending
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] text-[var(--warning)]">
      <Clock size={10} />
      等确认
    </span>
  );
}

function ActionRow({ record }: { record: ActionRecord }) {
  const { Icon, label } = metaFor(record.type);
  const danger = record.status === "failed" || record.status === "timeout";
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--bg-card-hover)] rounded-md transition-colors">
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          danger ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-[var(--accent)]/10 text-[var(--accent)]"
        }`}
      >
        <Icon size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 font-medium">{label}</span>
          <span className="min-w-0 truncate text-[var(--text-secondary)]">{record.description}</span>
        </div>

        {record.preview && (
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]" title={record.preview}>
            {record.preview}
          </p>
        )}

        {record.error && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--danger)]">
            <AlertCircle size={10} />
            {record.error}
          </p>
        )}

        {(record.appName || record.windowTitle) && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
            来自 {record.appName}{record.windowTitle ? ` · ${record.windowTitle}` : ""}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-[var(--text-muted)]">
        <span>{clockOf(record.timestamp)}</span>
        <StatusBadge status={record.status} confirmedByUser={record.confirmedByUser} />
      </div>
    </div>
  );
}

interface NotificationRecord {
  id: string;
  timestamp: number;
  title: string;
  type: string;
  priority: number;
  tier: string;
  content: string;
}

type Stream = "actions" | "notifications";

interface ActionHistoryPanelProps {
  /** A: 外部（如 OverviewPanel 完成态卡片）请求打开某条 action 详情 */
  initialActionId?: string | null;
  /** 父级在我们打开 drawer 后清掉 pending state，避免重复触发 */
  onConsumeInitial?: () => void;
}

export function ActionHistoryPanel({ initialActionId, onConsumeInitial }: ActionHistoryPanelProps = {}) {
  const [stream, setStream] = useState<Stream>("actions");
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "pending" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // A: 外部跨 tab 请求打开特定 actionId
  useEffect(() => {
    if (initialActionId) {
      setStream("actions");
      setSelectedActionId(initialActionId);
      onConsumeInitial?.();
    }
  }, [initialActionId, onConsumeInitial]);

  useEffect(() => {
    if (!isElectron) return;
    const fetchActions = () => {
      void window.ovoAPI.history.listActions(150)
        .then((rows) => {
          setRecords((rows ?? []) as ActionRecord[]);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    const fetchNotifications = () => {
      void window.ovoAPI.history.listNotifications(150)
        .then((rows) => setNotifications((rows ?? []) as NotificationRecord[]))
        .catch(() => { /* ignore */ });
    };
    fetchActions();
    fetchNotifications();
    const t = setInterval(() => {
      fetchActions();
      fetchNotifications();
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return records;
    if (filter === "success") return records.filter((r) => r.status === "success");
    if (filter === "pending") return records.filter((r) => r.status === "pending");
    return records.filter((r) => r.status === "failed" || r.status === "timeout");
  }, [records, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: ActionRecord[] }>();
    for (const r of filtered) {
      const g = groupKey(r.timestamp);
      if (!map.has(g.key)) map.set(g.key, { label: g.label, items: [] });
      map.get(g.key)!.items.push(r);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [filtered]);

  const stats = useMemo(() => {
    let success = 0, pending = 0, failed = 0;
    for (const r of records) {
      if (r.status === "success") success += 1;
      else if (r.status === "pending") pending += 1;
      else if (r.status === "failed" || r.status === "timeout") failed += 1;
    }
    return { success, pending, failed, total: records.length };
  }, [records]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">ovo 做过的事</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            点击任意行查看详情：触发原因、执行参数、结果输出
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-[var(--bg-card)] p-1">
          <FilterChip label={`动作 ${records.length}`} active={stream === "actions"} onClick={() => setStream("actions")} />
          <FilterChip label={`通知 ${notifications.length}`} active={stream === "notifications"} onClick={() => setStream("notifications")} />
        </div>
      </div>

      {stream === "actions" ? (
        <>
          <div className="flex items-center gap-1 rounded-md bg-[var(--bg-card)] p-1 w-fit">
            <FilterChip label={`全部 ${stats.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label={`已完成 ${stats.success}`} active={filter === "success"} onClick={() => setFilter("success")} />
            <FilterChip label={`等确认 ${stats.pending}`} active={filter === "pending"} onClick={() => setFilter("pending")} />
            <FilterChip label={`异常 ${stats.failed}`} active={filter === "failed"} onClick={() => setFilter("failed")} />
          </div>

          {loading ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-10 text-center text-[12px] text-[var(--text-muted)]">
              加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">还没看到匹配的动作</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">用一会儿 ovo，它做过的每件事都会出现在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <section key={g.key} className="space-y-1">
                  <h3 className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {g.label} · {g.items.length} 件
                  </h3>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1">
                    {g.items.map((r, i) => (
                      <div key={r.id}>
                        {i > 0 && <div className="mx-3 h-px bg-[var(--border)]/50" />}
                        <button
                          type="button"
                          onClick={() => setSelectedActionId(r.actionId)}
                          className="block w-full text-left"
                        >
                          <ActionRow record={r} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <NotificationsStream notifications={notifications} />
      )}

      {selectedActionId && (
        <ActionDetailDrawer
          actionId={selectedActionId}
          onClose={() => setSelectedActionId(null)}
        />
      )}
    </div>
  );
}

function NotificationsStream({ notifications }: { notifications: NotificationRecord[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: NotificationRecord[] }>();
    for (const n of notifications) {
      const g = groupKey(n.timestamp);
      if (!map.has(g.key)) map.set(g.key, { label: g.label, items: [] });
      map.get(g.key)!.items.push(n);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [notifications]);

  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">还没收到任何通知</p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">ovo 弹的每条提示都会留底在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map((g) => (
        <section key={g.key} className="space-y-1">
          <h3 className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {g.label} · {g.items.length} 条
          </h3>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1">
            {g.items.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <div className="mx-3 h-px bg-[var(--border)]/50" />}
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      n.tier === "critical"
                        ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                        : n.tier === "important"
                          ? "bg-[var(--warning)]/10 text-[var(--warning)]"
                          : "bg-[var(--accent)]/10 text-[var(--accent)]"
                    }`}
                  >
                    <BellRing size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="shrink-0 font-medium">{n.title}</span>
                      <span className="rounded-full bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        {n.type || n.tier || "提示"}
                      </span>
                    </div>
                    {n.content && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--text-muted)]">{n.content}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-[10px] text-[var(--text-muted)]">{clockOf(n.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] transition-colors ${
        active
          ? "bg-[var(--bg-content)] font-medium text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}
