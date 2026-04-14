import { useEffect, useMemo, useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { useWindows } from "../../hooks/useWindows";
import { useWindowStore } from "../../stores/windowStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useOCR } from "../../hooks/useOCR";

export function WindowPanel() {
  const { refresh, setMonitored } = useWindows();
  const { windows, active } = useWindowStore();
  const { captureInterval, setCaptureInterval, monitoredWindows, setMonitoredWindows, simulationMode } =
    useSettingsStore();
  const { startCapture, stopCapture } = useOCR();
  const [buffers, setBuffers] = useState<Array<{ appName: string; entries: Array<{ timestamp: number; text: string }> }>>([]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void window.nudgeAPI.capture.getBuffers().then(setBuffers);
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const monitoredSet = useMemo(() => new Set(monitoredWindows), [monitoredWindows]);

  const toggleWindow = async (windowKey: string) => {
    const next = monitoredSet.has(windowKey)
      ? monitoredWindows.filter((item) => item !== windowKey)
      : [...monitoredWindows, windowKey];
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
          {simulationMode ? <span className="text-xs text-amber-300">模拟模式已开启</span> : null}
        </div>
      </Card>

      <Card title="所有窗口">
        <div className="space-y-2 text-sm">
          {windows.map((item) => {
            const key = `${item.windowId}::${item.appName}`;
            return (
              <div key={key} className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
                <div>
                  <p>{item.appName}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.windowTitle}</p>
                </div>
                <Toggle checked={monitoredSet.has(key)} onChange={() => void toggleWindow(key)} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="捕获缓冲区">
        <div className="space-y-2 text-sm">
          {buffers.length === 0 ? <p className="text-[var(--text-secondary)]">暂无待处理数据</p> : null}
          {buffers.map((item) => (
            <div key={item.appName} className="rounded border border-white/10 px-3 py-2">
              <p>{item.appName}</p>
              <p className="text-xs text-[var(--text-secondary)]">待处理: {item.entries.length} 条</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
