import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface TTSResponse {
  ok: boolean;
  mode?: "edge" | "native" | "failed";
  audioBase64?: string;
  error?: string;
}

/**
 * 主进程返回 edge-tts mp3 base64 时，渲染端 decode 后用 <audio> 播放；
 * 主进程走 native say 时已经直接播过了，渲染端不要重复触发。
 */
async function playBase64Mp3(audioBase64: string) {
  const binary = atob(audioBase64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.onerror = () => URL.revokeObjectURL(url);
  try {
    await audio.play();
  } catch {
    URL.revokeObjectURL(url);
  }
}

export function useTTS() {
  const speak = useCallback(async (text: string, voice?: string): Promise<TTSResponse> => {
    if (!isElectron) return { ok: false };
    const res = (await window.ovoAPI.tts.speak({ text, voice })) as TTSResponse;
    if (res?.ok && res.mode === "edge" && res.audioBase64) {
      await playBase64Mp3(res.audioBase64);
    }
    return res;
  }, []);
  return { speak };
}
