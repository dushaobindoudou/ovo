/**
 * P1-1 配套：「教过 Ovo 的规则」管理卡。
 *
 * 用户在建议卡上选「永远别这样 / 这个 App 别提醒 / 不相关」时写入的 negative_patterns，
 * 在这里集中查看并可随时撤销——满足"用户能查看和撤销教过 Ovo 的规则"。
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Trash2, RotateCcw } from "lucide-react";
import { Card } from "../shared/Card";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

type Rule = Awaited<ReturnType<typeof window.ovoAPI.kg.listNegativePatterns>>[number];

export function NegativePatternsCard() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isElectron) return;
    setLoading(true);
    try {
      const data = await window.ovoAPI.kg.listNegativePatterns(100);
      setRules((data ?? []) as Rule[]);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    if (!isElectron) return;
    try { await window.ovoAPI.kg.deleteNegativePattern(id); }
    finally { void load(); }
  };

  return (
    <Card title={t("negativePatterns.title")} id="section-rules">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-[var(--text-muted)]">
          {t("negativePatterns.hint")}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <RotateCcw size={11} /> {t("negativePatterns.refresh")}
        </button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">{t("negativePatterns.loading")}</p>
      ) : rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">{t("negativePatterns.empty")}</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">{t("negativePatterns.emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[12px]"
            >
              <Ban size={12} className="mt-0.5 shrink-0 text-[var(--warning)]" />
              <div className="min-w-0 flex-1">
                <p className="break-words">{r.pattern_text}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {r.app_name ? t("negativePatterns.scopeApp", { app: r.app_name }) : t("negativePatterns.scopeGlobal")}
                  {r.intent ? ` · ${r.intent}` : ""}
                  {r.hit_count > 0 ? ` · ${t("negativePatterns.hits", { n: r.hit_count })}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                title={t("negativePatterns.removeTitle")}
                className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
