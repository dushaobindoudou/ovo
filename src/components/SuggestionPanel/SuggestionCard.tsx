import { Card } from "../shared/Card";
import { ActionButton } from "./ActionButton";
import { useFeedback } from "../../hooks/useFeedback";

interface SuggestionCardProps {
  item: {
    id: string;
    type: string;
    title: string;
    content: string;
  };
}

export function SuggestionCard({ item }: SuggestionCardProps) {
  const { submitSuggestionFeedback } = useFeedback();
  return (
    <Card className="bg-black/20">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{item.title || item.type}</p>
        <span className="text-xs text-[var(--text-secondary)]">{item.type}</span>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{item.content}</p>
      <div className="mt-3 flex gap-2">
        <ActionButton
          onClick={() =>
            void submitSuggestionFeedback({
              suggestionId: item.id,
              suggestionType: item.type,
              action: "accepted"
            })
          }
        >
          👍
        </ActionButton>
        <ActionButton
          onClick={() =>
            void submitSuggestionFeedback({
              suggestionId: item.id,
              suggestionType: item.type,
              action: "rejected"
            })
          }
        >
          👎
        </ActionButton>
        <ActionButton onClick={() => navigator.clipboard.writeText(item.content)}>复制</ActionButton>
      </div>
    </Card>
  );
}
