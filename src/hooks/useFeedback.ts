import { useCallback } from "react";

export function useFeedback() {
  const submitSuggestionFeedback = useCallback(
    (payload: {
      suggestionId: string;
      suggestionType: string;
      action: "accepted" | "rejected" | "ignored";
      personalityContext?: string;
      appContext?: string;
    }) => window.nudgeAPI.suggestion.feedback(payload),
    []
  );

  const ratePipelineStage = useCallback(
    (pipelineId: string, stage: string, rating: "good" | "bad") =>
      window.nudgeAPI.pipeline.rateStage({ pipelineId, stage, rating }),
    []
  );

  const ratePipelineOverall = useCallback(
    (pipelineId: string, rating: "good" | "neutral" | "bad") =>
      window.nudgeAPI.pipeline.rateOverall({ pipelineId, rating }),
    []
  );

  return { submitSuggestionFeedback, ratePipelineStage, ratePipelineOverall };
}
