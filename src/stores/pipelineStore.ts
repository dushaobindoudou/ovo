import { create } from "zustand";

export interface PipelineItem {
  id: string;
  timestamp: number;
  status: "running" | "completed" | "failed";
  duration: number;
  stages: Record<string, unknown>;
  overallRating?: "good" | "neutral" | "bad";
}

interface PipelineState {
  items: PipelineItem[];
  setItems: (items: PipelineItem[]) => void;
  upsertItem: (item: PipelineItem) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  upsertItem: (item) =>
    set((state) => {
      const exists = state.items.find((it) => it.id === item.id);
      if (!exists) return { items: [item, ...state.items] };
      return {
        items: state.items.map((it) => (it.id === item.id ? item : it))
      };
    })
}));
