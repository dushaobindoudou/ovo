import { create } from "zustand";

export type AgentState = "idle" | "watching" | "thinking" | "executing";

interface RuntimeState {
  isCapturing: boolean;
  activeWindow: string;
  backendStatus: string;
  agentState: AgentState;
  setCapturing: (capturing: boolean) => void;
  setActiveWindow: (activeWindow: string) => void;
  setBackendStatus: (backendStatus: string) => void;
  setAgentState: (agentState: AgentState) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  isCapturing: false,
  activeWindow: "",
  backendStatus: "未检测",
  agentState: "idle",
  setCapturing: (isCapturing) => set({ isCapturing }),
  setActiveWindow: (activeWindow) => set({ activeWindow }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setAgentState: (agentState) => set({ agentState })
}));
