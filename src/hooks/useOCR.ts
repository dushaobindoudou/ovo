import { useCallback } from "react";
import { useRuntimeStore } from "../stores/runtimeStore";

export function useOCR() {
  const { setCapturing } = useRuntimeStore();

  const initialize = useCallback(async () => {
    await window.nudgeAPI.ocr.initialize();
  }, []);

  const recognize = useCallback(async () => window.nudgeAPI.ocr.recognize({}), []);

  const startCapture = useCallback(
    async (intervalSeconds: number) => {
      await window.nudgeAPI.capture.start({ intervalSeconds });
      setCapturing(true);
    },
    [setCapturing]
  );

  const stopCapture = useCallback(async () => {
    await window.nudgeAPI.capture.stop();
    setCapturing(false);
  }, [setCapturing]);

  return { initialize, recognize, startCapture, stopCapture };
}
