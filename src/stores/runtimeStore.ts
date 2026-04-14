import { create } from "zustand";

interface RuntimeState {
  isCapturing: boolean;
  activeWindow: string;
  backendStatus: string;
  setCapturing: (capturing: boolean) => void;
  setActiveWindow: (activeWindow: string) => void;
  setBackendStatus: (backendStatus: string) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  isCapturing: false,
  activeWindow: "",
  backendStatus: "未检测",
  setCapturing: (isCapturing) => set({ isCapturing }),
  setActiveWindow: (activeWindow) => set({ activeWindow }),
  setBackendStatus: (backendStatus) => set({ backendStatus })
}));
