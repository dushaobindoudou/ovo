/**
 * UI-S2: 现在 (Pulse) — Jobs/张小龙 视角的"一屏脉搏"
 *
 * 设计原则：
 *   ① Hero 大字 prediction：ovo 觉得你接下来想干啥
 *   ② Pulse 单行：所有数字（截屏 / 推断 / 学了多少）
 *   ③ 等你处理（pending）：仅有内容时出现，offers + actions 合并
 *   ④ 底栏：监控 / 暂停 / 健康，小字次要信息
 *
 * 砍掉：原来的 NowView/FeedView/WindowsView/HealthView 4 sub-view
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Pause, Play, Eye, ChevronDown, ChevronUp, Camera, Brain, Compass, Trash2 } from "lucide-react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { SetupChecklist } from "./SetupChecklist";
import { useInsights } from "../../hooks/useInsights";
import { usePendingActions } from "../../hooks/usePendingActions";
import { useWindowStore } from "../../stores/windowStore";
import { useWindows } from "../../hooks/useWindows";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

// 频率 label 走 i18n（overview.freq*）；仅保留排序优先级映射
const FREQ_I18N_KEY: Record<string, string> = {
  daily: "overview.freqDaily",
  weekly: "overview.freqWeekly",
  "event-driven": "overview.freqEventDriven",
  "one-shot": "overview.freqOneShot"
};
const FREQ_PRIORITY: Record<string, number> = {
  daily: 1.0, weekly: 0.9, "event-driven": 0.8, "one-shot": 0.7
};

interface OverviewPanelProps {
  ctx?: {
    selectedId: string | null;
    /** A: 让本面板跨 tab 打开 ActionDetailDrawer */
    requestOpenAction?: (actionId: string) => void;
  };
}

interface CompletedActionEntry {
  actionId: string;
  description: string;
  status: "success" | "failed";
  error?: string;
  completedAt: number;
}

interface DraftEntry {
  id: string;
  createdAt: number;
  actionId: string;
  actionType: string;
  description: string;
  evidenceLevel: string;
  evidence: string[];
  groundingReason: string;
  appName?: string;
}

export function OverviewPanel({ ctx }: OverviewPanelProps) {
  const { t } = useTranslation();
  const { latest, history } = useInsights();
  const { active } = useWindowStore();
  const { refresh } = useWindows();
  const { pending, confirmAction, cancelAction } = usePendingActions();

  const [lastNonOvoActive, setLastNonOvoActive] = useState<{ appName: string; windowTitle: string } | null>(null);
  const [windowCount, setWindowCount] = useState(0);
  const [pauseUntil, setPauseUntil] = useState<number>(0);
  const [healthOk, setHealthOk] = useState<boolean>(true);
  const [lastCaptureAt, setLastCaptureAt] = useState<number>(0);
  const [reactedOffers, setReactedOffers] = useState<Map<string, "accepted" | "rejected">>(new Map());
  // 用户 Bug 修复：点击"确认执行"没视觉反馈 + 失败时看不到错误
  const [actionBusy, setActionBusy] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<Map<string, string>>(new Map());
  // A: 完成态卡片 — 执行完保留 ~30s 给用户"✓ 已完成 [查看详情]"反馈
  const [completedActions, setCompletedActions] = useState<CompletedActionEntry[]>([]);
  // 反思 #2: 草稿台 — Ovo 准备好但 evidence 未验证的 action
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [draftBusy, setDraftBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isElectron) return;
    const load = () => {
      void window.ovoAPI.drafts.list(10).then((rows) => {
        setDrafts((rows ?? []) as DraftEntry[]);
      }).catch(() => { /* */ });
    };
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const handleDraftPromote = useCallback(async (id: string) => {
    if (draftBusy.has(id)) return;
    setDraftBusy((p) => new Set(p).add(id));
    try {
      await window.ovoAPI.drafts.promote(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDraftBusy((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [draftBusy]);

  const handleDraftDismiss = useCallback(async (id: string) => {
    if (draftBusy.has(id)) return;
    setDraftBusy((p) => new Set(p).add(id));
    try {
      await window.ovoAPI.drafts.dismiss(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDraftBusy((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [draftBusy]);

  const handleConfirmAction = useCallback(async (item: { action: { id: string; description?: string }; pipelineId?: string }) => {
    const id = item.action.id;
    if (actionBusy.has(id)) return; // 防双击
    setActionBusy((prev) => new Set(prev).add(id));
    setActionError((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    try {
      const result = await confirmAction({ action: item.action as never, pipelineId: item.pipelineId });
      // result 是 ActionResultPayload，成功时 broadcast action:result 会清掉 pending 行
      // 失败时（包括"动作已失效"）— 也广播了，列表会清，但用户需要看到为什么
      if (result && result.status === "failed" && result.error) {
        setActionError((prev) => new Map(prev).set(id, result.error!));
      }
      // A: 把刚做完的 action 加进完成态条带（success / failed 都进，cancelled 不进）
      if (result && (result.status === "success" || result.status === "failed")) {
        setCompletedActions((prev) => [
          {
            actionId: id,
            description: item.action.description ?? t("actionType.other"),
            status: result.status as "success" | "failed",
            error: result.error,
            completedAt: Date.now()
          },
          ...prev.filter((e) => e.actionId !== id)
        ].slice(0, 5));
      }
    } finally {
      setActionBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [actionBusy, confirmAction, t]);

  // A: 完成态条带 30s 后自动清除
  useEffect(() => {
    if (completedActions.length === 0) return;
    const t = setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setCompletedActions((prev) => prev.filter((e) => e.completedAt > cutoff));
    }, 2000);
    return () => clearInterval(t);
  }, [completedActions.length]);

  const handleOpenActionDetail = useCallback((actionId: string) => {
    if (ctx?.requestOpenAction) ctx.requestOpenAction(actionId);
  }, [ctx]);
  const [showAllPending, setShowAllPending] = useState(false);
  const [, tick] = useState(0);

  // 1s tick 更新相对时间
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // 拉窗口列表（用于"正在看"显示）
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // 缓存最近一次"非 ovo"的活动窗口
  useEffect(() => {
    if (active?.appName && !/ovo/i.test(active.appName)) {
      setLastNonOvoActive({ appName: active.appName, windowTitle: active.windowTitle ?? "" });
    }
  }, [active]);

  // 拉暂停状态 + 健康
  useEffect(() => {
    if (!isElectron) return;
    const refreshState = () => {
      void window.ovoAPI.privacy.getPauseState().then((s) => setPauseUntil(s?.pausedUntil ?? 0)).catch(() => {});
      void window.ovoAPI.health.getLatest().then((h) => {
        if (h && typeof h === "object") {
          const obj = h as { ok?: boolean; timestamp?: number };
          setHealthOk(obj.ok !== false);
          if (typeof obj.timestamp === "number") setLastCaptureAt(obj.timestamp);
        }
      }).catch(() => {});
      void window.ovoAPI.windows.getThumbnails().then((thumbs) => setWindowCount((thumbs ?? []).length)).catch(() => {});
    };
    refreshState();
    const t = setInterval(refreshState, 5000);
    return () => clearInterval(t);
  }, []);

  // offers 排序
  const sortedOffers = useMemo(() => {
    if (!latest?.offers) return [];
    return [...latest.offers].sort((a, b) =>
      ((FREQ_PRIORITY[b.frequency] ?? 0.5) * b.confidence) -
      ((FREQ_PRIORITY[a.frequency] ?? 0.5) * a.confidence)
    );
  }, [latest?.offers]);

  // 已经被用户响应过的 offer 不进 pending（已记下偏好）
  const visibleOffers = useMemo(() =>
    sortedOffers.filter((o) => !reactedOffers.has(o.id)),
    [sortedOffers, reactedOffers]
  );

  const reactOffer = (offerId: string, action: "accepted" | "rejected", offer: { needs_capability?: string; frequency: string }) => {
    if (!isElectron) return;
    setReactedOffers((prev) => new Map(prev).set(offerId, action));
    void window.ovoAPI.suggestion.feedback({
      suggestionId: offerId,
      suggestionType: `offer:${offer.needs_capability ?? offer.frequency}`,
      action,
      pipelineId: latest?.pipelineId
    });
  };

  // ── 显示数据 ──
  const display = active?.appName && !/ovo/i.test(active.appName) ? active : lastNonOvoActive;
  const isPaused = pauseUntil > Date.now();
  const pauseRemainingMin = isPaused ? Math.max(1, Math.ceil((pauseUntil - Date.now()) / 60_000)) : 0;
  const captureAgo = lastCaptureAt > 0 ? Math.floor((Date.now() - lastCaptureAt) / 1000) : -1;
  const totalPending = pending.length + visibleOffers.length;

  // 暂停 / 恢复
  const togglePause = async (minutes: number) => {
    if (!isElectron) return;
    if (isPaused) {
      await window.ovoAPI.privacy.resume();
      setPauseUntil(0);
    } else {
      const r = await window.ovoAPI.privacy.pause(minutes);
      setPauseUntil(r.pausedUntil ?? 0);
    }
  };

  return (
    <div className="space-y-4">
      {/* ────────── P0-1 首启自检（全绿且收起后自动消失） ────────── */}
      <SetupChecklist />

      {/* ────────── Hero ────────── */}
      <Card>
        {latest?.prediction ? (
          <PredictionHero
            prediction={latest.prediction}
            intent={latest.intent}
            role={latest.role}
          />
        ) : (
          <ColdStartHero
            captureAgo={captureAgo}
            activeAppName={display?.appName ?? null}
          />
        )}

        {/* Pulse 一行 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)]/40 pt-3 text-[11px] text-[var(--text-muted)]">
          {captureAgo >= 0 && (
            <span className="inline-flex items-center gap-1">
              <Camera size={11} />
              {captureAgo < 60 ? `${captureAgo}s` : `${Math.floor(captureAgo / 60)}m`}前看了 {display?.appName ?? "屏幕"}
            </span>
          )}
          {latest?.pipelineId && (
            <span className="inline-flex items-center gap-1">
              <span>·</span>
              <Brain size={11} />
              {latest.intent ? t("overview.understood") : t("overview.inferred")}
            </span>
          )}
          {totalPending > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <span>·</span>
              <Sparkles size={11} />
              {totalPending} 等你处理
            </span>
          )}
        </div>
      </Card>

      {/* ────────── ovo 最近做了什么（self-evolving 可见化） ────────── */}
      {history.length > 0 && <ActivityStrip history={history} />}

      {/* ────────── 等你处理（仅有内容时） ────────── */}
      {totalPending > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{t("overview.pendingTitle", { n: totalPending })}</p>
            {totalPending > 3 && (
              <button
                type="button"
                onClick={() => setShowAllPending(!showAllPending)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                {showAllPending ? t("overview.collapse") : t("overview.expandAll")}
                {showAllPending ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDown size={11} className="inline ml-0.5" />}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {/* pending actions */}
            {pending.slice(0, showAllPending ? undefined : 3).map((item) => {
              const busy = actionBusy.has(item.action.id);
              const err = actionError.get(item.action.id);
              return (
                <div key={item.action.id} className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-2.5">
                  <p className="text-sm font-medium">{sanitizeForDisplay(item.action.description, t("overview.descCodeHidden"), 200)}</p>
                  {err && (
                    <p className="mt-1.5 rounded bg-[var(--danger)]/10 px-2 py-1 text-[11px] text-[var(--danger)]">
                      ⚠ {err}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <GlowButton
                      className="!text-xs !py-1"
                      disabled={busy}
                      onClick={() => void handleConfirmAction(item)}
                    >
                      {busy ? t("overview.executing") : t("overview.confirmExecute")}
                    </GlowButton>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancelAction({ actionId: item.action.id, pipelineId: item.pipelineId })}
                      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                </div>
              );
            })}

            {/* offers */}
            {visibleOffers.slice(0, showAllPending ? undefined : Math.max(0, 3 - pending.length)).map((offer) => (
              <div key={offer.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] p-2.5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">★ {sanitizeForDisplay(offer.title, t("overview.offerTitleCodeHidden"), 80)}</p>
                  <span className="shrink-0 rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    {t(FREQ_I18N_KEY[offer.frequency] ?? "", offer.frequency)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{sanitizeForDisplay(offer.value_prop, t("overview.offerDetailHidden"), 200)}</p>
                {offer.first_action_preview && (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">▸ {sanitizeForDisplay(offer.first_action_preview, "", 160)}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <GlowButton
                    className="!text-xs !py-1"
                    onClick={() => reactOffer(offer.id, "accepted", offer)}
                  >{t("overview.want")}</GlowButton>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                    onClick={() => reactOffer(offer.id, "rejected", offer)}
                  >{t("overview.dontWant")}</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ────────── A: 刚完成的动作（30s 内自动消失，给用户"已完成 + 查看详情"反馈） ────────── */}
      {completedActions.length > 0 && (
        <Card>
          <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{t("overview.justDone")}</p>
          <div className="space-y-1.5">
            {completedActions.map((entry) => (
              <div
                key={entry.actionId}
                className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-[12px] ${
                  entry.status === "success"
                    ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                    : "border-[var(--danger)]/30 bg-[var(--danger)]/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${entry.status === "success" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                    {entry.status === "success" ? t("overview.done") : t("overview.failed")}
                    <span className="ml-2 font-normal text-[var(--text-primary)]">{entry.description}</span>
                  </p>
                  {entry.error && (
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{entry.error}</p>
                  )}
                </div>
                {ctx?.requestOpenAction && (
                  <button
                    type="button"
                    onClick={() => handleOpenActionDetail(entry.actionId)}
                    className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-content)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    查看详情 →
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ────────── 反思 #2: 草稿台 — Ovo 准备好但没出手 ────────── */}
      {drafts.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{t("overview.draftsTitle", { n: drafts.length })}</p>
            <span className="text-[11px] text-[var(--text-muted)]">{t("overview.draftsSubtitle")}</span>
          </div>
          <div className="space-y-1.5">
            {drafts.slice(0, 5).map((d) => {
              const busy = draftBusy.has(d.id);
              return (
                <div
                  key={d.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] p-2.5 text-[12px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--text-primary)]">
                        <span className="mr-2 rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {t(`actionType.${d.actionType}`, d.actionType)}
                        </span>
                        {sanitizeForDisplay(d.description, t("overview.draftDescCodeHidden"), 160)}
                      </p>
                      {d.evidence.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {d.evidence.slice(0, 2).map((ev, i) => (
                            <li key={i} className="text-[11px] text-[var(--text-secondary)]">
                              · {sanitizeForDisplay(ev, t("overview.evidenceCodeHidden"), 100)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">{d.groundingReason}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <GlowButton
                      className="!text-xs !py-1"
                      disabled={busy}
                      onClick={() => void handleDraftPromote(d.id)}
                    >
                      {busy ? t("overview.executing") : t("overview.adoptExecute")}
                    </GlowButton>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDraftDismiss(d.id)}
                      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ────────── 你正在用的窗口（横向缩略图 strip） ────────── */}
      <WindowsStrip />

      {/* ────────── 底栏：监控 / 健康 / 暂停 / 清缓存 ────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/40 bg-[var(--bg-base)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Eye size={11} />
            {windowCount > 0 ? `看到 ${windowCount} 个窗口` : "等待窗口"}
          </span>
          <span>·</span>
          <span className={healthOk ? "" : "text-[var(--warning)]"}>
            {isPaused ? `已暂停 · ${pauseRemainingMin} 分钟后恢复` : healthOk ? "一切正常" : "健康异常"}
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <ClearCacheButton />
          {!isPaused ? (
            <div className="flex items-center gap-1">
              {[5, 15, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void togglePause(m)}
                  className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--warning)] hover:text-[var(--warning)]"
                  title={`暂停 ${m} 分钟`}
                >
                  <Pause size={9} />{m < 60 ? `${m}min` : `${m / 60}h`}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void togglePause(0)}
              className="flex items-center gap-1 rounded border border-[var(--accent)]/40 bg-[var(--accent-dim)] px-2 py-0.5 text-[var(--accent)]"
            >
              <Play size={10} />立即恢复
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 当前系统打开的窗口缩略图条带——主界面底部"你正在用啥"一目了然。
 * 横向滚动，活动窗口高亮，每 8s 自动刷新。点击未实现（只看不改，避免和"设置-窗口监控" tab 职责冲突）。
 */
function WindowsStrip() {
  const [thumbs, setThumbs] = useState<Array<{
    windowId: string; appName: string; windowTitle: string;
    thumbnail: string; sourceId: string; isActive?: boolean;
  }>>([]);

  useEffect(() => {
    if (!isElectron) return;
    const load = () => {
      void window.ovoAPI.windows.getThumbnails()
        .then((data) => setThumbs(data ?? []))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  if (thumbs.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)]/40 bg-[var(--bg-card)]/40 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-[var(--text-secondary)]">
          你正在用的窗口 <span className="text-[var(--text-muted)]">({thumbs.length})</span>
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {thumbs.map((t) => (
          <div
            key={`${t.sourceId}-${t.windowId}`}
            className={`group relative w-[112px] shrink-0 overflow-hidden rounded-md border bg-black/30 transition-colors ${
              t.isActive
                ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                : "border-[var(--border)]/60"
            }`}
            title={`${t.appName}${t.windowTitle ? " · " + t.windowTitle : ""}`}
          >
            <img src={t.thumbnail} alt={t.appName} className="aspect-video w-full object-cover" />
            <div className="flex items-center justify-between gap-1 px-1.5 py-1">
              <span className="truncate text-[10px] font-medium text-[var(--text-primary)]">{t.appName}</span>
              {t.isActive && (
                <span className="shrink-0 rounded bg-[var(--accent)] px-1 text-[9px] text-white">活</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 清理 in-memory 截图/OCR 缓存按钮。
 *   - 清掉 event-processor 各窗口 buffer
 *   - 清掉 auto-capture 最近 snapshot 历史
 *   - 清掉 session 轨迹
 *   - 不动 KG / 设置 / 持久化日志（"刷新一下我刚才看到的"，不是"清记忆"）
 */
function ClearCacheButton() {
  const [pending, setPending] = useState(false);
  const [doneAt, setDoneAt] = useState(0);
  const handleClick = useCallback(async () => {
    if (!isElectron) return;
    setPending(true);
    try {
      await window.ovoAPI.capture.clearCache();
      setDoneAt(Date.now());
    } finally {
      setPending(false);
    }
  }, []);

  const justDone = doneAt > 0 && Date.now() - doneAt < 2000;
  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      title="清掉本次会话的 OCR 缓冲、截图历史和 5 分钟活动轨迹。不影响知识图谱与设置。"
      className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
    >
      <Trash2 size={9} />
      {pending ? "清理中" : justDone ? "已清理" : "清缓存"}
    </button>
  );
}

/**
 * Prediction Hero —— ovo 推断完成后的核心展示
 * 设计意图：让用户感受到「ovo 真的在懂我」
 *   ① 大字 prediction，左侧 Sparkles 呼吸
 *   ② 当前意图 + 角色 拆成独立 chip，更易扫
 *   ③ 「为什么这么觉得」可展开，露出 role.evidence —— 信任建立的关键
 */
/**
 * ActivityStrip —— ovo 最近做了什么的瞥见
 * 设计意图：让 self-evolving 在主页可见，用户能感知 ovo 在工作
 *   ① 最近 N 次理解（取自 history）
 *   ② 看过的不同应用数
 *   ③ 累计提议数（offers + suggestions 估算）
 */
function ActivityStrip({ history }: { history: Array<{ pipelineId: string; timestamp: number; appName: string; offers?: unknown[] }> }) {
  // 过滤最近 24h 的活动
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const recent = history.filter((h) => h.timestamp >= dayAgo);
  const apps = new Set(recent.map((h) => h.appName).filter(Boolean));
  const offerTotal = recent.reduce((sum, h) => sum + (h.offers?.length ?? 0), 0);

  if (recent.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--border)]/40 bg-[var(--bg-card)]/40 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <span className="text-[var(--accent)]">●</span>
        <span>最近 24 小时</span>
      </div>
      <ActivityStat value={recent.length} label="次理解" />
      <ActivityStat value={apps.size} label="个应用" />
      {offerTotal > 0 && <ActivityStat value={offerTotal} label="条提议" />}
      <p className="ml-auto text-[10.5px] text-[var(--text-muted)]">
        每次反馈都让 ovo 更懂你
      </p>
    </div>
  );
}

function ActivityStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

interface PredictionHeroProps {
  prediction: string;
  intent?: string;
  role?: { role: string; evidence: string[]; confidence: number };
}

function PredictionHero({ prediction, intent, role }: PredictionHeroProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasEvidence = !!role?.evidence?.length;
  const confidencePct = role ? Math.round(role.confidence * 100) : 0;

  return (
    <div className="flex items-start gap-3">
      {/* 左侧图标：呼吸点 + Sparkles，传递"活的 / 正在思考"的感觉 */}
      <div className="relative mt-1 shrink-0">
        <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20" style={{ animation: "ovo-hero-pulse 2.4s ease-in-out infinite" }} />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          <Sparkles size={16} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--accent)]">
          ovo 觉得你接下来…
        </p>
        <p className="text-lg font-medium leading-snug text-[var(--text-primary)]">
          {sanitizeForDisplay(prediction, "（基于屏幕上的代码/配置，暂无具体预测）", 240)}
        </p>

        {/* Chips 行：当前意图 / 角色推断 */}
        {(intent || role) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {intent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">在做</span>
                <span className="font-medium text-[var(--text-primary)]">{intent}</span>
              </span>
            )}
            {role && (
              <button
                type="button"
                disabled={!hasEvidence}
                onClick={() => setShowEvidence((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[11px] text-[var(--accent)] transition-colors ${
                  hasEvidence ? "cursor-pointer hover:bg-[var(--accent)]/20" : "cursor-default opacity-90"
                }`}
                title={hasEvidence ? "点击查看 ovo 这么觉得的依据" : ""}
              >
                <span>{role.role}</span>
                <span className="text-[var(--accent)]/70">{confidencePct}%</span>
                {hasEvidence && (
                  showEvidence
                    ? <ChevronUp size={11} className="-mr-0.5" />
                    : <ChevronDown size={11} className="-mr-0.5" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Evidence 折叠区 —— 关键信任元素：让"ovo 凭什么这么觉得"可被验证 */}
        {showEvidence && hasEvidence && (
          <div
            className="mt-2.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-dim)] p-2.5"
            style={{ animation: "ovo-evidence-fade 280ms ease-out both" }}
          >
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">
              ovo 看到这些证据
            </p>
            <ul className="space-y-1">
              {role!.evidence.map((ev, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
                  <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style>{`
        @keyframes ovo-hero-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50%      { transform: scale(1.4); opacity: 0; }
        }
        @keyframes ovo-evidence-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/**
 * 冷启动 Hero —— prediction 还没出来时的占位
 * 设计意图：让用户首启 30 秒内 "看着 ovo 活着"，而不是一行灰字
 *   ① 三段渐进文案循环切换（观察→理解→建立画像）
 *   ② 已有 active app 时显示「正在看 X」
 *   ③ 已有截屏时显示 N 秒前
 *   ④ 预期管理：「通常 30 秒内有第一条」
 */
interface ColdStartHeroProps {
  captureAgo: number;
  activeAppName: string | null;
}

const COLD_STAGES: Array<{ icon: typeof Camera; text: string; sub: string }> = [
  { icon: Camera,  text: "在看你的屏幕",   sub: "每 5 秒一次，不打扰" },
  { icon: Brain,   text: "在理解你在做什么", sub: "结合应用上下文和你的习惯" },
  { icon: Compass, text: "在为你建立画像",   sub: "用得越久越准" }
];

function ColdStartHero({ captureAgo, activeAppName }: ColdStartHeroProps) {
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    // P1.2: 2.4s → 1.2s 切换更快，冷启动期间不让用户长时间盯着同一句
    const t = setInterval(() => setStageIdx((i) => (i + 1) % COLD_STAGES.length), 1200);
    return () => clearInterval(t);
  }, []);

  const stage = COLD_STAGES[stageIdx];
  const StageIcon = stage.icon;
  const hasSignal = captureAgo >= 0 || !!activeAppName;

  return (
    <div className="flex items-start gap-3">
      {/* 旋转/呼吸图标，传递"在工作"信号 */}
      <div className="relative mt-1 shrink-0">
        <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
          <StageIcon size={16} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--accent)]">
          ovo 启动中…
        </p>
        <p
          key={stageIdx}
          className="text-lg font-medium leading-snug text-[var(--text-primary)]"
          style={{ animation: "ovo-cold-fade 600ms ease-out both" }}
        >
          {stage.text}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {hasSignal ? (
            <>
              {activeAppName && <span>正在看 <span className="text-[var(--text-secondary)]">{activeAppName}</span></span>}
              {activeAppName && captureAgo >= 0 && <span> · </span>}
              {captureAgo >= 0 && (
                <span>
                  {captureAgo < 60 ? `${captureAgo}s` : `${Math.floor(captureAgo / 60)}m`} 前抓过屏
                </span>
              )}
              <span> · 第一条建议很快就来</span>
            </>
          ) : (
            <>{stage.sub} · 通常 30 秒内有第一条</>
          )}
        </p>
      </div>

      <style>{`
        @keyframes ovo-cold-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
