import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";

export function AboutPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">关于</h2>
      <Card>
        <h3 className="text-xl font-semibold">ovo</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">主动式 AI 桌面助手</p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">v0.1.0 · macOS Phase 1</p>
        <ul className="mt-4 list-disc space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
          <li>屏幕捕获 + OCR</li>
          <li>多后端 Agent 调度</li>
          <li>知识图谱记忆</li>
          <li>Pipeline 全链路日志</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <GlowButton onClick={() => void window.nudgeAPI.app.getVersion().then((v) => alert(`版本: ${v}`))}>
            查看版本
          </GlowButton>
        </div>
      </Card>
    </div>
  );
}
