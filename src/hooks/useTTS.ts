import { useCallback } from "react";

export function useTTS() {
  const speak = useCallback((text: string, voice?: string) => window.nudgeAPI.tts.speak({ text, voice }), []);
  return { speak };
}
