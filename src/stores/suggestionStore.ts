import { create } from "zustand";

export interface SuggestionItem {
  id: string;
  type: string;
  title: string;
  content: string;
  priority: number;
}

interface SuggestionState {
  suggestions: SuggestionItem[];
  setSuggestions: (items: SuggestionItem[]) => void;
  removeSuggestion: (id: string) => void;
}

export const useSuggestionStore = create<SuggestionState>((set) => ({
  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),
  removeSuggestion: (id) =>
    set((state) => ({
      suggestions: state.suggestions.filter((item) => item.id !== id)
    }))
}));
