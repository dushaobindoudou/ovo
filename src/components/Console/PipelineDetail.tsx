import { PipelineStageCard } from "./PipelineStageCard";
import { useFeedback } from "../../hooks/useFeedback";
import { GlowButton } from "../shared/GlowButton";

interface PipelineDetailProps {
  item: any;
}

export function PipelineDetail({ item }: PipelineDetailProps) {
  const { ratePipelineStage, ratePipelineOverall } = useFeedback();
  const stages = Object.entries(item?.stages ?? {});
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Pipeline #{item.id}</h4>
        <div className="flex gap-2">
          <GlowButton onClick={() => void ratePipelineOverall(item.id, "good")}>整体 👍</GlowButton>
          <GlowButton onClick={() => void ratePipelineOverall(item.id, "neutral")}>整体 😐</GlowButton>
          <GlowButton onClick={() => void ratePipelineOverall(item.id, "bad")}>整体 👎</GlowButton>
        </div>
      </div>
      {stages.map(([stage, data]) => (
        <PipelineStageCard
          key={stage}
          stage={stage}
          data={data}
          onRate={(rating) => void ratePipelineStage(item.id, stage, rating)}
        />
      ))}
    </div>
  );
}
