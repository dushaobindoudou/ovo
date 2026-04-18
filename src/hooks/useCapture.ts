import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.nudgeAPI;

export function useCapture() {
  const getBuffers = useCallback(async () => {
    if (!isElectron) return [];
    try { return await window.nudgeAPI.capture.getBuffers(); } catch { return []; }
  }, []);
  const takeScreenshot = useCallback(async () => {
    if (!isElectron) return null;
    try { return await window.nudgeAPI.capture.takeScreenshot(); } catch { return null; }
  }, []);
  const onResult = useCallback((listener: (payload: any) => void) => {
    if (!isElectron) return () => {};
    try { return window.nudgeAPI.on("capture:result", listener); } catch { return () => {}; }
  }, []);

  return { getBuffers, takeScreenshot, onResult };
}
