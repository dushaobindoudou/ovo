import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSuggestions } from "../../hooks/useSuggestions";
import { SuggestionCard } from "./SuggestionCard";
import { PendingActionsSection } from "./PendingActionsSection";
import { useSuggestionStore } from "../../stores/suggestionStore";

export function SuggestionPanel() {
  const { suggestions } = useSuggestions();
  // P1.29: dismissed 状态已持久化到 zustand store + localStorage
  const dismissedIds = useSuggestionStore((s) => s.dismissedIds);
  const markDismissed = useSuggestionStore((s) => s.markDismissed);
  const handleDismiss = useCallback((id: string) => {
    markDismissed(id);
  }, [markDismissed]);

  const dismissedSet = new Set(dismissedIds);
  const visible = suggestions.filter((s) => !dismissedSet.has(s.id));
  const count = visible.length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-content)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">智能建议</h2>
        </div>
        {/* P2.15: "在听" 语义不清 → "Ovo 在看着..." 配合微脉冲 */}
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {count > 0 ? `${count} 条` : (
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--state-watching)]" />
              Ovo 在看着…
            </span>
          )}
        </span>
      </header>

      {/* 关键：flex gap 让卡片塌陷时 gap 自然被 margin transition 吸收，下方自然回填 */}
      <div className="flex-1 overflow-auto px-3 py-3">
        <PendingActionsSection />
        {count === 0 ? (
          <EmptyHero />
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {visible.map((item) => (
              <SuggestionCard key={item.id} item={item} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyHero() {
  // P2.13: 分阶段文案 — 启动 5 分钟内"通常需要 1-3 分钟熟悉"，超过 5 分钟改"先去看 Ovo 学到了什么"
  const mountedAt = useRef<number>(Date.now());
  const [stage, setStage] = useState<"warming" | "patient" | "settled">("warming");

  useEffect(() => {
    const t1 = window.setTimeout(() => setStage("patient"), 60_000);          // 1 分钟后
    const t2 = window.setTimeout(() => setStage("settled"), 5 * 60_000);       // 5 分钟后
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); void mountedAt; };
  }, []);

  const copy = stage === "warming"
    ? { title: "Ovo 正在观察", hint: "看到你正在做的事，会主动出现在这里" }
    : stage === "patient"
    ? { title: "Ovo 还在熟悉你的工作场景", hint: "通常 1-3 分钟内会有第一条建议出现" }
    : { title: "暂未观察到合适的出手时机", hint: "也可以先去看看 Ovo 学到了什么（记忆 tab）" };

  return (
    <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-4 py-6">
      <div className="mb-2 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
            <Sparkles size={14} />
          </div>
        </div>
      </div>
      <p className="text-center text-[12px] font-medium text-[var(--text-primary)]">{copy.title}</p>
      <p className="mt-0.5 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">{copy.hint}</p>
    </div>
  );
}
