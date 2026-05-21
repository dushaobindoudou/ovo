/**
 * U2 / 5W 时间线视图 — 用户产品诉求：「记忆 = 我做过什么事」
 *
 * 替代旧的"列表 = 实体清单"模式（实体不是记忆，是 Ovo 内部抽象的副产品）。
 * 时间线展示 memory_events 表，按天分组，每条事件显示 5W：
 *   - When: 时间（相对 / 绝对）
 *   - Where: 应用 + 窗口标题
 *   - Who: actor (self/other/system/ovo) + actor_name
 *   - What: summary（LLM 摘要的人话总结）
 *   - Why: intent（可选展开）
 *
 * 对标：苹果 Journal / 微信"我的"页 — 用户自己的时间线，自己易读。
 */
import { useEffect, useState, useMemo } from "react";
import { User, MessageCircle, Cog, Bot, HelpCircle, Search, ChevronRight, Clock, type LucideIcon } from "lucide-react";
import { Empty } from "../shared/Empty";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

type Actor = "self" | "other" | "system" | "ovo" | "unknown";

interface MemoryEvent {
  id: string;
  timestamp: number;
  appName: string;
  windowTitle: string;
  content: string;
  summary: string;
  intent: string;
  importance: number;
  sourceWindowId: string;
  actor?: Actor | null;
  actorName?: string | null;
}

const ACTOR_META: Record<Actor, { icon: LucideIcon; label: string; color: string; bg: string }> = {
  self:    { icon: User,          label: "我",       color: "var(--accent)",        bg: "var(--accent-dim)" },
  other:   { icon: MessageCircle, label: "别人",     color: "var(--state-thinking)", bg: "rgba(88,86,214,0.1)" },
  system:  { icon: Cog,           label: "系统",     color: "var(--text-muted)",    bg: "var(--bg-base)" },
  ovo:     { icon: Bot,           label: "Ovo",      color: "var(--warning)",       bg: "rgba(255,149,0,0.08)" },
  unknown: { icon: HelpCircle,    label: "未确定",   color: "var(--text-muted)",    bg: "var(--bg-base)" }
};

function getActorMeta(a: Actor | null | undefined) {
  return ACTOR_META[a ?? "unknown"] ?? ACTOR_META.unknown;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function dayGroupKey(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) return { key: "today", label: "今天" };
  if (eventDay.getTime() === yesterday.getTime()) return { key: "yesterday", label: "昨天" };

  const diffDays = Math.floor((today.getTime() - eventDay.getTime()) / 86_400_000);
  if (diffDays < 7) return { key: `d${diffDays}`, label: `${diffDays} 天前` };

  return {
    key: `${d.getFullYear()}-${d.getMonth() + 1}`,
    label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
  };
}

export function MemoryTimelineView() {
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorFilter, setActorFilter] = useState<Actor | "all">("all");
  const [appFilter, setAppFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron) { setLoading(false); return; }
    const fetchEvents = () => {
      void window.ovoAPI.kg.getRecentEvents(200)
        .then((rows) => {
          setEvents(rows ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchEvents();
    const t = setInterval(fetchEvents, 15_000);
    return () => clearInterval(t);
  }, []);

  // app 过滤选项
  const allApps = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => e.appName && set.add(e.appName));
    return Array.from(set).slice(0, 8);
  }, [events]);

  // actor 统计
  const actorCounts = useMemo(() => {
    const counts: Record<string, number> = { all: events.length, self: 0, other: 0, system: 0, ovo: 0, unknown: 0 };
    events.forEach((e) => {
      const a = e.actor ?? "unknown";
      counts[a] = (counts[a] ?? 0) + 1;
    });
    return counts;
  }, [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (actorFilter !== "all") {
      list = list.filter((e) => (e.actor ?? "unknown") === actorFilter);
    }
    if (appFilter) list = list.filter((e) => e.appName === appFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        (e.summary ?? "").toLowerCase().includes(q) ||
        (e.windowTitle ?? "").toLowerCase().includes(q) ||
        (e.appName ?? "").toLowerCase().includes(q) ||
        (e.actorName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, actorFilter, appFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MemoryEvent[] }>();
    for (const e of filtered) {
      const { key, label } = dayGroupKey(e.timestamp);
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.values());
  }, [filtered]);

  if (loading) {
    return <Empty title="正在加载记忆…" hint="" icon={Clock} />;
  }

  if (events.length === 0) {
    return (
      <Empty
        icon={Clock}
        title="还没有记忆"
        hint={<>Ovo 观察一段时间后，这里会按时间倒序展示<br />你做过的事、看过的内容、谁找过你</>}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部筛选条：actor / app / 搜索 */}
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {/* actor chip — 这是 5W 时间线的核心区分维度 */}
          {(["all", "self", "other", "system", "ovo"] as const).map((a) => {
            const meta = a === "all"
              ? { icon: Clock, label: "全部", color: "var(--accent)", bg: "var(--accent-dim)" }
              : getActorMeta(a as Actor);
            const Icon = meta.icon;
            const count = actorCounts[a] ?? 0;
            const active = actorFilter === a;
            if (a !== "all" && count === 0) return null; // 没数据的 actor 不显示 chip
            return (
              <button
                key={a}
                type="button"
                onClick={() => setActorFilter(a)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <Icon size={11} />
                <span>{meta.label}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索摘要 / 应用 / 谁"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] py-1 pl-7 pr-2 text-[11px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          {allApps.length > 0 && (
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-[11px]"
            >
              <option value="">全部应用</option>
              {allApps.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 时间线主体 — 按天分组 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {grouped.length === 0 ? (
          <Empty compact icon={Search} title="没有匹配的记忆" hint="试试清空筛选" />
        ) : (
          grouped.map((g) => (
            <section key={g.label} className="mb-4">
              <h4 className="sticky top-0 z-[1] mb-2 bg-[var(--bg-content)]/95 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] backdrop-blur">
                {g.label}
              </h4>
              <ol className="space-y-1.5">
                {g.items.map((e) => {
                  const actor = (e.actor ?? "unknown") as Actor;
                  const meta = getActorMeta(actor);
                  const ActorIcon = meta.icon;
                  const isExpanded = expandedId === e.id;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}
                        className="group flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left hover:border-[var(--accent)]/40"
                      >
                        {/* actor 头像 — 5W "谁" */}
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: meta.bg, color: meta.color }}
                          title={`${meta.label}${e.actorName ? `（${e.actorName}）` : ""}`}
                        >
                          <ActorIcon size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          {/* 标题行：summary（什么）+ 时间（什么时候） */}
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
                              {sanitizeForDisplay(e.summary || e.intent, "（摘要含代码，已隐藏）", 200) || "(无摘要)"}
                            </p>
                            <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                              {formatTime(e.timestamp)}
                            </span>
                          </div>
                          {/* 副标题：app + windowTitle + actor_name（在哪里 + 谁） */}
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                            <span className="font-medium">{e.appName || "未知应用"}</span>
                            {e.windowTitle && (
                              <>
                                <span>·</span>
                                <span className="truncate">{e.windowTitle}</span>
                              </>
                            )}
                            {e.actorName && actor === "other" && (
                              <>
                                <span>·</span>
                                <span className="text-[var(--state-thinking)]">{e.actorName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          size={12}
                          className={`mt-1 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </button>
                      {isExpanded && (
                        <div className="ml-9 mt-1 rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2.5 text-[11px]">
                          {e.intent && e.intent !== "unknown" && (
                            <div className="mb-1.5">
                              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">为什么</p>
                              <p className="text-[var(--text-secondary)]">{sanitizeForDisplay(e.intent, "（含代码）", 120)}</p>
                            </div>
                          )}
                          {e.content && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">看到的内容</p>
                              <p className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                                {sanitizeForDisplay(e.content, "（事件内容含代码 / 配置，已隐藏）", 600)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
