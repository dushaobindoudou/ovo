import { useEffect, useRef, useState } from "react";
import { Check, ThumbsDown, ThumbsUp, X, ChevronLeft } from "lucide-react";
import clsx from "clsx";
import { useFeedback } from "../../hooks/useFeedback";
import { getSuggestionSpec } from "./suggestionTypes";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

// P1-1 建议反馈细分：拒绝时让用户说"哪里错了"，把原因教回系统。
type RejectReason = "irrelevant" | "misunderstood" | "too_early" | "too_noisy" | "mute_app" | "never";
const REJECT_REASONS: { key: RejectReason; label: string }[] = [
  { key: "irrelevant", label: "不相关" },
  { key: "misunderstood", label: "理解错了" },
  { key: "too_early", label: "太早" },
  { key: "too_noisy", label: "太打扰" },
  { key: "mute_app", label: "这个 App 别提醒" },
  { key: "never", label: "永远别这样" }
];

/**
 * 把拒绝原因写回 negative_patterns，后续 prompt 会读到并约束同类建议。
 *   - never      → 全局禁忌（最强）
 *   - mute_app   → 当前 App 作用域（取实时活动窗口名）
 *   - irrelevant → 该类建议作用域（intent）
 *   - 其余（理解错/太早/太打扰）→ 只做一次性反馈 + toast 抑制，不建永久规则
 */
async function teachFromReason(reason: RejectReason, suggestionType: string, label: string, title: string) {
  if (!isElectron) return;
  try {
    if (reason === "never") {
      await window.ovoAPI.kg.addNegativePattern({
        intent: suggestionType,
        patternText: `用户明确要求：永远不要再推送类似「${title || label}」的「${label}」建议`,
        contextSignature: title
      });
    } else if (reason === "mute_app") {
      const h = await window.ovoAPI.health.getLatest().catch(() => null);
      const appName = (h as { appName?: string } | null)?.appName;
      await window.ovoAPI.kg.addNegativePattern({
        appName: appName || undefined,
        patternText: appName
          ? `用户要求：不要在 ${appName} 里推送「${label}」类提醒`
          : `用户要求：减少「${label}」类提醒`
      });
    } else if (reason === "irrelevant") {
      await window.ovoAPI.kg.addNegativePattern({
        intent: suggestionType,
        patternText: `用户反馈「${label}」类建议常常不相关——没有强屏幕证据时不要推`
      });
    }
  } catch { /* 写入失败不阻断反馈 */ }
}

/**
 * 通知风格紧凑卡片。
 *   - 单行标题 + 多行内容截断（line-clamp-2）
 *   - 操作按钮压缩到右下角小尺寸
 *   - 反馈后 1.4s 自动塌陷，触发外层下方上推回填（无新依赖，CSS 过渡）
 */
interface SuggestionCardProps {
  item: {
    id: string;
    type: string;
    title: string;
    content: string;
    priority?: number;
  };
  /** 反馈/关闭后调用，外层从渲染列表移除时配合 wrapper 的 leaving 动画 */
  onDismiss?: (id: string) => void;
}

const COLLAPSE_MS = 320;
const RECEIPT_HOLD_MS = 1100;

export function SuggestionCard({ item, onDismiss }: SuggestionCardProps) {
  const { submitSuggestionFeedback } = useFeedback();
  const spec = getSuggestionSpec(item.type);
  const Icon = spec.icon;
  const isHighPriority = (item.priority ?? 0) >= 4;

  const [reacted, setReacted] = useState<"accepted" | "rejected" | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
  }, []);

  const beginLeave = () => {
    // 先采样当前高度写到 inline style，再下一帧设为 0 触发过渡
    const el = wrapperRef.current;
    if (el) {
      el.style.maxHeight = `${el.scrollHeight}px`;
      requestAnimationFrame(() => {
        setLeaving(true);
      });
    } else {
      setLeaving(true);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      onDismiss?.(item.id);
    }, COLLAPSE_MS);
  };

  const handleReact = (action: "accepted" | "rejected") => {
    setReacted(action);
    void submitSuggestionFeedback({
      suggestionId: item.id,
      suggestionType: item.type,
      action,
    });
    // 回执停留片刻，然后塌陷上推
    dismissTimerRef.current = window.setTimeout(beginLeave, RECEIPT_HOLD_MS);
  };

  // P1-1: 带原因的拒绝——既记反馈，又把原因教回 negative_patterns
  const handleRejectWithReason = (reason: RejectReason) => {
    setShowReasons(false);
    setReacted("rejected");
    void submitSuggestionFeedback({
      suggestionId: item.id,
      suggestionType: item.type,
      action: "rejected",
      reason,
    });
    void teachFromReason(reason, item.type, spec.label, item.title);
    dismissTimerRef.current = window.setTimeout(beginLeave, RECEIPT_HOLD_MS);
  };

  const handleClose = () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    beginLeave();
  };

  return (
    <div
      ref={wrapperRef}
      className="ovo-card-wrap"
      data-leaving={leaving ? "true" : "false"}
      style={{
        overflow: "hidden",
        transition: `max-height ${COLLAPSE_MS}ms cubic-bezier(0.4,0,0.2,1), opacity ${COLLAPSE_MS}ms ease, margin ${COLLAPSE_MS}ms ease, transform ${COLLAPSE_MS}ms ease`,
        ...(leaving
          ? { maxHeight: 0, opacity: 0, marginTop: 0, marginBottom: 0, transform: "translateX(8px)" }
          : {}),
      }}
    >
      {reacted ? (
        <ReceiptInline accepted={reacted === "accepted"} label={spec.label} />
      ) : showReasons ? (
        <ReasonPicker
          onPick={handleRejectWithReason}
          onBack={() => setShowReasons(false)}
        />
      ) : (
        <article
          className={clsx(
            "group relative flex items-start gap-2.5 rounded-lg border bg-[var(--bg-card)] px-3 py-2.5 transition-colors",
            "hover:bg-[var(--bg-card-hover)]",
            isHighPriority
              // P1.6: 高优先级 — 整卡片脉动呼吸 + accent 描边强调视觉权重
              ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-dim)] animate-pulse-subtle"
              : "border-[var(--border)]"
          )}
          style={isHighPriority ? { animation: "ovo-priority-breathe 2.4s ease-in-out infinite" } : undefined}
        >
          {/* 图标（自带类型颜色） */}
          <div
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: spec.tint, color: spec.accent }}
          >
            <Icon size={13} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p
                className="truncate text-[12px] font-semibold text-[var(--text-primary)]"
                title={item.title || spec.label}
              >
                {item.title || spec.label}
              </p>
              {isHighPriority && (
                <span className="shrink-0 rounded-sm bg-[var(--accent-dim)] px-1 text-[9px] font-medium text-[var(--accent)]">
                  优先
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-[11.5px] leading-snug text-[var(--text-secondary)]">
              {item.content}
            </p>
          </div>

          {/* 操作区：紧凑 icon button，hover 显形 */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => handleReact("accepted")}
              title="采纳"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--accent-dim)] hover:text-[var(--accent)]"
            >
              <ThumbsUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => setShowReasons(true)}
              title="不想要（告诉 Ovo 哪里不对）"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <ThumbsDown size={12} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              title="关闭"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
        </article>
      )}
    </div>
  );
}

// P1-1: 拒绝原因选择器——一行紧凑 chips，点一下即学习
function ReasonPicker({
  onPick,
  onBack,
}: {
  onPick: (reason: RejectReason) => void;
  onBack: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          title="返回"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">哪里不对？告诉 Ovo，它会学</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {REJECT_REASONS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onPick(r.key)}
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              r.key === "never"
                ? "border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReceiptInline({ accepted, label }: { accepted: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px]"
      style={{
        borderColor: accepted ? "rgba(7,193,96,0.30)" : "var(--border)",
        background: accepted ? "rgba(7,193,96,0.06)" : "var(--bg-card)",
      }}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{
          background: accepted ? "rgba(7,193,96,0.18)" : "var(--bg-card-hover)",
          color: accepted ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        {accepted ? <Check size={11} /> : <ThumbsDown size={10} />}
      </span>
      <span className="text-[var(--text-secondary)]">
        {accepted ? `已采纳 · ovo 会更主动推 ${label}` : `已忽略 · 减少 ${label} 类提醒`}
      </span>
    </div>
  );
}
