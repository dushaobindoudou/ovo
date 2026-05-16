import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";

interface PipelineStageCardProps {
  stage: string;
  data: any;
  onRate: (rating: "good" | "bad") => void;
}

export function PipelineStageCard({ stage, data, onRate }: PipelineStageCardProps) {
  return (
    <Card title={stage}>
      <pre className="max-h-48 overflow-auto rounded bg-black/30 p-2 text-xs text-[var(--text-secondary)]">
        {JSON.stringify(data, null, 2)}
      </pre>
      <div className="mt-3 flex gap-2">
        <GlowButton onClick={() => onRate("good")}>好评</GlowButton>
        <GlowButton onClick={() => onRate("bad")}>差评</GlowButton>
      </div>
    </Card>
  );
}
