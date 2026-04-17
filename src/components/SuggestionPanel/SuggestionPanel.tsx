import { useSuggestions } from "../../hooks/useSuggestions";
import { SuggestionCard } from "./SuggestionCard";
import { PendingActionsSection } from "./PendingActionsSection";

export function SuggestionPanel() {
  const { suggestions } = useSuggestions();
  return (
    <div className="h-full overflow-auto bg-[var(--bg-content)] p-4">
      <header className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
        <h2 className="text-base font-medium text-[var(--text-primary)]">智能建议</h2>
        <span className="text-xs text-[var(--text-muted)]">{suggestions.length} 条建议</span>
      </header>
      <div className="mb-4 space-y-3">
        <PendingActionsSection />
      </div>
      <div className="space-y-3">
        {suggestions.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">暂无建议</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">系统正在观察屏幕上下文...</p>
          </div>
        ) : null}
        {suggestions.map((item) => (
          <SuggestionCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
