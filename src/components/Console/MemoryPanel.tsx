import { useEffect, useMemo, useState } from "react";
import { Card } from "../shared/Card";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";

export function MemoryPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { searchEntities, analyzePersonality, getStats } = useKnowledgeGraph();
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [personality, setPersonality] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => {
    void (async () => {
      setStats(await getStats());
      setPersonality(await analyzePersonality());
      const allEntities = await searchEntities("");
      setEntities(allEntities);
    })();
  }, [analyzePersonality, getStats, searchEntities]);

  const filteredEntities = useMemo(() => {
    if (!query) return entities;
    const q = query.toLowerCase();
    return entities.filter((e) => e.name.toLowerCase().includes(q) || (e.type ?? "").toLowerCase().includes(q));
  }, [entities, query]);

  const selectedEntity = filteredEntities.find((e) => e.name === ctx?.selectedId);
  const showOverview = ctx?.selectedId === "_overview";
  const showPersonality = ctx?.selectedId === "_personality";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">记忆 & 知识图谱</h2>

      {/* 概览卡片 */}
      {showOverview && stats && (
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <p className="text-3xl font-bold text-[var(--accent)]">{stats.entities}</p>
            <p className="text-xs text-[var(--text-secondary)]">实体总数</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-[var(--accent)]">{stats.relationships}</p>
            <p className="text-xs text-[var(--text-secondary)]">关系总数</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-[var(--secondary)]">{stats.events}</p>
            <p className="text-xs text-[var(--text-secondary)]">事件总数</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-[var(--secondary)]">{stats.pipelines}</p>
            <p className="text-xs text-[var(--text-secondary)]">Pipeline 数</p>
          </Card>
        </div>
      )}

      {showPersonality && (
        <Card title="人格画像详情">
          {personality ? (
            <div className="space-y-3 text-sm">
              <p className="text-base">{personality.summary}</p>
              {personality.traits?.map((trait: any) => (
                <div key={`${trait.name}-detail`} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{trait.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-32 rounded-full bg-[var(--bg-base)]">
                        <div className="h-2.5 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(trait.score * 100)}%` }} />
                      </div>
                      <span className="w-10 text-right text-sm font-semibold">{Math.round(trait.score * 100)}%</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">证据: {trait.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">暂无人格画像数据</p>
          )}
        </Card>
      )}
      {/* 统计卡片 - 默认视图显示 */}
      {!showOverview && !showPersonality && (
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.entities ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">实体</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--accent)]">{stats?.relationships ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">关系</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.events ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">事件</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold text-[var(--secondary)]">{stats?.pipelines ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">Pipeline</p>
          </Card>
        </div>
      )}

      {/* 实体检索 */}
      <Card title="实体检索">
        <div className="mb-3 flex items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索实体..." />
          <GlowButton onClick={() => void searchEntities(query).then(setEntities)}>搜索</GlowButton>
        </div>
        {selectedEntity && (
          <div className="mb-3 rounded-lg bg-[var(--accent-dim)] px-3 py-2">
            <p className="font-medium">{selectedEntity.name}</p>
            <p className="text-xs text-[var(--text-secondary)]">类型: {selectedEntity.type}</p>
          </div>
        )}
        <div className="space-y-1 text-sm max-h-[400px] overflow-y-auto">
          {filteredEntities.slice(0, 30).map((entity) => (
            <div key={entity.name} className={`rounded-lg border px-3 py-1.5 transition-colors ${
              entity.name === ctx?.selectedId
                ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                : "border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
            }`}>
              <p className="font-medium">{entity.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{entity.type}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 人格画像 - 默认视图显示 */}
      {!showPersonality && (
        <Card title="人格画像">
          {personality ? (
            <div className="space-y-2 text-sm">
              <p>{personality.summary}</p>
              {personality.traits?.map((trait: any) => (
                <div key={trait.name} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                  <span>{trait.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-[var(--bg-base)]">
                      <div className="h-2 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(trait.score * 100)}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs text-[var(--text-secondary)]">{Math.round(trait.score * 100)}%</span>
                  </div>
                </div>
              ))}
              {personality.traits?.map((trait: any) => (
                <p key={`${trait.name}-evidence`} className="text-xs text-[var(--text-muted)]">证据: {trait.evidence}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">暂无数据</p>
          )}
        </Card>
      )}
    </div>
  );
}
