import { Card } from "../shared/Card";
import { ProgressBar } from "../shared/ProgressBar";

interface PersonalityCardProps {
  name: string;
  score: number;
  evidence: string;
}

export function PersonalityCard({ name, score, evidence }: PersonalityCardProps) {
  return (
    <Card>
      <p className="mb-2 text-sm font-medium">{name}</p>
      <ProgressBar value={score * 100} />
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{evidence}</p>
    </Card>
  );
}
