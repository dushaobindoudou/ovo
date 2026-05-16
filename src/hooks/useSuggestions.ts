import { useEffect } from "react";
import { useSuggestionStore } from "../stores/suggestionStore";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useSuggestions() {
  const { suggestions, setSuggestions, removeSuggestion } = useSuggestionStore();

  useEffect(() => {
    if (!isElectron) return;
    try {
      const off = window.ovoAPI.on("suggestion:new", (payload) => {
        if (Array.isArray(payload)) setSuggestions(payload);
      });
      return off;
    } catch {
      return;
    }
  }, [setSuggestions]);

  return { suggestions, removeSuggestion };
}
