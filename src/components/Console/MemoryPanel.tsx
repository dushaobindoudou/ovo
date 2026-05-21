import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, Trash2, Maximize2, Minimize2, Sparkles, X, Search, MoreHorizontal, Download, UserCircle } from "lucide-react";
import { Card } from "../shared/Card";
import { Empty } from "../shared/Empty";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { KnowledgeGraphCanvas, type GraphNode, type GraphEdge } from "./KnowledgeGraphCanvas";
import { MemoryTimelineView } from "./MemoryTimelineView";
import { BootstrapWizard } from "../Onboarding/BootstrapWizard";

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
  // F3: 画像页"告诉 Ovo 我是谁"手动触发的 wizard
  const [showWizardManual, setShowWizardManual] = useState(false);
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
  // 用户反馈："感兴趣的话题"出现 activity:xxx 这种内部聚合实体——必须排除
  // 排除规则：
  //   1. name 含 :: 分隔符（如 activity::keyword）—— 这是系统聚合实体
  //   2. attributes.isActivityRoot === true（kg.scene-role 自动建的）
  //   3. attributes.fromBootstrap 反向加分（用户主动声明的优先展示）
  const myProfile = useMemo(() => {
    const isAggregateEntity = (e: typeof entities[number]): boolean => {
      if (e.name && e.name.includes("::")) return true;
      const attrs = (e as { attributes?: Record<string, unknown> }).attributes;
      if (attrs && attrs.isActivityRoot === true) return true;
      return false;
    };
    const roles = entities
      .filter((e) => e.type === "interest_profile" && !isAggregateEntity(e))
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 5);
    const interests = entities
      .filter((e) => e.type === "concept" && !isAggregateEntity(e) && (e.pinned || (e.qualityScore ?? 0) >= 0.6))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 8);
    const projects = entities
      .filter((e) => e.type === "project" && !isAggregateEntity(e))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 5);
    return { roles, interests, projects };
  }, [entities]);

  // UI-S3: 显式 mode 切换 [图谱 | 列表]，默认 列表
  // U2 / 5W 产品改造：记忆主入口改为"时间线"（事件流），实体清单合并到"图谱"
  // - timeline: 默认 — 5W 事件流（什么时候·在什么应用·谁·做了什么）
  // - profile:  Ovo 对你的理解（角色 / 兴趣 / 项目 画像卡）
  // - graph:    图谱 + 实体清单（power user 用）
  const [mode, setMode] = useState<"timeline" | "profile" | "graph">("timeline");
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
      {/* F3: 用户在画像 tab 主动点"告诉 Ovo 我是谁" → 重开 BootstrapWizard */}
      {showWizardManual && <BootstrapWizard onClose={() => setShowWizardManual(false)} />}
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

        {/* U2 改造：3 视图 — 时间线（默认）/ 画像 / 图谱 */}
        <div className="ml-2 inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-0.5">
          {(["timeline", "profile", "graph"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                mode === m
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title={
                m === "timeline" ? "Ovo 按时间帮你记录的事 — 我做过什么 / 别人说了什么" :
                m === "profile" ? "Ovo 对你的理解 — 角色 / 关心的话题 / 项目" :
                "实体关系图谱（高级）— 概念之间怎么关联"
              }
            >
              {m === "timeline" ? "时间线" : m === "profile" ? "画像" : "图谱"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-52">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索人 / 项目 / 主题"
              className="!h-8 !py-1 !pl-7 !text-[13px]"
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

      {/* 类型筛选 chips —— 用户反馈："下面的筛选只对图谱有用"
          只在图谱视图渲染。时间线有自己的 actor/app/搜索 filter，画像视图根本不需要筛选。 */}
      {mode === "graph" && allTypes.length > 0 && (
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

      {/* U2 新增：时间线视图 — 用户产品诉求 "记忆 = 我做过什么事" */}
      {mode === "timeline" && !fullscreen && (
        <div className="flex min-h-0 flex-1 flex-col">
          <MemoryTimelineView />
        </div>
      )}

      {/* 画像视图：从原"列表 mode"拆出来 — 单独展示 Ovo 对你的理解 */}
      {mode === "profile" && !fullscreen && (
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
            {/* P1.18 / P0.6 修复：3 列网格 → 单列纵向"故事卡"（Granola 风格）
                每项显示：质量进度条 + 提及次数 + 钉住标记 + 第一人称叙事开头 */}
            <div className="space-y-3 text-xs">
              {/* 角色 — 通常 1-3 个，单卡显示，避免堆叠 */}
              {myProfile.roles.length > 0 && (
                <StorySection
                  title="Ovo 觉得你扮演这些角色"
                  emptyHint="还在学习中…"
                  items={myProfile.roles}
                  onSelect={setSelectedId}
                />
              )}
              {/* 兴趣 — 数量多，用 chip + 单列 */}
              {myProfile.interests.length > 0 && (
                <StorySection
                  title="你最常关心的话题"
                  emptyHint="还在学习中…"
                  items={myProfile.interests}
                  onSelect={setSelectedId}
                />
              )}
              {/* 项目 */}
              {myProfile.projects.length > 0 && (
                <StorySection
                  title="你正在投入的项目"
                  emptyHint="还没识别到项目"
                  items={myProfile.projects}
                  onSelect={setSelectedId}
                />
              )}
              {/* F3: 角色为空时单独引导填"我是谁"（不要等 3 项全空才提示） */}
              {myProfile.roles.length === 0 && (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-base)] p-3 text-center">
                  <p className="text-[12px] font-medium text-[var(--text-primary)]">Ovo 还不知道你是谁</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">告诉它你的角色 / 当前主项目 / 感兴趣的领域，它能更准</p>
                  <button
                    type="button"
                    onClick={() => setShowWizardManual(true)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)]"
                  >
                    告诉 Ovo 我是谁
                  </button>
                </div>
              )}
              {myProfile.roles.length === 0 && myProfile.interests.length === 0 && myProfile.projects.length === 0 && (
                <p className="text-center text-[var(--text-muted)]">Ovo 还在学习中——再用一会儿，它会更懂你。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* U2 重构：实体清单不再是独立"列表"主入口。
          - 时间线（timeline）已展示用户做过的事
          - 实体清单作为图谱视图的辅助 list（power user 用） — 见下面 graph mode */}

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
          {/* P0.6 / P2.9: Ovo 的主观表述 — 让用户感受到 Ovo 在"理解你"，不是数据库查询 */}
          <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">Ovo 认为</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-primary)]">
              {buildOvoSubjectiveLine(e)}
            </p>
          </div>
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

          {/* 自定义 attributes — 用户语言翻译 key + value，避免技术 "active:" "activity:" 文本 */}
          {(() => {
            const friendly = renderEntityAttributes(e.attributes);
            if (!friendly.length) return null;
            return (
              <Section title="特征">
                <div className="space-y-1 text-[11px]">
                  {friendly.map(({ label, value }, idx) => (
                    <div key={idx} className="flex items-baseline gap-2">
                      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
                      <span className="min-w-0 flex-1 break-words text-[var(--text-secondary)]">{value}</span>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })()}

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

/**
 * Bug 3 修复：entity.attributes 是 LLM 输出 + 内部 metadata 的混合，原始 key 像
 * "active" / "activity" / "fromBootstrap" 用户看不懂。翻译表 + 过滤无意义 key。
 */
const ATTR_KEY_LABELS: Record<string, string> = {
  active: "是否活跃",
  activity: "活动",
  activeTime: "活跃时段",
  inactive: "是否闲置",
  role: "角色",
  source: "来源",
  topic: "主题",
  project: "项目",
  status: "状态",
  fromBootstrap: "首次填写",
  importance: "重要度",
  category: "分类",
  level: "等级",
  lastSeenAppName: "最近出现在",
  path: "文件路径",
  ext: "文件类型",
  size: "大小",
  mtime: "修改时间",
  url: "链接",
  email: "邮箱"
};

const ATTR_VALUE_FORMATTERS: Record<string, (v: unknown) => string> = {
  active: (v) => (v ? "活跃" : "暂停"),
  inactive: (v) => (v ? "闲置" : "活跃"),
  fromBootstrap: (v) => (v ? "首次启动时填写" : "Ovo 观察推断"),
  size: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  },
  mtime: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return new Date(n).toLocaleString("zh-CN", { hour12: false });
  }
};

const ATTR_HIDDEN_KEYS = new Set([
  "noKgWrite", "auto", "reason"  // 内部 metadata，用户不需要看到
]);

function renderEntityAttributes(attrs: Record<string, unknown>): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === "") continue;
    if (ATTR_HIDDEN_KEYS.has(k)) continue;
    const label = ATTR_KEY_LABELS[k] ?? k;
    const formatter = ATTR_VALUE_FORMATTERS[k];
    let value: string;
    if (formatter) {
      value = formatter(v);
    } else if (typeof v === "string") {
      value = v;
    } else if (typeof v === "boolean") {
      value = v ? "是" : "否";
    } else if (typeof v === "number") {
      value = String(v);
    } else if (Array.isArray(v)) {
      value = v.map(String).join("、");
    } else {
      // 其他类型（object）保留 JSON 但限长
      try { value = JSON.stringify(v).slice(0, 200); } catch { value = String(v); }
    }
    if (value.length > 240) value = value.slice(0, 240) + "…";
    out.push({ label, value });
  }
  return out;
}

/**
 * P0.6 / P2.9: 把客观字段（type/mentionCount/qualityScore/lastSeen）翻成"Ovo 的视角"。
 * 让用户感受到 Ovo 在理解他，而不是被当成 SQL 行查询。
 */
function buildOvoSubjectiveLine(e: EntityDetail["entity"]): string {
  if (!e) return "";
  const TYPE_PERSPECTIVE: Record<string, string> = {
    person: "这是一个对你重要的人",
    project: "这是你正在投入的项目",
    concept: "你经常思考这个话题",
    application: "你经常使用的应用",
    company: "你关注的一家公司",
    place: "你关注的一个地方",
    event: "你提到过的一个事件",
    interest_profile: "这是你长期关注的兴趣方向",
    role_hypothesis: "Ovo 推测你正在扮演这个角色",
    application_file: "你最近接触的一份文件"
  };
  const head = TYPE_PERSPECTIVE[e.type] ?? "Ovo 在你工作里看到过这个";
  const quality = e.qualityScore >= 0.7 ? "印象很深"
    : e.qualityScore >= 0.4 ? "已经熟悉了"
    : "还在观察中";
  const mention = e.mentionCount >= 20 ? "（出现过非常多次）"
    : e.mentionCount >= 5 ? "（出现过几次）"
    : "（最近才注意到）";
  const pinned = e.pinned ? " · 你主动钉住了它" : "";
  return `${head}，${quality}${mention}${pinned}。`;
}

/**
 * P1.18 / P0.6: 单列故事卡（替代旧 3 列网格）
 * 每项显示 — 名字 + 提及次数 / 质量进度条 + 钉住 + 点击展开详情
 */
interface ProfileItem {
  id: string;
  name: string;
  pinned?: boolean;
  qualityScore?: number;
  mentionCount?: number;
  lastSeen?: number;
}
function StorySection({ title, items, onSelect }: {
  title: string;
  emptyHint?: string;  // 当前不用，调用方已过滤空数组
  items: ProfileItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2.5">
      <p className="mb-2 text-[11px] font-medium text-[var(--text-primary)]">{title}</p>
      <div className="space-y-1.5">
        {items.map((it) => {
          const quality = typeof it.qualityScore === "number" ? Math.round(it.qualityScore * 100) : null;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--bg-card-hover)]"
            >
              {it.pinned && <Pin size={10} className="shrink-0 text-[var(--accent)]" />}
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {/* 兜底：剥离 `activity::` / `app::` 等内部前缀，只显示纯名字 */}
                {(() => {
                  const idx = it.name.indexOf("::");
                  return idx > 0 ? it.name.slice(idx + 2) : it.name;
                })()}
              </span>
              {typeof it.mentionCount === "number" && it.mentionCount > 0 && (
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{it.mentionCount} 次</span>
              )}
              {quality !== null && (
                <span className="flex shrink-0 items-center gap-1">
                  <span className="h-1 w-12 overflow-hidden rounded-full bg-[var(--border)]">
                    <span
                      className="block h-full"
                      style={{
                        width: `${quality}%`,
                        background: quality >= 70 ? "var(--success)" : quality >= 40 ? "var(--warning)" : "var(--danger)"
                      }}
                    />
                  </span>
                  <span className="w-7 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{quality}%</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
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
        <Empty
          icon={UserCircle}
          title="还没有人格画像"
          hint="ovo 需要更多观察来理解你的偏好"
        />
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
