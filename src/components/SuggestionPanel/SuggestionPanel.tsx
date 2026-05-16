import { useCallback, useState } from "react";
import { useSuggestions } from "../../hooks/useSuggestions";
import { SuggestionCard } from "./SuggestionCard";
import { PendingActionsSection } from "./PendingActionsSection";

export function SuggestionPanel() {
  const { suggestions } = useSuggestions();
  // 本地"已 dismiss" 用于配合卡片塌陷动画过渡——store 端可保留，UI 不再渲染
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const visible = suggestions.filter((s) => !dismissed.has(s.id));
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
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {count > 0 ? `${count} 条` : "在听"}
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
  return (
    <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-4 py-6">
      <div className="mb-2 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
            <span className="text-base">✦</span>
          </div>
        </div>
      </div>
      <p className="text-center text-[12px] font-medium text-[var(--text-primary)]">ovo 正在观察</p>
      <p className="mt-0.5 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
        看到你正在做的事，会主动出现在这里
      </p>
    </div>
  );
}
