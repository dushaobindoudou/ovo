import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { OvoLogo } from "../shared/OvoLogo";

export function AboutPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">关于</h2>

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]">
            <OvoLogo size={32} />
          </div>
          <div>
            <h3 className="text-xl font-semibold">ovo</h3>
            <p className="text-sm text-[var(--text-secondary)]">主动式 AI 桌面助手</p>
            <p className="text-xs text-[var(--text-muted)]">v0.1.0 · macOS Phase 1</p>
          </div>
        </div>
      </Card>

      <Card title="功能特性">
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {[
            { icon: "📸", title: "屏幕捕获", desc: "定时截屏 + OCR 文字识别" },
            { icon: "🤖", title: "Agent 调度", desc: "多后端 AI Agent 调度" },
            { icon: "🧠", title: "知识图谱", desc: "SQLite 实体关系存储" },
            { icon: "📊", title: "Pipeline 日志", desc: "全链路日志追踪" },
          ].map((f) => (
            <li key={f.title} className="rounded-lg border border-[var(--border)] p-3">
              <p className="font-medium">{f.title}</p>
              <p className="text-xs text-[var(--text-secondary)]">{f.desc}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex gap-2">
          <GlowButton onClick={() => void window.nudgeAPI?.app.getVersion().then((v) => alert(`版本: ${v}`))}>
            查看版本
          </GlowButton>
        </div>
      </Card>
    </div>
  );
}
