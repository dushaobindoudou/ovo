import { useEffect, useMemo, useState } from "react";
import { X, Volume2, ThumbsUp } from "lucide-react";
import { useFeedback } from "../../hooks/useFeedback";
import { useTTS } from "../../hooks/useTTS";
import { getSuggestionSpec } from "./suggestionTypes";

const AUTO_CLOSE_MS = 30_000;

interface ToastSuggestion {
  id: string;
  type: string;
  title: string;
  content: string;
  detail?: string;
  priority?: number;
}

function parseToastPayload(): ToastSuggestion | null {
  const hash = window.location.hash || "";
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const encoded = params.get("payload");
  if (!encoded) return null;
  try {
    const b64url = decodeURIComponent(encoded);
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4 || 4)) % 4);
    // atob 返回 latin-1 字节串，UTF-8 中文要先转字节再解码
    const latin1 = atob(padded);
    const bytes = Uint8Array.from(latin1, (c) => c.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(json) as ToastSuggestion;
  } catch {
    return null;
  }
}

export function SuggestionToastWindow() {
  const { submitSuggestionFeedback } = useFeedback();
  const { speak } = useTTS();
  const item = useMemo(() => parseToastPayload(), []);
  const [remainingMs, setRemainingMs] = useState(AUTO_CLOSE_MS);

  // R3: 强制 html/body/#root 透明 + overflow hidden，
  // 否则即使 BrowserWindow.transparent=true，HTML 默认 #fff 背景也会盖一层白色矩形
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root") as HTMLElement | null;
    html.style.background = "transparent";
    html.style.overflow = "hidden";
    html.style.margin = "0";
    body.style.background = "transparent";
    body.style.overflow = "hidden";
    body.style.margin = "0";
    if (root) {
      root.style.background = "transparent";
      root.style.overflow = "hidden";
      root.style.height = "100%";
      root.style.width = "100%";
    }
  }, []);

  // 渲染端兜底自动关闭：即便主进程 timer 被节流，渲染端 setInterval 也保底触发。
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      const left = AUTO_CLOSE_MS - (Date.now() - start);
      if (left <= 0) {
        window.clearInterval(timer);
        try { window.close(); } catch { /* ignore */ }
        setRemainingMs(0);
        return;
      }
      setRemainingMs(left);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const progress = Math.max(0, Math.min(1, remainingMs / AUTO_CLOSE_MS));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  // P4: receipt 是"我做完了"事实，没有采纳/忽略
  const isReceipt = item?.type === "receipt";
  // P1: offer 是"我提议长期帮你做 X"，按钮是 要 / 不要
  const isOffer = item?.type === "offer";

  if (!item) {
    return (
      <div className="h-full w-full bg-transparent p-2">
        <div className="flex h-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-secondary)]">
          建议内容解析失败
        </div>
      </div>
    );
  }

  const spec = getSuggestionSpec(item.type);
  const Icon = spec.icon;
  const isHighPriority = (item.priority ?? 0) >= 4;

  return (
    <div className="h-full w-full overflow-hidden bg-transparent p-2">
      {/* 从左侧滑入：translateX(-110%) → 0；同时 fade-in。300ms ease-out。
          window 区域之外（屏幕左边）卡片自然不可见，给人"从屏幕外滑出来"的观感 */}
      <style>{`
        @keyframes ovo-toast-slide-in {
          from { transform: translateX(-110%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-lg)]"
        style={{
          animation: "ovo-toast-slide-in 320ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
          borderColor: isHighPriority ? spec.accent + "55" : "var(--border)"
        }}
      >
        {/* 左侧色条 —— 类型视觉锚点，与主面板 SuggestionCard 一致 */}
        <span
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: spec.accent }}
          aria-hidden
        />

        {/* 顶部 30s 自动关闭进度条 */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-[var(--border)]/40">
          <div
            className="h-full transition-[width]"
            style={{ width: `${progress * 100}%`, background: spec.accent }}
          />
        </div>

        <button
          type="button"
          title={`${secondsLeft}s 后自动关闭，点击立即关闭`}
          onClick={() => window.close()}
          className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-1 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
        >
          <span className="text-[10px] tabular-nums">{secondsLeft}s</span>
          <X size={14} />
        </button>

        <div className="flex h-full flex-col p-3 pl-[14px]">
          {/* 头：图标 + 类型标签 + 标题 */}
          <header className="mb-1.5 flex items-start gap-2 pr-12">
            <div
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              style={{ background: spec.tint, color: spec.accent }}
            >
              <Icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: spec.accent }}
              >
                {spec.label}
              </p>
              <p className="truncate text-[13px] font-semibold leading-snug">
                {item.title || spec.label}
              </p>
            </div>
          </header>

          <p className="line-clamp-5 flex-1 whitespace-pre-wrap text-[12px] leading-[1.55] text-[var(--text-secondary)]">
            {item.content}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            {isReceipt ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => window.close()}
              >
                知道了
              </button>
            ) : isOffer ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                  onClick={() => {
                    void submitSuggestionFeedback({
                      suggestionId: item.id,
                      suggestionType: "offer",
                      action: "accepted"
                    });
                    window.close();
                  }}
                >
                  要
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    void submitSuggestionFeedback({
                      suggestionId: item.id,
                      suggestionType: "offer",
                      action: "rejected"
                    });
                    window.close();
                  }}
                >
                  不要
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                  onClick={() => {
                    void submitSuggestionFeedback({
                      suggestionId: item.id,
                      suggestionType: item.type,
                      action: "accepted"
                    });
                    window.close();
                  }}
                >
                  <ThumbsUp size={11} />采纳
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    void submitSuggestionFeedback({
                      suggestionId: item.id,
                      suggestionType: item.type,
                      action: "rejected"
                    });
                    window.close();
                  }}
                >
                  忽略
                </button>
              </>
            )}
            <button
              type="button"
              title="朗读"
              onClick={() => void speak(`${item.title}. ${item.content}`)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"
            >
              <Volume2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
