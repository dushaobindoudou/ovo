import { useEffect, useState } from "react";
import type { AgentInsightsPayload } from "../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

const HISTORY_LIMIT = 10;

/**
 * Q1+Q4: 订阅每轮 pipeline 输出的角色推断 + 长期意图 + offers。
 * 保留最近 N 轮历史，最新一轮放第 0 项；UI 默认展示最新。
 */
export function useInsights() {
  const [history, setHistory] = useState<AgentInsightsPayload[]>([]);

  useEffect(() => {
    if (!isElectron) return;
    const off = window.ovoAPI.on("agent:insights", (payload) => {
      if (!payload) return;
      setHistory((prev) => {
        const next = [payload, ...prev];
        return next.slice(0, HISTORY_LIMIT);
      });
    });
    return () => {
      try { off(); } catch { /* ignore */ }
    };
  }, []);

  const latest = history[0];
  return { latest, history };
}
