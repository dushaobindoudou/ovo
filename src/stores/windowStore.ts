import { create } from "zustand";

export interface WindowItem {
  windowId: string;
  appName: string;
  windowTitle: string;
  isActive?: boolean;
}

interface WindowState {
  windows: WindowItem[];
  active: WindowItem | null;
  setWindows: (items: WindowItem[]) => void;
  setActive: (item: WindowItem | null) => void;
}

export const useWindowStore = create<WindowState>((set) => ({
  windows: [],
  active: null,
  setWindows: (windows) => set({ windows }),
  setActive: (active) => set({ active })
}));
