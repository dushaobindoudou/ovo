import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useFeedback() {
  const submitSuggestionFeedback = useCallback(
    (payload: {
      suggestionId: string;
      suggestionType: string;
      action: "accepted" | "rejected" | "ignored";
      personalityContext?: string;
      appContext?: string;
    }) => {
      if (!isElectron) return Promise.resolve({ ok: false });
      return window.ovoAPI.suggestion.feedback(payload);
    },
    []
  );

  const ratePipelineStage = useCallback(
    (pipelineId: string, stage: string, rating: "good" | "bad") => {
      if (!isElectron) return Promise.resolve({ ok: false });
      return window.ovoAPI.pipeline.rateStage({ pipelineId, stage, rating });
    },
    []
  );

  const ratePipelineOverall = useCallback(
    (pipelineId: string, rating: "good" | "neutral" | "bad") => {
      if (!isElectron) return Promise.resolve({ ok: false });
      return window.ovoAPI.pipeline.rateOverall({ pipelineId, rating });
    },
    []
  );

  return { submitSuggestionFeedback, ratePipelineStage, ratePipelineOverall };
}
