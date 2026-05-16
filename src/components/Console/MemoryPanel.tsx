import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, Trash2, Maximize2, Minimize2, Sparkles, X, Search, MoreHorizontal, Download } from "lucide-react";
import { Card } from "../shared/Card";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { KnowledgeGraphCanvas, type GraphNode, type GraphEdge } from "./KnowledgeGraphCanvas";

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description?: string;
  qualityScore?: number;
  pinned?: boolean;
  mentionCount?: number;
}

interface EntityDetail {
  entity: {
    id: string; name: string; type: string; description: string;
    attributes: Record<string, unknown>;
    mentionCount: number; importance: number;
    qualityScore: number; pinned: boolean;
    firstSeen: number; lastSeen: number; lastReferencedAt: number;
  } | null;
  relations: Array<{ direction: "out" | "in"; relation: string; otherId: string; otherName: string; otherType: string; strength: number; context: string }>;
  eventCount: number;
}

const TYPE_LABEL: Record<string, string> = {
  person: "人物",
  project: "项目",
  document: "文档",
  concept: "概念",
  organization: "组织",
  location: "地点",
  application: "应用",
  application_file: "文件",
  behavior_pattern: "行为模式",
  watchlist: "关注",
  interest_profile: "角色画像",
  learning_graph: "学习图",
  action_type: "动作",
  insight_summary: "洞察"
};

function formatRelative(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function MemoryPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const {
    searchEntities, analyzePersonality, getStats, getGraph, getEvents,
    clear, exportGraph, setPinned, deleteEntity, getEntityDetail
  } = useKnowledgeGraph();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [personality, setPersonality] = useState<{ summary?: string; traits?: PersonalityTraitDTO[] } | null>(null);
  const [stats, setStats] = useState<{ entities: number; relationships: number; events: number; pipelines: number } | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // 选中 entity（id 优先；name 兜底兼容旧 ctx.selectedId）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [entityEvents, setEntityEvents] = useState<Array<{ id: string; app_name: string; window_title?: string; timestamp: number; intent?: string; summary?: string }>>([]);

  const refresh = async () => {
    const [s, p, e, g] = await Promise.all([
      getStats(),
      analyzePersonality(),
      searchEntities(""),
      getGraph(120)
    ]);
    setStats(s as { entities: number; relationships: number; events: number; pipelines: number });
    setPersonality(p as { summary?: string; traits?: PersonalityTraitDTO[] });
    setEntities((e ?? []) as EntityRow[]);
    setGraph(g as { nodes: GraphNode[]; edges: GraphEdge[] });
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中变了 → 拉详情和最近事件
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEntityEvents([]);
      return;
    }
    void getEntityDetail(selectedId).then((d) => setDetail(d as EntityDetail | null));
    void getEvents({ entityId: selectedId, limit: 20 }).then((rows) => {
      setEntityEvents((rows ?? []) as Array<{ id: string; app_name: string; window_title?: string; timestamp: number; intent?: string; summary?: string }>);
    });
  }, [selectedId, getEntityDetail, getEvents]);

  // 兼容老 ctx.selectedId（按 name 找 id）
  useEffect(() => {
    if (!ctx?.selectedId || ctx.selectedId.startsWith("_")) return;
    const ent = entities.find((e) => e.name === ctx.selectedId);
    if (ent?.id && ent.id !== selectedId) setSelectedId(ent.id);
  }, [ctx?.selectedId, entities, selectedId]);

  const showPersonality = ctx?.selectedId === "_personality";

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    entities.forEach((e) => e.type && set.add(e.type));
    return Array.from(set);
  }, [entities]);


  const filteredEntities = useMemo(() => {
    let list = entities;
    if (typeFilter) list = list.filter((e) => e.type === typeFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        (e.type ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q)
      );
    }
    // 按 quality_score 降序，pinned 优先
    return [...list].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.qualityScore ?? 0.5) - (a.qualityScore ?? 0.5);
    });
  }, [entities, query, typeFilter]);

  // KG-E: 图谱视图层级
  //   1. 选中 entity → 1-hop 焦点视图（仅中心 + 直接邻居）
  //   2. 类型筛选 → 子图过滤（保留筛选语义）
  //   3. 搜索 → 不过滤，标记 highlighted
  //   4. 默认 → 全图
  const filteredGraph = useMemo<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
    // 1-hop focus 优先级最高
    if (selectedId) {
      const center = graph.nodes.find((n) => n.id === selectedId);
      if (center) {
        const neighborIds = new Set<string>([selectedId]);
        for (const e of graph.edges) {
          if (e.sourceId === selectedId) neighborIds.add(e.targetId);
          if (e.targetId === selectedId) neighborIds.add(e.sourceId);
        }
        return {
          nodes: graph.nodes.filter((n) => neighborIds.has(n.id)),
          edges: graph.edges.filter((e) => neighborIds.has(e.sourceId) && neighborIds.has(e.targetId))
        };
      }
    }

    // 类型筛选 → 真过滤
    let nodes = graph.nodes;
    let edges = graph.edges;
    if (typeFilter) {
      const ids = new Set(nodes.filter((n) => n.type === typeFilter).map((n) => n.id));
      nodes = nodes.filter((n) => ids.has(n.id));
      edges = edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId));
    }

    // 搜索 → 高亮，不过滤
    if (query) {
      const q = query.toLowerCase();
      nodes = nodes.map((n) => ({
        ...n,
        highlighted:
          n.name.toLowerCase().includes(q) ||
          (n.type ?? "").toLowerCase().includes(q)
      }));
    }

    return { nodes, edges };
  }, [graph, query, typeFilter, selectedId]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const data = await exportGraph();
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ovo-knowledge-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("确定要清空全部知识图谱（实体/关系/事件/Pipeline）吗？此操作不可撤销。")) return;
    setBusy(true);
    try {
      await clear();
      setSelectedId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handlePinToggle = async () => {
    if (!detail?.entity) return;
    await setPinned(detail.entity.id, !detail.entity.pinned);
    await refresh();
    void getEntityDetail(detail.entity.id).then((d) => setDetail(d as EntityDetail | null));
  };

  const handleDelete = async () => {
    if (!detail?.entity) return;
    if (!window.confirm(`确定要删除「${detail.entity.name}」及其 ${detail.relations.length} 条关系吗？`)) return;
    setBusy(true);
    try {
      await deleteEntity(detail.entity.id);
      setSelectedId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // R10: 「我的画像」聚合 —— 角色 / 兴趣 / 项目，给非技术用户一眼能看懂的概览
  // hooks 必须在所有 early return 之前
  const myProfile = useMemo(() => {
    const roles = entities.filter((e) => e.type === "interest_profile")
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 5);
    const interests = entities.filter((e) => e.type === "concept" && (e.pinned || (e.qualityScore ?? 0) >= 0.6))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 8);
    const projects = entities.filter((e) => e.type === "project")
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 5);
    return { roles, interests, projects };
  }, [entities]);

  // UI-S3: 显式 mode 切换 [图谱 | 列表]，默认 列表
  const [mode, setMode] = useState<"graph" | "list">("list");
  const showFullGraph = mode === "graph"; // 兼容下面已写好的代码

  // 高级工具菜单（导出/清空/清理/隐藏孤立/全屏 都收进去，避免吓退普通用户）
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const handle = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, [moreOpen]);

  if (showPersonality) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">人格画像</h2>
        <PersonalityDetail
          personality={personality}
          onChanged={async () => {
            setPersonality((await analyzePersonality()) as { summary?: string; traits?: PersonalityTraitDTO[] });
          }}
        />
      </div>
    );
  }

  // KG-E: 全屏 = 固定铺满整个 Electron 窗口；否则用满父容器（main 区已经 h-full）
  // 整体高度全程靠 flex 控制，不让任何子组件靠 max-h 兜底——杜绝"钉住后冒滚动条"
  const containerCls = fullscreen
    ? "fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--bg-content)]"
    : "flex h-full min-h-0 flex-col";

  return (
    <div className={containerCls}>
      {/* 顶部条 —— 干净，主操作（搜索/模式）显眼，工程师按钮进 ⋯ 菜单 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">记忆</h2>
          {stats && (
            <span className="text-[11px] text-[var(--text-muted)]">
              ovo 记住了 {stats.entities} 件事
            </span>
          )}
        </div>

        {/* mode 切换：用人话「概览 / 图谱」 */}
        <div className="ml-2 inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-0.5">
          <button
            type="button"
            onClick={() => setMode("list")}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              mode === "list"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            列表
          </button>
          <button
            type="button"
            onClick={() => setMode("graph")}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              mode === "graph"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            图谱
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜你想找的人 / 项目 / 主题"
              className="!pl-7"
            />
          </div>

          {/* ⋯ 高级菜单 */}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              title="更多"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                moreOpen
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              <MoreHorizontal size={14} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
                <MoreMenuItem
                  icon={fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  label={fullscreen ? "退出全屏" : "图谱全屏"}
                  hint="ESC 也可退出"
                  onClick={() => { setMoreOpen(false); setFullscreen(!fullscreen); }}
                />
                <div className="my-1 h-px bg-[var(--border)]" />
                <MoreMenuItem
                  icon={<Download size={13} />}
                  label="导出记忆"
                  hint="保存为本机 JSON"
                  onClick={() => { setMoreOpen(false); void handleExport(); }}
                  disabled={busy}
                />
                <MoreMenuItem
                  icon={<Trash2 size={13} />}
                  label="清空全部记忆"
                  hint="不可撤销，请慎用"
                  danger
                  onClick={() => { setMoreOpen(false); void handleClear(); }}
                  disabled={busy}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 类型筛选 chips */}
      {allTypes.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-[var(--border)] px-4 py-2">
          <button
            type="button"
            onClick={() => setTypeFilter("")}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              typeFilter === ""
                ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
            }`}
          >
            全部
          </button>
          {allTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                typeFilter === t
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
          {selectedId && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="ml-auto rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              title="退出 1-hop 焦点视图"
            >
              ← 看完整图谱
            </button>
          )}
        </div>
      )}

      {/* UI-S3: 列表 mode 时显示「我的画像」概览卡 + 完整实体列表
          R10+: 空状态也展示，引导用户耐心 + 解释机制 */}
      {mode === "list" && !fullscreen && (
        <div className="shrink-0 px-4 pt-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 flex items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                <Sparkles size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">ovo 对你的理解</p>
                <p className="text-[11px] text-[var(--text-muted)]">点任何一项告诉 ovo 这条对不对，会越来越准</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">扮演的角色</p>
                {myProfile.roles.length === 0 ? (
                  <p className="text-[var(--text-muted)]">还在学习中…</p>
                ) : (
                  <div className="space-y-1">
                    {myProfile.roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className="flex w-full items-center gap-1 rounded bg-[var(--bg-base)] px-2 py-1 text-left hover:bg-[var(--bg-card-hover)]"
                      >
                        {r.pinned && <Pin size={10} className="shrink-0 text-[var(--accent)]" />}
                        <span className="truncate font-medium">{r.name}</span>
                        {typeof r.qualityScore === "number" && (
                          <span className="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">{(r.qualityScore * 100).toFixed(0)}%</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">关心的主题</p>
                {myProfile.interests.length === 0 ? (
                  <p className="text-[var(--text-muted)]">还在学习中…</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {myProfile.interests.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setSelectedId(i.id)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                          i.pinned
                            ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                            : "border-[var(--border)] hover:border-[var(--accent)]"
                        }`}
                      >
                        {i.pinned && "★ "}{i.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">在做的项目</p>
                {myProfile.projects.length === 0 ? (
                  <p className="text-[var(--text-muted)]">还没识别到项目</p>
                ) : (
                  <div className="space-y-1">
                    {myProfile.projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="flex w-full items-center gap-1 rounded bg-[var(--bg-base)] px-2 py-1 text-left hover:bg-[var(--bg-card-hover)]"
                      >
                        {p.pinned && <Pin size={10} className="shrink-0 text-[var(--accent)]" />}
                        <span className="truncate font-medium">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UI-S3: 列表 mode = 显示完整实体列表（用 EntityListView，可选中查看详情） */}
      {mode === "list" && !fullscreen && (
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <aside className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <EntityListView
              entities={filteredEntities}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </aside>
          {selectedId && detail?.entity && (
            <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              <EntityDetailView
                detail={detail}
                events={entityEvents}
                busy={busy}
                onClose={() => setSelectedId(null)}
                onPinToggle={() => void handlePinToggle()}
                onDelete={() => void handleDelete()}
                onJump={(id) => setSelectedId(id)}
              />
            </aside>
          )}
        </div>
      )}

      {/* 图谱 mode */}
      {(showFullGraph || fullscreen) && (
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* 图谱区 —— flex-1 拉满 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          {filteredGraph.nodes.length === 0 ? (
            <p className="flex flex-1 items-center justify-center p-12 text-center text-sm text-[var(--text-secondary)]">
              {query || typeFilter ? "没有匹配的 entity" : "图谱还没数据，先用 ovo 观察一段时间"}
            </p>
          ) : (
            <KnowledgeGraphCanvas
              nodes={filteredGraph.nodes}
              edges={filteredGraph.edges}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              className="h-full min-h-0 flex-1"
            />
          )}
          {selectedId && (
            <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
              ★ 当前聚焦于 1-hop 邻居 · {filteredGraph.nodes.length} 节点 / {filteredGraph.edges.length} 关系
            </div>
          )}
        </div>

        {/* 右侧：选中时 = 富详情；未选中时 = 实体列表 */}
        <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          {selectedId && detail?.entity ? (
            <EntityDetailView
              detail={detail}
              events={entityEvents}
              busy={busy}
              onClose={() => setSelectedId(null)}
              onPinToggle={() => void handlePinToggle()}
              onDelete={() => void handleDelete()}
              onJump={(id) => setSelectedId(id)}
            />
          ) : (
            <EntityListView
              entities={filteredEntities}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

/* ──────────────────────── 实体列表视图（侧栏） ──────────────────────── */
function EntityListView({
  entities, selectedId, onSelect
}: {
  entities: EntityRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        实体列表 · {entities.length} 项 · 按质量排序
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entities.length === 0 ? (
          <p className="p-6 text-center text-xs text-[var(--text-muted)]">没有匹配的 entity</p>
        ) : (
          entities.slice(0, 200).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left transition-colors ${
                selectedId === e.id
                  ? "border-l-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-l-transparent hover:bg-[var(--bg-card-hover)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {e.pinned && <Pin size={10} className="shrink-0 text-[var(--accent)]" />}
                  <p className="truncate text-sm font-medium">{e.name}</p>
                </div>
                {e.description && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{e.description}</p>
                )}
              </div>
              <span className="shrink-0 rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                {TYPE_LABEL[e.type] ?? e.type}
              </span>
              {typeof e.qualityScore === "number" && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                  e.qualityScore >= 0.7 ? "bg-[var(--accent-dim)] text-[var(--accent)]" :
                  e.qualityScore >= 0.4 ? "bg-[var(--warning)]/10 text-[var(--warning)]" :
                  "bg-[var(--danger)]/10 text-[var(--danger)]"
                }`}>
                  {(e.qualityScore * 100).toFixed(0)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}

/* ──────────────────────── 实体富详情视图（侧栏） ──────────────────────── */
function EntityDetailView({
  detail, events, busy, onClose, onPinToggle, onDelete, onJump
}: {
  detail: EntityDetail;
  events: Array<{ id: string; app_name: string; window_title?: string; timestamp: number; intent?: string; summary?: string }>;
  busy: boolean;
  onClose: () => void;
  onPinToggle: () => void;
  onDelete: () => void;
  onJump: (id: string) => void;
}) {
  if (!detail.entity) return null;
  const e = detail.entity;
  // KG-E: 关系按方向 + relation 类型分组，让"实体 → 关系 → 关联实体"层次清晰
  const relGroups = new Map<string, typeof detail.relations>();
  for (const r of detail.relations) {
    const key = `${r.direction}::${r.relation}`;
    if (!relGroups.has(key)) relGroups.set(key, []);
    relGroups.get(key)!.push(r);
  }

  return (
    <>
      {/* 顶部身份卡 */}
      <div className="shrink-0 border-b border-[var(--border)] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight">{e.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-muted)]">
                {TYPE_LABEL[e.type] ?? e.type}
              </span>
              <span className={`rounded px-1.5 py-0.5 ${
                e.qualityScore >= 0.7 ? "bg-[var(--accent-dim)] text-[var(--accent)]" :
                e.qualityScore >= 0.4 ? "bg-[var(--warning)]/10 text-[var(--warning)]" :
                "bg-[var(--danger)]/10 text-[var(--danger)]"
              }`}>
                质量 {(e.qualityScore * 100).toFixed(0)}%
              </span>
              {e.pinned && <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-white">★ 已钉</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 内容区滚动（钉住操作只刷数据，不会让外面冒滚动条） */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        <div className="space-y-3">
          {/* 描述 */}
          {e.description && (
            <Section title="描述">
              <p className="text-[var(--text-secondary)]">{e.description}</p>
            </Section>
          )}

          {/* 元数据网格 */}
          <Section title="元数据">
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <Stat label="提及次数" value={String(e.mentionCount)} />
              <Stat label="重要度" value={`${e.importance}/10`} />
              <Stat label="首次见到" value={formatRelative(e.firstSeen)} />
              <Stat label="最近见到" value={formatRelative(e.lastSeen)} />
              <Stat label="证据事件" value={String(detail.eventCount)} />
              <Stat
                label="上次被采纳"
                value={e.lastReferencedAt ? formatRelative(e.lastReferencedAt) : "—"}
              />
            </div>
          </Section>

          {/* 关系网络（按 relation 类型分组）*/}
          {detail.relations.length > 0 && (
            <Section title={`关系网络 · ${detail.relations.length}`}>
              <div className="space-y-2">
                {Array.from(relGroups.entries()).map(([key, rels]) => {
                  const [dir, rel] = key.split("::");
                  return (
                    <div key={key} className="rounded bg-[var(--bg-base)] p-2">
                      <p className="mb-1 text-[10px] uppercase text-[var(--text-muted)]">
                        {dir === "out" ? "→" : "←"} {rel} · {rels.length}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {rels.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onJump(r.otherId)}
                            className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[11px] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            {r.otherName}
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              {TYPE_LABEL[r.otherType] ?? r.otherType}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 自定义 attributes */}
          {Object.keys(e.attributes).length > 0 && (
            <Section title="属性">
              <div className="space-y-0.5 font-mono text-[10px]">
                {Object.entries(e.attributes).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="shrink-0 text-[var(--text-muted)]">{k}</span>
                    <span className="truncate text-[var(--text-secondary)]">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 近期证据 */}
          {events.length > 0 && (
            <Section title={`近期证据 · ${events.length}`}>
              <div className="space-y-1">
                {events.slice(0, 8).map((evt) => (
                  <div key={evt.id} className="rounded bg-[var(--bg-base)] px-2 py-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span className="truncate">{evt.app_name}{evt.window_title ? ` · ${evt.window_title}` : ""}</span>
                      <span>{formatRelative(evt.timestamp)}</span>
                    </div>
                    {evt.intent && <p className="mt-0.5 text-[10px] text-[var(--accent)]">意图: {evt.intent}</p>}
                    {evt.summary && <p className="mt-0.5 line-clamp-3 text-[var(--text-secondary)]">{evt.summary}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <GlowButton className="!flex-1 !text-xs" onClick={onPinToggle} disabled={busy}>
            {e.pinned ? <><PinOff size={12} className="mr-1 inline" />取消钉住</> : <><Pin size={12} className="mr-1 inline" />钉住</>}
          </GlowButton>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/20"
          >
            <Trash2 size={12} className="mr-1 inline" />删除
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--bg-base)] px-2 py-1.5">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

/* ⋯ 菜单项：图标 + 主标题 + 灰色 hint + 危险样式 */
function MoreMenuItem({
  icon, label, hint, onClick, disabled, danger
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-[12.5px] transition-colors disabled:opacity-50 ${
        danger
          ? "text-[var(--danger)] hover:bg-[var(--danger)]/8"
          : "text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${danger ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-tight">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[10.5px] text-[var(--text-muted)]">{hint}</span>
        )}
      </span>
    </button>
  );
}

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface PersonalityEvidence {
  eventId?: string;
  appName?: string;
  snippet: string;
  timestamp: number;
}

interface PersonalityTraitDTO {
  name: string;
  score: number;
  evidence: string;
  evidenceSources?: PersonalityEvidence[];
}

function PersonalityDetail({
  personality,
  onChanged
}: {
  personality: { traits?: PersonalityTraitDTO[]; summary?: string } | null;
  onChanged: () => Promise<void>;
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number | undefined>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    void window.ovoAPI.prefs.getPersonalityOverrides().then((v) => setOverrides(v ?? {}));
  }, []);

  if (!personality) {
    return (
      <Card title="人格画像详情">
        <p className="text-sm text-[var(--text-secondary)]">暂无人格画像数据</p>
      </Card>
    );
  }

  const handleSave = async (traitName: string, value: number) => {
    if (!isElectron) return;
    setSaving(true);
    try {
      const next = { ...overrides, [traitName]: value };
      await window.ovoAPI.prefs.setPersonalityOverrides(next);
      setOverrides(next);
      setDraft({ ...draft, [traitName]: undefined });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (traitName: string) => {
    if (!isElectron) return;
    setSaving(true);
    try {
      const next = { ...overrides };
      delete next[traitName];
      await window.ovoAPI.prefs.setPersonalityOverrides(next);
      setOverrides(next);
      setDraft({ ...draft, [traitName]: undefined });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="人格画像详情">
      <div className="space-y-3 text-sm">
        <p className="text-base">{personality.summary}</p>
        {personality.traits?.map((trait) => {
          const overridden = overrides[trait.name] !== undefined;
          const draftValue = draft[trait.name];
          const sliderValue = draftValue ?? overrides[trait.name] ?? trait.score;
          return (
            <div key={`${trait.name}-detail`} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {trait.name}
                  {overridden && (
                    <span className="ml-2 rounded bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                      已手动覆盖
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-32 rounded-full bg-[var(--bg-base)]">
                    <div className="h-2.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(trait.score * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm font-semibold">{Math.round(trait.score * 100)}%</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">证据: {trait.evidence}</p>
              {trait.evidenceSources && trait.evidenceSources.length > 0 && (
                <div className="mt-2 space-y-1">
                  {trait.evidenceSources.map((src, i) => (
                    <div key={`${trait.name}-src-${i}`} className="rounded-md bg-[var(--bg-base)] px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between text-[var(--text-secondary)]">
                        <span>{src.appName ?? "未知应用"}</span>
                        <span>{new Date(src.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="mt-0.5 text-[var(--text-primary)]">{src.snippet || "(无摘要)"}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-2">
                <span className="text-xs text-[var(--text-secondary)]">手动调整:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sliderValue * 100)}
                  onChange={(e) => setDraft({ ...draft, [trait.name]: Number(e.target.value) / 100 })}
                  className="flex-1"
                />
                <span className="w-10 text-right text-xs">{Math.round(sliderValue * 100)}%</span>
                <GlowButton
                  className="!py-1 !text-[10px]"
                  disabled={saving || draftValue === undefined}
                  onClick={() => void handleSave(trait.name, draftValue ?? trait.score)}
                >
                  保存
                </GlowButton>
                {overridden && (
                  <button
                    type="button"
                    onClick={() => void handleReset(trait.name)}
                    disabled={saving}
                    className="rounded-md px-2 py-1 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    还原
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
