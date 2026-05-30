/**
 * 「Ovo 表现」看板 —— backlog 6 个北极星指标的本地可视化。
 *
 * 数据来自主进程 metrics:get（结合 metric_events + user_feedback + action history）。
 * 让用户（和自评系统）看见 Ovo 到底有没有越用越准：命中率 / TTFV / 纠错数 /
 * 信任动作 / 产出完成率。全本地统计，不上传。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, Target, Clock, Wrench, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Card } from "../shared/Card";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

type Metrics = Awaited<ReturnType<typeof window.ovoAPI.kg.getMetrics>>;

export function MetricsCard() {
  const { t } = useTranslation();
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const load = () => { void window.ovoAPI.kg.getMetrics().then(setM).catch(() => {}); };
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!isElectron || !m) return null;

  const pct = (v: number | null) => (v == null ? t("metricsCard.na") : `${Math.round(v * 100)}%`);
  const ttfv = () => {
    if (m.ttfvMs == null) return t("metricsCard.na");
    const totalSec = Math.round(m.ttfvMs / 1000);
    return totalSec >= 60
      ? t("metricsCard.ttfvMin", { m: Math.floor(totalSec / 60), s: totalSec % 60 })
      : t("metricsCard.ttfvSec", { s: totalSec });
  };
  const trustTotal = m.trustActions.pause + m.trustActions.blacklist + m.trustActions.deleteMemory + m.trustActions.replay;

  // 完全没数据时不打扰
  if (m.suggestionsTotal === 0 && !m.activated && m.outputTotal === 0) {
    return (
      <Card>
        <div className="flex items-center gap-1.5">
          <Gauge size={14} className="text-[var(--accent)]" />
          <p className="text-sm font-semibold">{t("metricsCard.title")}</p>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("metricsCard.notYet")}</p>
      </Card>
    );
  }

  const stats: Array<{ icon: typeof Target; label: string; value: string; sub?: string }> = [
    { icon: Target, label: t("metricsCard.hitRate"), value: pct(m.hitRate),
      sub: m.suggestionsTotal > 0 ? t("metricsCard.acceptedOf", { a: m.suggestionsAccepted, n: m.suggestionsTotal }) : undefined },
    { icon: Clock, label: t("metricsCard.ttfv"), value: ttfv() },
    { icon: CheckCircle2, label: t("metricsCard.output"), value: pct(m.outputCompletionRate),
      sub: m.outputTotal > 0 ? `${m.outputCompleted}/${m.outputTotal}` : undefined },
    { icon: Wrench, label: t("metricsCard.corrections", { n: m.correctionCount }), value: `${m.correctionCount}` },
    { icon: ShieldCheck, label: t("metricsCard.trust", { n: trustTotal }), value: `${trustTotal}` }
  ];

  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5">
        <Gauge size={14} className="text-[var(--accent)]" />
        <p className="text-sm font-semibold">{t("metricsCard.title")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Icon size={11} /> <span className="truncate">{s.label}</span>
              </div>
              <p className="mt-0.5 text-[15px] font-semibold text-[var(--text-primary)]">{s.value}</p>
              {s.sub && <p className="text-[9.5px] text-[var(--text-muted)]">{s.sub}</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">{t("metricsCard.hint")}</p>
    </Card>
  );
}
