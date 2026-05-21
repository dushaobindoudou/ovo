import { useEffect, useMemo, useState } from "react";
import { X, Volume2, ThumbsUp, Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFeedback } from "../../hooks/useFeedback";
import { useTTS } from "../../hooks/useTTS";
import { getSuggestionSpec } from "./suggestionTypes";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

// P1.16: 按内容长度动态计算时长 — 基础 12s + 每字符 80ms，上限 60s
//        用户点"锁定"按钮可暂停倒计时
const AUTO_CLOSE_BASE_MS = 12_000;
const AUTO_CLOSE_PER_CHAR_MS = 80;
const AUTO_CLOSE_MAX_MS = 60_000;

interface ToastSuggestion {
  id: string;
  type: string;
  title: string;
  content: string;
  detail?: string;
  priority?: number;
  /** "action" = 可执行动作 toast（带执行/忽略按钮）；缺省 = 建议/邀约/回执 */
  kind?: "suggestion" | "action";
  /** kind=action 时：主进程 registry 里的 actionId（confirm/cancel 只需它）*/
  actionId?: string;
  pipelineId?: string;
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
  const { t } = useTranslation();
  const { submitSuggestionFeedback } = useFeedback();
  const { speak } = useTTS();
  const item = useMemo(() => {
    const raw = parseToastPayload();
    if (!raw) return null;
    // 用户反馈：弹窗里出现一段 CSS 代码 — 历史脏数据 / 落地点漏清洗。
    // 兜底：所有可见文本（title / content / detail）渲染前都过 sanitize。
    return {
      ...raw,
      title: sanitizeForDisplay(raw.title, t("toast.titleCodeHidden"), 100),
      content: sanitizeForDisplay(raw.content, t("toast.contentCodeHidden"), 500),
      detail: raw.detail ? sanitizeForDisplay(raw.detail, t("toast.detailCodeHidden"), 300) : raw.detail
    };
  }, [t]);
  // P1.16: 按内容长度计算总时长（基础 + 每字符），上限 60s
  const totalMs = useMemo(() => {
    if (!item) return AUTO_CLOSE_BASE_MS;
    const len = (item.title?.length ?? 0) + (item.content?.length ?? 0) + (item.detail?.length ?? 0);
    return Math.min(AUTO_CLOSE_MAX_MS, AUTO_CLOSE_BASE_MS + len * AUTO_CLOSE_PER_CHAR_MS);
  }, [item]);
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [pinned, setPinned] = useState(false); // P1.16: 用户锁定后不关闭

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
  // P1.16: pinned 时暂停倒计时
  useEffect(() => {
    if (pinned) return;
    const start = Date.now();
    const baseRemain = remainingMs;
    const timer = window.setInterval(() => {
      const left = baseRemain - (Date.now() - start);
      if (left <= 0) {
        window.clearInterval(timer);
        try { window.close(); } catch { /* ignore */ }
        setRemainingMs(0);
        return;
      }
      setRemainingMs(left);
    }, 100);
    return () => window.clearInterval(timer);
  }, [pinned]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  // P4: receipt 是"我做完了"事实，没有采纳/忽略
  const isReceipt = item?.type === "receipt";
  // P1: offer 是"我提议长期帮你做 X"，按钮是 要 / 不要
  const isOffer = item?.type === "offer";
  // 可执行动作 toast：按钮是 执行 / 忽略，直接调 action.confirm/cancel
  const isAction = item?.kind === "action";
  const [actionBusy, setActionBusy] = useState(false);

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

        {/* P1.16: 锁定按钮 — 点亮后暂停倒计时 */}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            title={pinned ? t("toast.pinLocked") : t("toast.pinLock")}
            onClick={() => setPinned((p) => !p)}
            className={`flex items-center rounded-md px-1 py-1 transition-colors ${
              pinned
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <button
            type="button"
            title={pinned ? t("toast.closeNow") : t("toast.closeCountdown", { n: secondsLeft })}
            onClick={() => window.close()}
            className="flex items-center gap-1 rounded-md px-1 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            {!pinned && <span className="text-[10px] tabular-nums">{secondsLeft}s</span>}
            <X size={14} />
          </button>
        </div>

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
                {isAction
                  ? t("toast.actionWants", { verb: t(`toast.verb.${item.type}`, t("toast.verb.other")) })
                  : (item.title || spec.label)}
              </p>
            </div>
          </header>

          <p className="line-clamp-5 flex-1 whitespace-pre-wrap text-[12px] leading-[1.55] text-[var(--text-secondary)]">
            {item.content}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            {isAction ? (
              <>
                <button
                  type="button"
                  disabled={actionBusy}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
                  onClick={() => {
                    if (actionBusy || !item.actionId) return;
                    setActionBusy(true);
                    void window.ovoAPI.action
                      .confirm({ actionId: item.actionId, pipelineId: item.pipelineId })
                      .catch(() => { /* 结果由 action:result 广播处理 */ })
                      .finally(() => window.close());
                  }}
                >
                  {actionBusy ? t("toast.executing") : t("toast.execute")}
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-60"
                  onClick={() => {
                    if (!item.actionId) { window.close(); return; }
                    void window.ovoAPI.action
                      .cancel({ actionId: item.actionId, pipelineId: item.pipelineId })
                      .catch(() => { /* */ })
                      .finally(() => window.close());
                  }}
                >
                  {t("toast.ignore")}
                </button>
              </>
            ) : isReceipt ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => window.close()}
              >
                {t("toast.gotIt")}
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
                  {t("toast.want")}
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
                  {t("toast.dontWant")}
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
                  <ThumbsUp size={11} />{t("toast.adopt")}
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
                  {t("toast.ignore")}
                </button>
              </>
            )}
            <button
              type="button"
              title={t("toast.read")}
              onClick={async () => {
                // 用户 Bug 反馈：TTS 没声音。原来错误被静默吞，现在显式 alert + 锁定 toast
                // 不让它自动关闭（pinned），让用户看到错误
                const res = await speak(`${item.title}. ${item.content}`);
                if (!res?.ok) {
                  setPinned(true);
                  const detail = res?.error ?? t("toast.ttsUnknownError");
                  // 友好提示：TTS 失败时告诉用户为什么
                  const friendly = /未启用/.test(detail)
                    ? t("toast.ttsDisabled")
                    : /网络|fetch|ENET|abort/i.test(detail)
                    ? t("toast.ttsNetwork")
                    : /autoplay|gesture/i.test(detail)
                    ? t("toast.ttsFirstPlay")
                    : detail;
                  alert(t("toast.ttsFailed", { reason: friendly }));
                }
              }}
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
