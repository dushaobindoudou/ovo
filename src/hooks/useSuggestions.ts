import { useEffect } from "react";
import { useSuggestionStore } from "../stores/suggestionStore";

export function useSuggestions() {
  const { suggestions, setSuggestions, removeSuggestion } = useSuggestionStore();

  useEffect(() => {
    const off = window.nudgeAPI.on("suggestion:new", (payload) => {
      if (Array.isArray(payload)) setSuggestions(payload);
    });
    return off;
  }, [setSuggestions]);

  return { suggestions, removeSuggestion };
}
