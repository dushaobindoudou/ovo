/**
 * R6: 顶部 live status 状态条。
 * 让用户随时看到 ovo 在干什么——不打开任何 tab 就能知道：
 *   - 上次截图多久前
 *   - 当前用户活动状态（typing / reading / idle）
 *   - 上次 pipeline 完成时间
 *   - ovo 是否正在思考
 */
import { useEffect, useState } from "react";
import { Eye, EyeOff, Brain, Coffee, Type, MousePointer, Pause, AlertTriangle, WifiOff, Database, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNetworkWatcher } from "../../hooks/useNetworkWatcher";
import { sanitizeForDisplay } from "../../utils/sanitizeText";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface Health {
  ok?: boolean;
  timestamp?: number;
  appName?: string;
  windowTitle?: string;
}

function ago(ts: number, t: TFunction): string {
  if (!ts) return t("statusBar.dash");
  const diff = Date.now() - ts;
  if (diff < 1000) return t("statusBar.justNow");
  if (diff < 60_000) return t("statusBar.secondsAgo", { n: Math.floor(diff / 1000) });
  if (diff < 3_600_000) return t("statusBar.minutesAgo", { n: Math.floor(diff / 60_000) });
  return t("statusBar.hoursAgo", { n: Math.floor(diff / 3_600_000) });
}

type ActivityKey = "" | "watching" | "standby" | "idle";

export function LiveStatusBar() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<"idle" | "thinking" | "generating" | "alert">("idle");
  const [lastPipelineAt, setLastPipelineAt] = useState<number>(0);
  const [activityKey, setActivityKey] = useState<ActivityKey>("");
  const [pausedUntil, setPausedUntil] = useState<number>(0);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [backend, setBackend] = useState<string>("");
  const [, tick] = useState(0);
  const { t } = useTranslation();
  // M8 / 哲学完全离线场景：banner 显示"仅本地功能可用"
  const { online } = useNetworkWatcher();

  useEffect(() => {
    if (!isElectron) return;
    // 拉一次初始
    void window.ovoAPI.health.getLatest().then(setHealth).catch(() => {});
    void window.ovoAPI.floating.getState().then((s) => {
      if (s) {
        setPipelineStatus(s.pipelineStatus);
        setLastPipelineAt(s.lastPipelineAt);
      }
    }).catch(() => {});

    // 实时订阅
    const offHealth = window.ovoAPI.on("health:update", (h) => {
      if (h && typeof h === "object") setHealth(h as Health);
    });
    const offFloat = window.ovoAPI.on("floating:state-update", (s) => {
      if (!s) return;
      setPipelineStatus(s.pipelineStatus);
      setLastPipelineAt(s.lastPipelineAt);
    });

    // 拉一次 AI 后端（在线服务标识）
    void window.ovoAPI.agent.status().then((s) => {
      const cur = (s as { current?: string | null } | null)?.current;
      if (cur) setBackend(cur);
    }).catch(() => {});

    // T3: 拉暂停状态 + 黑名单，每 5s 刷一次（用户可能随时改黑名单）
    const refreshPrivacy = () => {
      void window.ovoAPI.privacy.getPauseState().then((s) => setPausedUntil(s.pausedUntil ?? 0)).catch(() => {});
      void window.ovoAPI.privacy.getBlacklist().then((apps) => setBlacklist(Array.isArray(apps) ? apps : [])).catch(() => {});
    };
    refreshPrivacy();
    const pauseTimer = setInterval(refreshPrivacy, 5000);

    // 1s tick 用来更新「N 秒前」相对时间
    const t = setInterval(() => tick((n) => n + 1), 1000);

    return () => {
      try { offHealth(); } catch { /* ignore */ }
      try { offFloat(); } catch { /* ignore */ }
      clearInterval(t);
      clearInterval(pauseTimer);
    };
  }, []);

  // 推断活动状态（前端简单版，跟主进程的状态机一致）
  useEffect(() => {
    if (!health?.timestamp) {
      setActivityKey("");
      return;
    }
    const sinceCapture = Date.now() - health.timestamp;
    if (sinceCapture < 30_000) setActivityKey("watching");
    else if (sinceCapture < 120_000) setActivityKey("standby");
    else setActivityKey("idle");
  }, [health?.timestamp]);

  const isThinking = pipelineStatus === "thinking" || pipelineStatus === "generating";
  const isPaused = pausedUntil > Date.now();
  const pauseRemainingMin = isPaused ? Math.max(1, Math.ceil((pausedUntil - Date.now()) / 60_000)) : 0;
  // 黑名单命中：当前活动 App 在黑名单 → 不观察、不记录
  const appName = health?.appName ?? "";
  const isBlacklisted = !!appName && blacklist.some(
    (b) => b && appName.toLowerCase().includes(b.toLowerCase())
  );
  // 记忆写入：暂停 / 黑名单命中时不写记忆，否则记录中
  const memoryOn = !isPaused && !isBlacklisted && !!online;

  return (
    <div className={`flex items-center gap-3 border-b border-[var(--border)] px-4 py-1.5 text-[11px] ${
      !online ? "bg-[var(--warning)]/15 text-[var(--warning)]" :
      isPaused ? "bg-[var(--warning)]/10 text-[var(--warning)]" :
      "bg-[var(--bg-base)] text-[var(--text-secondary)]"
    }`}>
      <span className="flex items-center gap-1.5">
        {!online ? (
          <>
            <WifiOff size={11} className="text-[var(--warning)]" />
            <span className="font-medium">{t("statusBar.offline")}</span>
            <span className="text-[var(--text-muted)]">· {t("statusBar.offlineHint")}</span>
          </>
        ) : isPaused ? (
          <>
            <Pause size={11} />
            <span className="font-medium">{t("statusBar.paused")}</span>
            <span className="text-[var(--text-muted)]">· {t("statusBar.pausedResume", { n: pauseRemainingMin })}</span>
          </>
        ) : isBlacklisted ? (
          <>
            <EyeOff size={11} className="text-[var(--text-muted)]" />
            <span className="font-medium">{t("statusBar.notObserving")}</span>
            <span className="text-[var(--text-muted)]">· {t("statusBar.blacklisted")}</span>
          </>
        ) : isThinking ? (
          <>
            <Brain size={11} className="animate-pulse text-[var(--accent)]" />
            <span className="text-[var(--accent)]">{t("statusBar.thinking")}</span>
          </>
        ) : pipelineStatus === "alert" ? (
          <>
            <AlertTriangle size={11} className="text-[var(--danger)]" />
            <span className="text-[var(--danger)]">{t("statusBar.alert")}</span>
          </>
        ) : (
          <>
            <Eye size={11} className="text-[var(--text-muted)] animate-pulse" />
            {/* P0.7 / P1.9: 显示当前正在观察的应用名 — 让用户感知 Ovo 在真的看屏幕 */}
            <span>
              {t("statusBar.watchingApp")}
              {health?.appName && (
                <span className="ml-1 text-[var(--text-secondary)]">· {sanitizeForDisplay(health.appName, t("statusBar.appNameError"), 40)}</span>
              )}
            </span>
          </>
        )}
      </span>

      {health && (
        <span className="flex items-center gap-1 text-[var(--text-muted)]">
          · {t("statusBar.lastCapture", { time: ago(health.timestamp ?? 0, t) })}
        </span>
      )}

      {lastPipelineAt > 0 && (
        <span className="text-[var(--text-muted)]">
          · {t("statusBar.lastThink", { time: ago(lastPipelineAt, t) })}
        </span>
      )}

      {/* P0-3: 记忆写入指示——让用户随时知道当前屏幕数据会不会进记忆 */}
      {online && (
        <span className={`flex items-center gap-1 ${memoryOn ? "text-[var(--text-muted)]" : "text-[var(--warning)]"}`}>
          · <Database size={10} />
          {memoryOn ? t("statusBar.memOn") : t("statusBar.memOff")}
        </span>
      )}

      {/* P0-3: 在线服务标识——当前用哪个 AI 后端处理屏幕内容 */}
      {online && backend && !isPaused && !isBlacklisted && (
        <span className="flex items-center gap-1 text-[var(--text-muted)]">
          · <Cpu size={10} />
          {t("statusBar.aiVia", { name: backend })}
        </span>
      )}

      {activityKey && (
        <span className="ml-auto flex items-center gap-1 text-[var(--text-muted)]">
          {activityKey === "watching" ? <Type size={11} /> :
           activityKey === "standby" ? <MousePointer size={11} /> :
           <Coffee size={11} />}
          {t(`statusBar.activity${activityKey.charAt(0).toUpperCase()}${activityKey.slice(1)}`)}
        </span>
      )}
    </div>
  );
}
