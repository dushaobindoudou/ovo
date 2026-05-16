/**
 * R6: 顶部 live status 状态条。
 * 让用户随时看到 ovo 在干什么——不打开任何 tab 就能知道：
 *   - 上次截图多久前
 *   - 当前用户活动状态（typing / reading / idle）
 *   - 上次 pipeline 完成时间
 *   - ovo 是否正在思考
 */
import { useEffect, useState } from "react";
import { Eye, Brain, Coffee, Type, MousePointer, Pause } from "lucide-react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface Health {
  ok?: boolean;
  timestamp?: number;
  appName?: string;
  windowTitle?: string;
}

function ago(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 1000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3_600_000)} 小时前`;
}

export function LiveStatusBar() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<"idle" | "thinking" | "generating" | "alert">("idle");
  const [lastPipelineAt, setLastPipelineAt] = useState<number>(0);
  const [activityLabel, setActivityLabel] = useState<string>("");
  const [pausedUntil, setPausedUntil] = useState<number>(0);
  const [, tick] = useState(0);

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

    // T3: 拉暂停状态，每 5s 刷一次
    const refreshPause = () => {
      void window.ovoAPI.privacy.getPauseState().then((s) => setPausedUntil(s.pausedUntil ?? 0)).catch(() => {});
    };
    refreshPause();
    const pauseTimer = setInterval(refreshPause, 5000);

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
      setActivityLabel("");
      return;
    }
    const sinceCapture = Date.now() - health.timestamp;
    if (sinceCapture < 30_000) setActivityLabel("观察中");
    else if (sinceCapture < 120_000) setActivityLabel("待机");
    else setActivityLabel("空闲");
  }, [health?.timestamp]);

  const isThinking = pipelineStatus === "thinking" || pipelineStatus === "generating";
  const isPaused = pausedUntil > Date.now();
  const pauseRemainingMin = isPaused ? Math.max(1, Math.ceil((pausedUntil - Date.now()) / 60_000)) : 0;

  return (
    <div className={`flex items-center gap-3 border-b border-[var(--border)] px-4 py-1.5 text-[11px] ${
      isPaused ? "bg-[var(--warning)]/10 text-[var(--warning)]" : "bg-[var(--bg-base)] text-[var(--text-secondary)]"
    }`}>
      <span className="flex items-center gap-1.5">
        {isPaused ? (
          <>
            <Pause size={11} />
            <span className="font-medium">ovo 已暂停</span>
            <span className="text-[var(--text-muted)]">· {pauseRemainingMin} 分钟后恢复</span>
          </>
        ) : isThinking ? (
          <>
            <Brain size={11} className="animate-pulse text-[var(--accent)]" />
            <span className="text-[var(--accent)]">ovo 正在思考...</span>
          </>
        ) : pipelineStatus === "alert" ? (
          <>
            <span className="text-[var(--danger)]">⚠ 有重要提醒</span>
          </>
        ) : (
          <>
            <Eye size={11} className="text-[var(--text-muted)]" />
            <span>ovo 在看着</span>
          </>
        )}
      </span>

      {health && (
        <span className="flex items-center gap-1 text-[var(--text-muted)]">
          · 上次截图 {ago(health.timestamp ?? 0)}
        </span>
      )}

      {lastPipelineAt > 0 && (
        <span className="text-[var(--text-muted)]">
          · 上次想了想 {ago(lastPipelineAt)}
        </span>
      )}

      {activityLabel && (
        <span className="ml-auto flex items-center gap-1 text-[var(--text-muted)]">
          {activityLabel === "观察中" ? <Type size={11} /> :
           activityLabel === "待机" ? <MousePointer size={11} /> :
           <Coffee size={11} />}
          {activityLabel}
        </span>
      )}
    </div>
  );
}
