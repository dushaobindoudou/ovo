import { useSuggestions } from "../../hooks/useSuggestions";
import { SuggestionCard } from "./SuggestionCard";

export function SuggestionPanel() {
  const { suggestions } = useSuggestions();
  return (
    <div className="h-full overflow-auto bg-[rgba(15,15,25,0.88)] p-3 backdrop-blur-xl">
      <header className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-sm font-semibold">ovo 建议面板</h2>
        <span className="text-xs text-[var(--text-secondary)]">{suggestions.length} 条建议</span>
      </header>
      <div className="space-y-3">
        {suggestions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">暂无建议，系统正在观察屏幕上下文。</p>
        ) : null}
        {suggestions.map((item) => (
          <SuggestionCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
