import { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowStore } from "../../stores/windowStore";
import { usePipeline } from "../../hooks/usePipeline";
import { useAgentBridge } from "../../hooks/useAgentBridge";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import type { ConsolePage } from "./ConsoleSidebar";

export interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: { text: string; variant: "success" | "warning" | "danger" | "info" };
  timestamp?: number;
}

interface ListPanelProps {
  page: ConsolePage;
  onSelect: (id: string) => void;
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function ConsoleListPanel({ page, onSelect, selectedId, searchQuery, onSearchChange }: ListPanelProps) {
  const { windows } = useWindowStore();
  const { items: pipelineItems } = usePipeline();
  const [health] = useHealthCached();
  const { getStats, searchEntities } = useKnowledgeGraph();
  const [entities, setEntities] = useState<any[]>([]);
  const [memStats, setMemStats] = useState<any>(null);

  const stats = useStatsCache();

  // Load entities for memory list
  useEffect(() => {
    if (page !== "memory") return;
    void (async () => {
      setMemStats(await getStats().catch(() => null));
      setEntities(await searchEntities("").catch(() => []));
    })();
  }, [page, getStats, searchEntities]);

  // Load screenshot history
  useEffect(() => {
    if (page !== "screenshot") return;
    // Screenshot history requires main process tracking - placeholder for now
  }, [page]);

  const items: ListItem[] = useMemo(() => {
    switch (page) {
      case "status":
        return [
          { id: "health", title: "截屏健康状态", subtitle: health ? (health.ok ? "自检正常" : `异常: ${health.error ?? ""}`) : "未初始化", badge: health ? { text: health.ok ? "健康" : "异常", variant: health.ok ? "success" : "danger" as const } : undefined },
          { id: "agent", title: "Agent 引擎", subtitle: `后端: ${stats.backends.join(", ") || "无"}`, badge: { text: stats.backends.length > 0 ? "可用" : "不可用", variant: stats.backends.length > 0 ? "success" : "warning" as const } },
          { id: "graph", title: "知识图谱", subtitle: `实体 ${stats.entities} · 关系 ${stats.relationships} · 事件 ${stats.events}` },
          { id: "pipeline", title: "Pipeline", subtitle: `${stats.pipelines} 条记录` },
          { id: "error_log", title: "错误日志", subtitle: "主进程错误追踪", badge: { text: "新增", variant: "info" as const } },
        ];
      case "window":
        return windows.map((w) => ({
          id: w.windowId,
          title: w.appName,
          subtitle: w.windowTitle,
          badge: w.windowId === (useWindowStore.getState().active?.windowId) ? { text: "活动", variant: "success" as const } : undefined,
        }));
      case "memory": {
        if (entities.length === 0 && !memStats) {
          return [
            { id: "_loading", title: "加载中...", subtitle: "正在获取知识图谱数据" },
          ];
        }
        const items: ListItem[] = [
          { id: "_overview", title: "知识图谱概览", subtitle: memStats ? `实体 ${memStats.entities} · 关系 ${memStats.relationships} · 事件 ${memStats.events}` : "暂无数据" },
          { id: "_personality", title: "人格画像", subtitle: "基于行为模式的用户画像分析" },
        ];
        for (const e of entities.slice(0, 20)) {
          items.push({ id: e.name, title: e.name, subtitle: e.type });
        }
        return items;
      }
      case "pipeline":
        return pipelineItems.map((p) => ({
          id: p.id,
          title: p.id,
          subtitle: p.status,
          timestamp: p.timestamp,
          badge: { text: p.status, variant: p.status === "completed" ? "success" : p.status === "failed" ? "danger" : "info" } as ListItem["badge"],
        }));
      case "settings":
        return [
          { id: "appearance", title: "外观", subtitle: "主题与显示设置" },
          { id: "capture", title: "屏幕捕获", subtitle: "截屏间隔与自检" },
          { id: "backend", title: "Agent 后端", subtitle: "后端与 API 配置" },
          { id: "tts", title: "语音输出", subtitle: "TTS 设置" },
        ];
      case "agent":
        return [
          { id: "coding", title: "编码辅助", subtitle: "代码生成与审查" },
          { id: "learning", title: "学习场景", subtitle: "知识问答与解释" },
          { id: "debug", title: "调试场景", subtitle: "Bug 定位与修复" },
          { id: "creative", title: "创意场景", subtitle: "创意写作与头脑风暴" },
          { id: "ocr", title: "OCR 上下文", subtitle: "屏幕文字识别分析" },
        ];
      case "screenshot":
        return [];
      case "about":
        return [
          { id: "info", title: "关于 ovo", subtitle: "v0.1.0 · macOS Phase 1" },
        ];
      default:
        return [];
    }
  }, [page, windows, pipelineItems, stats, health, entities, memStats]);

  const filtered = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q) || (i.subtitle ?? "").toLowerCase().includes(q));
  }, [items, searchQuery]);

  const hasSearch = page !== "screenshot" && page !== "about";

  return (
    <div className="flex h-full w-[280px] flex-col border-r border-[var(--border)] bg-[var(--bg-content)]">
      {/* Header - 微信规范：内边距 12px (px-3 py-3) */}
      {hasSearch ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索..."
            className="flex-1 rounded-md bg-[var(--bg-input)] px-3 py-2 text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      ) : (
        <div className="border-b border-[var(--border)] px-3 py-3">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">{page === "screenshot" ? "截图测试" : "关于"}</p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && hasSearch ? (
          <div className="px-4 py-8 text-center text-[14px] text-[var(--text-muted)]">暂无数据</div>
        ) : null}
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`w-full border-b border-[var(--border-light)] px-3 py-3 text-left transition-colors ${
              selectedId === item.id ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="truncate text-[14px] font-medium leading-[1.5] text-[var(--text-primary)]">{item.title}</p>
              {item.badge && (
                <span
                  className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium leading-[1.5] ${
                    item.badge.variant === "success" ? "bg-[var(--accent-dim)] text-[var(--accent)]" :
                    item.badge.variant === "warning" ? "bg-[var(--warning)]/10 text-[var(--warning)]" :
                    item.badge.variant === "danger" ? "bg-[var(--danger)]/10 text-[var(--danger)]" :
                    "bg-[var(--info)]/10 text-[var(--info)]"
                  }`}
                >
                  {item.badge.text}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="mt-1 truncate text-[12px] leading-[1.5] text-[var(--text-secondary)]">{item.subtitle}</p>
            )}
            {item.timestamp && (
              <p className="mt-1 text-[12px] leading-[1.5] text-[var(--text-muted)]">{new Date(item.timestamp).toLocaleTimeString()}</p>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] px-3 py-2 text-center text-[12px] text-[var(--text-muted)]">
        {filtered.length} 项
      </div>
    </div>
  );
}

function useStatsCache() {
  const { detectBackends } = useAgentBridge();
  const [stats, setStats] = useState({ entities: 0, relationships: 0, events: 0, pipelines: 0, backends: [] as string[] });

  const refresh = useCallback(async () => {
    try {
      const b = await detectBackends();
      setStats((prev) => ({ ...prev, backends: b }));
    } catch { /* ignore */ }
    // For stats, just use initial zeros - real data comes from StatusPanel detail views
  }, [detectBackends]);

  useEffect(() => { void refresh(); }, [refresh]);
  return stats;
}

function useHealthCached() {
  const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    window.nudgeAPI.health.getLatest().then(setHealth).catch(() => setHealth(null));
  }, [isElectron]);
  return [health] as const;
}
