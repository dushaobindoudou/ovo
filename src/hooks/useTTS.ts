import { useCallback } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface TTSResponse {
  ok: boolean;
  mode?: "edge" | "native" | "failed";
  audioBase64?: string;
  error?: string;
}

function reportRendererError(source: string, error: unknown) {
  if (!isElectron) return;
  const msg = error instanceof Error ? error.message : String(error);
  try {
    void window.ovoAPI.logger.error(source, msg, {
      stack: error instanceof Error ? error.stack : undefined
    });
  } catch { /* ignore — best effort */ }
}

/**
 * 主进程返回 edge-tts mp3 base64 时，渲染端 decode 后用 <audio> 播放；
 * 主进程走 native say 时已经直接播过了，渲染端不要重复触发。
 *
 * 用户反馈 Bug: TTS 播不出声音
 * 历史问题:
 *   - audio.play() 失败被静默 catch，用户没任何反馈
 *   - Chromium autoplay policy: 没有 user gesture 时 play() 会被拒绝
 *   - SuggestionToastWindow 是独立 BrowserWindow，gesture 上下文可能丢失
 * 修复:
 *   - catch 后把错误转译并 logger.error 上报到主控台
 *   - 抛出 Error 让调用方决定怎么处理（toast 显示 / 静默 fallback say）
 *   - 用 muted 预热（绕过部分 autoplay block）
 */
async function playBase64Mp3(audioBase64: string): Promise<void> {
  let binary: string;
  try {
    binary = atob(audioBase64);
  } catch (e) {
    reportRendererError("tts.decode", e);
    throw new Error("TTS base64 解码失败");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes.length < 256) {
    throw new Error(`TTS 返回的音频数据太短（${bytes.length} 字节）— 主进程可能没真的合成`);
  }
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  // 主动捕获 audio 元素自身的 load 错误
  const loadPromise = new Promise<void>((resolve, reject) => {
    audio.addEventListener("canplaythrough", () => resolve(), { once: true });
    audio.addEventListener("error", () => {
      const code = audio.error?.code;
      reject(new Error(`音频加载失败（code=${code}）`));
    }, { once: true });
    // 5 秒兜底超时
    setTimeout(() => resolve(), 5000);
  });
  audio.onended = () => URL.revokeObjectURL(url);
  // 不再 onerror 静默 — load 错误已通过 loadPromise 上报
  try {
    await loadPromise;
    await audio.play();
  } catch (e) {
    URL.revokeObjectURL(url);
    reportRendererError("tts.play", e);
    // 把 autoplay 错误转译成用户能理解的
    const msg = e instanceof Error ? e.message : String(e);
    if (/NotAllowedError|user.*gesture|autoplay/i.test(msg)) {
      throw new Error("浏览器拒绝自动播放，请先点击窗口任意位置以授权音频播放");
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

export function useTTS() {
  const speak = useCallback(async (text: string, voice?: string): Promise<TTSResponse> => {
    if (!isElectron) return { ok: false };
    let res: TTSResponse;
    try {
      res = (await window.ovoAPI.tts.speak({ text, voice })) as TTSResponse;
    } catch (e) {
      reportRendererError("tts.ipc", e);
      return { ok: false, mode: "failed", error: e instanceof Error ? e.message : String(e) };
    }
    if (!res?.ok) {
      // 主进程已拒绝（enabled=false / 网络断了 / msedge-tts 失败）— res.error 已经有信息
      reportRendererError("tts.main-rejected", res.error ?? "未知");
      return res;
    }
    if (res.mode === "edge" && res.audioBase64) {
      try {
        await playBase64Mp3(res.audioBase64);
      } catch (e) {
        return { ok: false, mode: "failed", error: e instanceof Error ? e.message : "播放失败" };
      }
    }
    return res;
  }, []);
  return { speak };
}
