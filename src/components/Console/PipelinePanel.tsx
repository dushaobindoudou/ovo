import { useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { usePipeline } from "../../hooks/usePipeline";
import { PipelineDetail } from "./PipelineDetail";

export function PipelinePanel() {
  const { items, refresh } = usePipeline();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((item) => item.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pipeline 日志</h2>
        <div className="flex gap-2">
          <GlowButton onClick={() => void refresh()}>刷新</GlowButton>
          <GlowButton onClick={() => void window.nudgeAPI.pipeline.clear().then(refresh)}>清空</GlowButton>
        </div>
      </div>
      <div className="grid grid-cols-[380px_1fr] gap-4">
        <Card title="链路列表" className="h-[70vh] overflow-auto">
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  activeId === item.id ? "border-[var(--border-active)] bg-[var(--accent-dim)]" : "border-white/10"
                }`}
              >
                <p>{item.id}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {new Date(item.timestamp).toLocaleTimeString()} · {item.status}
                </p>
              </button>
            ))}
          </div>
        </Card>
        <Card title="链路详情" className="h-[70vh] overflow-auto">
          {active ? <PipelineDetail item={active} /> : <p className="text-sm text-[var(--text-secondary)]">请选择一条 Pipeline。</p>}
        </Card>
      </div>
    </div>
  );
}
