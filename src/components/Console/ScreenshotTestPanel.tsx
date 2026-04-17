import { useCallback, useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";

interface ScreenshotPreview {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  capturedAt: number;
}

export function ScreenshotTestPanel() {
  const [preview, setPreview] = useState<ScreenshotPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.nudgeAPI.capture.takeScreenshot();
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "截图失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void capture();
  }, [capture]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">截图测试</h2>

      <Card title="操作">
        <div className="flex flex-wrap items-center gap-3">
          <GlowButton onClick={() => void capture()} disabled={loading}>
            {loading ? "截图中..." : "立即截图"}
          </GlowButton>
          {preview ? (
            <span className="text-xs text-[var(--text-secondary)]">
              最近截图: {new Date(preview.capturedAt).toLocaleTimeString()} · {preview.mimeType} ·{" "}
              {(preview.byteLength / 1024).toFixed(1)} KB
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      </Card>

      <Card title="截图预览">
        {preview ? (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <img src={preview.dataUrl} alt="截图预览" className="block max-h-[70vh] w-full object-contain" />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">还没有截图结果。</p>
        )}
      </Card>
    </div>
  );
}
