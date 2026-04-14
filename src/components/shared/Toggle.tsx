interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 rounded-full border transition ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent)]"
          : "border-white/20 bg-[var(--bg-input)]"
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}
