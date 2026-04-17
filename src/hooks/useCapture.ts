import { useCallback } from "react";

export function useCapture() {
  const getBuffers = useCallback(() => window.nudgeAPI.capture.getBuffers(), []);
  const takeScreenshot = useCallback(() => window.nudgeAPI.capture.takeScreenshot(), []);
  const onResult = useCallback((listener: (payload: any) => void) => {
    return window.nudgeAPI.on("capture:result", listener);
  }, []);

  return { getBuffers, takeScreenshot, onResult };
}
