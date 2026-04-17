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

export function WindowPanel() {
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
      windowId: string;
      appName: string;
      windowTitle: string;
      lastSuccessAt: number;
      attempts: number;
      failures: number;
      failureRate: number;
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
    const next = on
      ? monitoredWindows.filter((k) => k !== item.windowId && k !== legacy)
      : [...monitoredWindows.filter((k) => k !== legacy), item.windowId];
    setMonitoredWindows(next);
    await setMonitored(next);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">窗口管理</h2>
      <Card title="当前活动窗口">
        <p className="text-sm">{active ? `${active.appName} - ${active.windowTitle}` : "暂无"}</p>
      </Card>

      <Card title="监控配置">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">捕获间隔</span>
          <Select
            value={captureInterval}
            onChange={(event) => setCaptureInterval(Number(event.target.value))}
          >
            {[1, 3, 5, 10, 15, 30, 60].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} 秒
              </option>
            ))}
          </Select>
          <GlowButton onClick={() => startCapture(captureInterval)}>开始</GlowButton>
          <GlowButton onClick={() => stopCapture()}>停止</GlowButton>
          <GlowButton onClick={() => refresh()}>刷新窗口</GlowButton>
        </div>
      </Card>

      <Card title="所有窗口">
        <div className="space-y-2 text-sm">
          {windows.map((item) => {
            const rowKey = `${item.windowId}::${item.appName}`;
            return (
              <div key={rowKey} className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
                <div>
                  <p>{item.appName}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.windowTitle}</p>
                </div>
                <Toggle checked={isMonitored(item)} onChange={() => void toggleWindow(item)} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="捕获缓冲区">
        <div className="space-y-2 text-sm">
          {buffers.length === 0 ? <p className="text-[var(--text-secondary)]">暂无待处理数据</p> : null}
          {buffers.map((item) => (
            <div key={`${item.windowId}::${item.appName}`} className="rounded border border-white/10 px-3 py-2">
              <p>{item.appName}</p>
              <p className="text-xs text-[var(--text-secondary)]">待处理: {item.entries.length} 条</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="监听窗口捕获统计">
        <p className="mb-2 text-xs text-[var(--text-secondary)]">
          最近成功时间、尝试次数与失败率（活动 + 监听并行通道）。
        </p>
        <div className="space-y-2 text-sm">
          {captureStats.length === 0 ? <p className="text-[var(--text-secondary)]">暂无统计</p> : null}
          {captureStats.map((row) => (
            <div key={row.windowId} className="rounded border border-white/10 px-3 py-2">
              <p>
                {row.appName || row.windowId}
                {row.windowTitle ? (
                  <span className="text-xs text-[var(--text-secondary)]"> — {row.windowTitle}</span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                最近捕获:{" "}
                {row.lastSuccessAt ? new Date(row.lastSuccessAt).toLocaleTimeString() : "—"} · 尝试 {row.attempts} ·
                失败率 {(row.failureRate * 100).toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
