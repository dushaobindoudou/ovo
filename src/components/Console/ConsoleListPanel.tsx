import { useEffect, useMemo, useState } from "react";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { usePendingActions } from "../../hooks/usePendingActions";
import { useSuggestions } from "../../hooks/useSuggestions";
import { useSettingsStore } from "../../stores/settingsStore";
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
  const [health] = useHealthCached();
  const { getStats, searchEntities } = useKnowledgeGraph();
  const { pending } = usePendingActions();
  const { suggestions } = useSuggestions();
  const developerMode = useSettingsStore((s) => s.developerMode);
  const [entities, setEntities] = useState<any[]>([]);
  const [memStats, setMemStats] = useState<any>(null);

  // Load data for knowledge page
  useEffect(() => {
    if (page !== "knowledge") return;
    void (async () => {
      setMemStats(await getStats().catch(() => null));
      setEntities(await searchEntities("").catch(() => []));
    })();
  }, [page, getStats, searchEntities]);

  const items: ListItem[] = useMemo(() => {
    switch (page) {
      case "overview": {
        // UI-1: 概览左侧 list；用人话，给小白看
        return [
          { id: "_now", title: "现在", subtitle: "ovo 看到的我 · 觉得我接下来要做啥", badge: { text: "实时", variant: "info" as const } },
          {
            id: "_feed",
            title: "ovo 给我的建议",
            subtitle: `${pending.length} 等我确认 · ${suggestions.length} 条小提示`,
            badge: pending.length > 0 ? { text: String(pending.length), variant: "warning" as const } : undefined
          },
          { id: "_windows", title: "正在看的窗口", subtitle: "ovo 此刻能看到哪些窗口" },
          { id: "_health", title: "ovo 状态", subtitle: health ? (health.ok ? "运行正常" : `有点异常`) : "刚启动", badge: health ? { text: health.ok ? "健康" : "异常", variant: health.ok ? "success" : "danger" as const } : undefined },
        ];
      }
      case "knowledge": {
        if (entities.length === 0 && !memStats) {
          return [{ id: "_loading", title: "加载中...", subtitle: "正在获取知识图谱数据" }];
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
      case "process":
        return [
          { id: "_timeline", title: "完整流程", subtitle: "每次推断的 4 段进度", badge: { text: "实时", variant: "info" as const } }
        ];
      case "settings": {
        // F2: 简化 + 信任优先（敏感设置都汇总到隐私段）
        const base: ListItem[] = [
          { id: "appearance", title: "外观", subtitle: "主题与显示" },
          { id: "privacy", title: "隐私与暂停", subtitle: "暂停 / 应用黑名单 / 敏感过滤", badge: { text: "信任", variant: "success" as const } },
          { id: "screen_capture", title: "屏幕与捕获", subtitle: "权限、截屏间隔、后台监控" },
          { id: "ai_engine", title: "智能引擎", subtitle: "AI 模型 与 语音" },
          { id: "notification", title: "提醒级别", subtitle: "什么时候弹通知" },
          { id: "data_management", title: "数据管理", subtitle: "记忆清空/导出" },
          { id: "about", title: "关于 ovo", subtitle: "v0.1.0 · macOS" },
        ];
        const dev: ListItem[] = [
          { id: "prompt_eval", title: "Prompt 自评建议", subtitle: "ovo 每日自检", badge: { text: "DEV", variant: "info" as const } },
          { id: "logs_system", title: "系统日志", subtitle: "运行/错误日志", badge: { text: "DEV", variant: "info" as const } },
          { id: "logs_business", title: "业务日志", subtitle: "Pipeline 业务记录", badge: { text: "DEV", variant: "info" as const } },
        ];
        return developerMode ? [...base.slice(0, -1), ...dev, base[base.length - 1]] : base;
      }
      default:
        return [];
    }
  }, [page, health, entities, memStats, pending, suggestions, developerMode]);

  const filtered = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q) || (i.subtitle ?? "").toLowerCase().includes(q));
  }, [items, searchQuery]);

  const hasSearch = page === "knowledge";

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
          <p className="text-[14px] font-medium text-[var(--text-primary)]">
            {page === "overview" ? "状态" : page === "process" ? "流程" : page === "settings" ? "设置" : ""}
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && !hasSearch ? (
          <div className="px-4 py-8 text-center text-[14px] text-[var(--text-muted)]">暂无数据</div>
        ) : null}
        {filtered.map((item) => {
          const isHeader = item.id.endsWith("_header");
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => !isHeader && onSelect(item.id)}
              disabled={isHeader}
              className={`list-item-btn w-full border-l-[3px] px-3 py-3 text-left ${
                isHeader ? "cursor-default bg-[var(--bg-base)]" :
                selectedId === item.id
                  ? "border-l-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-l-transparent hover:bg-[var(--bg-card-hover)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`truncate text-[14px] font-medium leading-[1.5] ${isHeader ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{item.title}</p>
                {!isHeader && item.badge && (
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
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] px-3 py-2 text-center text-[12px] text-[var(--text-muted)]">
        {filtered.filter((i) => !i.id.endsWith("_header")).length} 项
      </div>
    </div>
  );
}

function useHealthCached() {
  const isElectron = typeof window !== "undefined" && !!window.ovoAPI;
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    window.ovoAPI.health.getLatest().then(setHealth).catch(() => setHealth(null));
  }, [isElectron]);
  return [health] as const;
}
