import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SuggestionItem {
  id: string;
  type: string;
  title: string;
  content: string;
  priority: number;
}

interface SuggestionState {
  suggestions: SuggestionItem[];
  /** P1.29: 已 dismiss 的建议 id — 持久化到 localStorage，刷新后保留 */
  dismissedIds: string[];
  setSuggestions: (items: SuggestionItem[]) => void;
  removeSuggestion: (id: string) => void;
  /** 标记 dismiss（持久化） */
  markDismissed: (id: string) => void;
  /** 撤销 dismiss（用户后悔了） */
  undismiss: (id: string) => void;
  /** 检查是否被 dismiss */
  isDismissed: (id: string) => boolean;
  /** 清空 dismissed 历史（设置里"重置"用） */
  clearDismissed: () => void;
}

export const useSuggestionStore = create<SuggestionState>()(
  persist(
    (set, get) => ({
      suggestions: [],
      dismissedIds: [],
      setSuggestions: (suggestions) => set({ suggestions }),
      removeSuggestion: (id) =>
        set((state) => ({
          suggestions: state.suggestions.filter((item) => item.id !== id)
        })),
      markDismissed: (id) =>
        set((state) => {
          if (state.dismissedIds.includes(id)) return state;
          // 上限 500 条，FIFO 防无限增长
          const next = [...state.dismissedIds, id];
          if (next.length > 500) next.splice(0, next.length - 500);
          return { dismissedIds: next };
        }),
      undismiss: (id) =>
        set((state) => ({
          dismissedIds: state.dismissedIds.filter((d) => d !== id)
        })),
      isDismissed: (id) => get().dismissedIds.includes(id),
      clearDismissed: () => set({ dismissedIds: [] })
    }),
    {
      name: "ovo-suggestions",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只持久化 dismissedIds — suggestions 是 live data 不应持久化
      partialize: (state) => ({ dismissedIds: state.dismissedIds })
    }
  )
);
