import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useCapture() {
  const getBuffers = useCallback(async () => {
    if (!isElectron) return [];
    try { return await window.ovoAPI.capture.getBuffers(); } catch { return []; }
  }, []);
  const takeScreenshot = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.ovoAPI.capture.takeScreenshot(); } catch { return null; }
  }, []);
  const onResult = useCallback((listener: (payload: any) => void) => {
    if (!isElectron) return () => {};
    try { return window.ovoAPI.on("capture:result", listener); } catch { return () => {}; }
  }, []);
  const setInterval = useCallback(async (seconds: number) => {
    if (!isElectron) return { ok: false };
    try { return await window.ovoAPI.capture.setInterval(seconds); } catch { return { ok: false }; }
  }, []);
  const setBackgroundMonitoring = useCallback(async (enabled: boolean) => {
    if (!isElectron) return { ok: false, enabled };
    try { return await window.ovoAPI.capture.setBackgroundMonitoring(enabled); } catch { return { ok: false, enabled }; }
  }, []);
  const getBackgroundMonitoring = useCallback(async () => {
    if (!isElectron) return false;
    try { return await window.ovoAPI.capture.getBackgroundMonitoring(); } catch { return false; }
  }, []);
  const setAgentInterval = useCallback(async (seconds: number) => {
    if (!isElectron) return { ok: false, seconds };
    try { return await window.ovoAPI.capture.setAgentInterval(seconds); } catch { return { ok: false, seconds }; }
  }, []);
  const getAgentInterval = useCallback(async () => {
    if (!isElectron) return 15;
    try { return await window.ovoAPI.capture.getAgentInterval(); } catch { return 15; }
  }, []);

  return {
    getBuffers, takeScreenshot, onResult, setInterval,
    setBackgroundMonitoring, getBackgroundMonitoring,
    setAgentInterval, getAgentInterval
  };
}
