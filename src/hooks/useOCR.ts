import { useCallback } from "react";
import { useRuntimeStore } from "../stores/runtimeStore";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export function useOCR() {
  const { setCapturing } = useRuntimeStore();

  const initialize = useCallback(async () => {
    if (!isElectron) return;
    await window.ovoAPI.ocr.initialize();
  }, []);

  const recognize = useCallback(async () => {
    if (!isElectron) return null;
    return window.ovoAPI.ocr.recognize({});
  }, []);

  const startCapture = useCallback(
    async (intervalSeconds: number) => {
      if (!isElectron) return;
      await window.ovoAPI.capture.start({ intervalSeconds });
      setCapturing(true);
    },
    [setCapturing]
  );

  const stopCapture = useCallback(async () => {
    if (!isElectron) return;
    await window.ovoAPI.capture.stop();
    setCapturing(false);
  }, [setCapturing]);

  return { initialize, recognize, startCapture, stopCapture };
}
