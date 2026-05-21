import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, BarChart3, Layers } from "lucide-react";
import { Card } from "../shared/Card";
import { Empty } from "../shared/Empty";
import { GlowButton } from "../shared/GlowButton";
import { Toggle } from "../shared/Toggle";
import { useWindows } from "../../hooks/useWindows";
import { useWindowStore } from "../../stores/windowStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useOCR } from "../../hooks/useOCR";
import { useCapture } from "../../hooks/useCapture";

interface BufferEntry { timestamp: number; text: string }
interface BufferRowProps {
  item: { windowId: string; appName: string; entries: BufferEntry[] };
}

function BufferRow({ item }: BufferRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-card-hover)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate font-medium">{item.appName}</span>
          <span className="truncate text-xs text-[var(--text-muted)]">{item.windowId}</span>
        </div>
        <span className="shrink-0 rounded bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
          {item.entries.length} 条
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs">
          {item.entries.length === 0 ? (
            <p className="text-[var(--text-muted)]">无内容</p>
          ) : (
            item.entries.map((entry, i) => (
              <details key={i} className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1">
                <summary className="cursor-pointer text-[var(--text-secondary)]">
                  [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.text.slice(0, 80) || "无文本"}
                  {entry.text.length > 80 ? "…" : ""}
                </summary>
                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--text-primary)]">
                  {entry.text || "无文本"}
                </pre>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

interface ThumbnailRow {
  windowId: string;
  appName: string;
  windowTitle: string;
  thumbnail: string;
  sourceId: string;
  isActive?: boolean;
}

export function WindowPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { refresh, setMonitored, getMonitored, getCaptureStats } = useWindows();
  const { windows, active } = useWindowStore();
  const {
    captureInterval, monitoredWindows, setMonitoredWindows,
    backgroundMonitoring, setBackgroundMonitoring
  } = useSettingsStore();
  const [hydrated, setHydrated] = useState(false);
  const { startCapture, stopCapture } = useOCR();
  const { getBuffers, setBackgroundMonitoring: setBgMonitoringIPC, getBackgroundMonitoring } = useCapture();
  const [buffers, setBuffers] = useState<
    Array<{ windowId: string; appName: string; entries: Array<{ timestamp: number; text: string }> }>
  >([]);
  const [captureStats, setCaptureStats] = useState<
    Array<{
      windowId: string; appName: string; windowTitle: string;
      lastSuccessAt: number; attempts: number; failures: number; failureRate: number;
    }>
  >([]);
  const [thumbs, setThumbs] = useState<ThumbnailRow[]>([]);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);

  const selectedId = ctx?.selectedId ?? "active";

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void getBuffers().then(setBuffers);
      void getCaptureStats().then(setCaptureStats);
    }, 3000);
    return () => clearInterval(timer);
  }, [getBuffers, getCaptureStats, refresh]);

  // Hydrate monitored window list + 后台监控开关 from main process
  useEffect(() => {
    if (hydrated) return;
    void getMonitored().then((keys) => {
      if (Array.isArray(keys) && keys.length > 0) setMonitoredWindows(keys);
      setHydrated(true);
    });
    void getBackgroundMonitoring().then((enabled) => {
      // 主进程是 source of truth；启动时同步到前端 store
      setBackgroundMonitoring(!!enabled);
    });
  }, [getMonitored, getBackgroundMonitoring, hydrated, setMonitoredWindows, setBackgroundMonitoring]);

  // 设置面板里改了 backgroundMonitoring 时同步到主进程
  useEffect(() => {
    if (!hydrated) return;
    void setBgMonitoringIPC(backgroundMonitoring);
  }, [backgroundMonitoring, hydrated, setBgMonitoringIPC]);

  // 拉缩略图：activeId 是 active / 单个 windowId 时刷新
  useEffect(() => {
    if (!isElectron) return;
    if (selectedId === "_stats" || selectedId === "_buffer") return;
    setThumbLoading(true);
    void window.ovoAPI.windows.getThumbnails()
      .then((data) => {
        setThumbs(data ?? []);
        setThumbError(null);
      })
      .catch((err) => {
        setThumbError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setThumbLoading(false));
    const timer = setInterval(() => {
      void window.ovoAPI.windows.getThumbnails()
        .then((data) => setThumbs(data ?? []))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [selectedId]);

  const monitoredSet = useMemo(() => new Set(monitoredWindows), [monitoredWindows]);
  const isMonitored = (item: { windowId: string; appName: string }) => {
    const legacy = `${item.windowId}::${item.appName}`;
    return monitoredSet.has(item.windowId) || monitoredSet.has(legacy);
  };
  const toggleWindow = async (item: { windowId: string; appName: string }) => {
    const legacy = `${item.windowId}::${item.appName}`;
    const on = isMonitored(item);
    const next = on
      ? monitoredWindows.filter((k) => k !== item.windowId && k !== legacy)
      : [...monitoredWindows.filter((k) => k !== legacy), item.windowId];
    setMonitoredWindows(next);
    await setMonitored(next);
  };

  const selectedWindow = useMemo(() => {
    if (!selectedId || selectedId.startsWith("_")) return null;
    return windows.find((w) => w.windowId === selectedId)
      ?? thumbs.find((t) => t.windowId === selectedId)
      ?? null;
  }, [windows, thumbs, selectedId]);

  // ===== 视图切换 =====

  if (selectedId === "_buffer") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">OCR 与统计</h2>
        <p className="text-xs text-[var(--text-muted)]">
          上方：每个窗口的捕获成功率与最近时间。下方：等待下次 agent-pipeline 触发时合并送给 LLM 的 OCR 文本。
          {active ? `当前活动窗口：${active.appName}${active.windowTitle ? ` · ${active.windowTitle}` : ""}` : "未检测到活动窗口"}
        </p>
        <Card title="捕获统计">
          {captureStats.length === 0 ? (
            <Empty icon={BarChart3} title="还没有统计数据" hint="等待捕获服务运行后会出现" />
          ) : (
            <div className="space-y-1.5 text-sm">
              {captureStats.map((row) => (
                <div key={row.windowId} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{row.appName || row.windowId}</span>
                      {row.windowTitle && (
                        <span className="truncate text-xs text-[var(--text-secondary)]">· {row.windowTitle}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      最近 {row.lastSuccessAt ? new Date(row.lastSuccessAt).toLocaleTimeString() : "—"} · 尝试 {row.attempts} · 失败 {row.failures}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                    row.failureRate > 0.2
                      ? "bg-[var(--danger)]/15 text-[var(--danger)]"
                      : "bg-[var(--success)]/15 text-[var(--success)]"
                  }`}>
                    {(row.failureRate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title={`OCR 缓冲区 (${buffers.length} 个窗口待处理)`}>
          {buffers.length === 0 ? (
            <Empty
              icon={Layers}
              title={active ? "OCR 缓冲为空" : "没有可监控的活动窗口"}
              hint={active ? "当前活动窗口的下次截图后会出现" : undefined}
            />
          ) : (
            <div className="space-y-2">
              {buffers.map((item) => (
                <BufferRow key={`${item.windowId}::${item.appName}`} item={item} />
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // selectedWindow（单窗口详情）
  if (selectedWindow) {
    const thumb = thumbs.find((t) => t.windowId === selectedWindow.windowId);
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{selectedWindow.appName}</h2>
        <Card>
          {thumb ? (
            <img
              src={thumb.thumbnail}
              alt={selectedWindow.appName}
              className="w-full rounded-lg border border-[var(--border)] bg-black/40 object-contain"
            />
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">该窗口未提供缩略图（可能未授予屏幕录制权限或窗口已关闭）。</p>
          )}
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>窗口标题</span>
              <span className="text-[var(--text-secondary)]">{selectedWindow.windowTitle || "(无)"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>是否监控</span>
              <Toggle checked={isMonitored(selectedWindow)} onChange={() => void toggleWindow(selectedWindow)} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 默认 active 视图：缩略图网格 + 控制
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">屏幕窗口</h2>
        <div className="flex items-center gap-2">
          <GlowButton className="!text-xs" onClick={() => startCapture(captureInterval)}>开始捕获</GlowButton>
          <GlowButton className="!text-xs" onClick={() => stopCapture()}>停止捕获</GlowButton>
          <GlowButton className="!text-xs" onClick={() => refresh()}>刷新</GlowButton>
        </div>
      </div>

      <Card title={active ? `当前活动: ${active.appName}` : "活动窗口未知"}>
        <p className="text-xs text-[var(--text-secondary)]">{active?.windowTitle || "未检测到活动窗口标题"}</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">后台监控</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {backgroundMonitoring
                ? "已开启：除活动窗口外，每 tick 还会按窗口分别截图 + OCR 监听列表里的窗口。"
                : "默认关闭：每 tick 仅采集当前活动窗口；开启后才扫监听列表，窗口数 ≥ 5 时建议手动加大间隔。"}
            </p>
          </div>
          <Toggle
            checked={backgroundMonitoring}
            onChange={(v) => setBackgroundMonitoring(v)}
          />
        </div>
      </Card>

      <Card title={`所有打开窗口 (${thumbs.length})`}>
        {thumbError && (
          <div className="mb-3 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]">
            {thumbError}
          </div>
        )}
        {thumbLoading && thumbs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">加载窗口缩略图中...</p>
        ) : thumbs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">没有可见窗口（未授予屏幕录制权限时也会为空）。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {thumbs.map((t) => {
              const monitored = isMonitored(t);
              return (
                <div
                  key={`${t.sourceId}-${t.windowId}`}
                  className={`group relative overflow-hidden rounded-lg border bg-black/40 transition-colors ${
                    t.isActive ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40" : "border-[var(--border)] hover:border-[var(--accent)]/60"
                  }`}
                >
                  <img src={t.thumbnail} alt={t.appName} className="aspect-video w-full object-contain" />
                  <div className="space-y-1 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{t.appName}</p>
                      {t.isActive && (
                        <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] text-white">活动</span>
                      )}
                    </div>
                    <p className="truncate text-[10px] text-[var(--text-muted)]">{t.windowTitle || "(无标题)"}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[var(--text-muted)]">{monitored ? "已监控" : "未监控"}</span>
                      <Toggle checked={monitored} onChange={() => void toggleWindow(t)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
