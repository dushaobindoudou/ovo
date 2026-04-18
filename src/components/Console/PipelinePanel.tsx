import { usePipeline } from "../../hooks/usePipeline";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { PipelineDetail } from "./PipelineDetail";

export function PipelinePanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { items, refresh } = usePipeline();
  const active = items.find((item) => item.id === ctx?.selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pipeline 日志</h2>
        <div className="flex gap-2">
          <GlowButton onClick={() => void refresh()}>刷新</GlowButton>
          <GlowButton onClick={() => void window.nudgeAPI?.pipeline.clear().then(refresh)}>清空</GlowButton>
        </div>
      </div>

      {active ? (
        <Card title={`Pipeline 详情 — ${active.id}`} className="h-[70vh] overflow-auto">
          <PipelineDetail item={active} />
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">请在左侧列表选择一条 Pipeline 查看详情。</p>
        </Card>
      )}
    </div>
  );
}
