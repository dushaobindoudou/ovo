import { useEffect, useMemo, useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { useWindows } from "../../hooks/useWindows";
import { useWindowStore } from "../../stores/windowStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useOCR } from "../../hooks/useOCR";
import { useCapture } from "../../hooks/useCapture";

export function WindowPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { refresh, setMonitored, getCaptureStats } = useWindows();
  const { windows, active } = useWindowStore();
  const { captureInterval, setCaptureInterval, monitoredWindows, setMonitoredWindows } = useSettingsStore();
  const { startCapture, stopCapture } = useOCR();
  const { getBuffers } = useCapture();
  const [buffers, setBuffers] = useState<
    Array<{ windowId: string; appName: string; entries: Array<{ timestamp: number; text: string }> }>
  >([]);
  const [captureStats, setCaptureStats] = useState<
    Array<{
      windowId: string; appName: string; windowTitle: string;
      lastSuccessAt: number; attempts: number; failures: number; failureRate: number;
    }>
  >([]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void getBuffers().then(setBuffers);
      void getCaptureStats().then(setCaptureStats);
    }, 3000);
    return () => clearInterval(timer);
  }, [getBuffers, getCaptureStats, refresh]);

  const monitoredSet = useMemo(() => new Set(monitoredWindows), [monitoredWindows]);
  const isMonitored = (item: { windowId: string; appName: string }) => {
    const legacy = `${item.windowId}::${item.appName}`;
    return monitoredSet.has(item.windowId) || monitoredSet.has(legacy);
  };
  const toggleWindow = async (item: { windowId: string; appName: string }) => {
    const legacy = `${item.windowId}::${item.appName}`;
    const on = isMonitored(item);
    const next = on ? monitoredWindows.filter((k) => k !== item.windowId && k !== legacy) : [...monitoredWindows.filter((k) => k !== legacy), item.windowId];
    setMonitoredWindows(next);
    await setMonitored(next);
  };

  const selectedWindow = useMemo(() => windows.find((w) => w.windowId === ctx?.selectedId), [windows, ctx?.selectedId]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">窗口管理</h2>

      {/* 活动窗口 */}
      <Card title="当前活动窗口">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[var(--accent)]" />
          <div>
            <p className="font-medium">{active ? active.appName : "暂无"}</p>
            <p className="text-sm text-[var(--text-secondary)]">{active ? active.windowTitle : "没有活动窗口"}</p>
          </div>
        </div>
      </Card>

      {/* 配置 */}
      <Card title="捕获配置">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">捕获间隔</span>
          <Select value={captureInterval} onChange={(event) => setCaptureInterval(Number(event.target.value))}>
            {[1, 3, 5, 10, 15, 30, 60].map((seconds) => (
              <option key={seconds} value={seconds}>{seconds} 秒</option>
            ))}
          </Select>
          <GlowButton onClick={() => startCapture(captureInterval)}>开始</GlowButton>
          <GlowButton onClick={() => stopCapture()}>停止</GlowButton>
          <GlowButton onClick={() => refresh()}>刷新</GlowButton>
        </div>
      </Card>

      {/* 选中窗口详情 */}
      {selectedWindow ? (
        <Card title={`窗口详情 — ${selectedWindow.appName}`}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>窗口标题</span>
              <span className="text-[var(--text-secondary)]">{selectedWindow.windowTitle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>是否监控</span>
              <Toggle checked={isMonitored(selectedWindow)} onChange={() => void toggleWindow(selectedWindow)} />
            </div>
          </div>
        </Card>
      ) : null}

      {/* 所有窗口列表 */}
      <Card title="所有窗口">
        <div className="space-y-2 text-sm">
          {windows.map((item) => {
            const rowKey = `${item.windowId}::${item.appName}`;
            return (
              <div key={rowKey} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                <div>
                  <p className="font-medium">{item.appName}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.windowTitle}</p>
                </div>
                <Toggle checked={isMonitored(item)} onChange={() => void toggleWindow(item)} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* 缓冲区 */}
      {buffers.length > 0 && (
        <Card title="捕获缓冲区">
          <div className="space-y-2 text-sm">
            {buffers.map((item) => (
              <div key={`${item.windowId}::${item.appName}`} className="rounded-lg border border-[var(--border)] px-3 py-2">
                <p className="font-medium">{item.appName}</p>
                <p className="text-xs text-[var(--text-secondary)]">待处理: {item.entries.length} 条</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 统计 */}
      {captureStats.length > 0 && (
        <Card title="捕获统计">
          <div className="space-y-2 text-sm">
            {captureStats.map((row) => (
              <div key={row.windowId} className="rounded-lg border border-[var(--border)] px-3 py-2">
                <p className="font-medium">{row.appName || row.windowId}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  最近: {row.lastSuccessAt ? new Date(row.lastSuccessAt).toLocaleTimeString() : "—"} · 尝试 {row.attempts} · 失败率 {(row.failureRate * 100).toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
