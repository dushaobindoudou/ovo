import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { Input } from "../shared/Input";
import { GlowButton } from "../shared/GlowButton";
import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";

export function MemoryPanel() {
  const { searchEntities, analyzePersonality, getStats } = useKnowledgeGraph();
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [personality, setPersonality] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => {
    void (async () => {
      setStats(await getStats());
      setPersonality(await analyzePersonality());
      setEntities(await searchEntities(""));
    })();
  }, [analyzePersonality, getStats, searchEntities]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">记忆 & 知识图谱</h2>
      <div className="grid grid-cols-4 gap-3">
        <Card><p className="text-sm">实体 {stats?.entities ?? 0}</p></Card>
        <Card><p className="text-sm">关系 {stats?.relationships ?? 0}</p></Card>
        <Card><p className="text-sm">事件 {stats?.events ?? 0}</p></Card>
        <Card><p className="text-sm">Pipeline {stats?.pipelines ?? 0}</p></Card>
      </div>

      <Card title="实体检索">
        <div className="mb-3 flex items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索实体..." />
          <GlowButton onClick={() => void searchEntities(query).then(setEntities)}>搜索</GlowButton>
        </div>
        <div className="space-y-2 text-sm">
          {entities.map((entity) => (
            <div key={entity.name} className="rounded border border-white/10 px-3 py-2">
              <p>{entity.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{entity.type}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="人格画像">
        {personality ? (
          <div className="space-y-2 text-sm">
            <p>{personality.summary}</p>
            {personality.traits?.map((trait: any) => (
              <p key={trait.name} className="text-[var(--text-secondary)]">
                {trait.name}: {Math.round(trait.score * 100)}%（{trait.evidence}）
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">暂无数据</p>
        )}
      </Card>
    </div>
  );
}
