import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { OvoLogo } from "../shared/OvoLogo";
import { Camera, Bot, Brain, FileText, ShieldCheck, Eye, EyeOff, Lock } from "lucide-react";

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
            <h3 className="text-xl font-semibold">Ovo</h3>
            <p className="text-sm text-[var(--text-secondary)]">玻璃房子里的主动管家</p>
            <p className="text-xs text-[var(--text-muted)]">v0.2.0 · macOS</p>
          </div>
        </div>
      </Card>

      {/* N9: 隐私与用户协议 — 中国大陆发布 / App Store 合规必需 */}
      <Card title="隐私承诺">
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2.5">
            <Eye size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium">所有数据在本机处理</p>
              <p className="text-xs text-[var(--text-secondary)]">屏幕截图 / OCR 文本 / 知识图谱均存于你的 Mac，Ovo 不上传任何屏幕内容到自家服务器</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <EyeOff size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium">敏感信息自动脱敏</p>
              <p className="text-xs text-[var(--text-secondary)]">送 LLM 前自动擦除 API key / 卡号 / 身份证 / 私钥等。强度可在「设置 → 隐私」调整</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <Lock size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium">API key 加密存储</p>
              <p className="text-xs text-[var(--text-secondary)]">通过 macOS Keychain (safeStorage) 加密，渲染进程永远拿不到明文</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium">用户控制一切</p>
              <p className="text-xs text-[var(--text-secondary)]">可随时暂停观察 / 配置黑名单 / 设置数据保留期 / 一键删除所有数据</p>
            </div>
          </li>
        </ul>
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
          AI 调用：屏幕摘要（脱敏后）会发给你配置的云端 LLM（Claude / OpenAI / DeepSeek / OpenRouter / Groq）；可切到本地后端（Hermes / Claude Code）完全离线。
        </p>
      </Card>

      <Card title="功能特性">
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {[
            { icon: Camera, title: "屏幕感知", desc: "定时截屏 + Vision/Tesseract OCR" },
            { icon: Bot, title: "多后端 AI", desc: "Claude Code / OpenClaw / Hermes / API" },
            { icon: Brain, title: "知识图谱", desc: "SQLite 实体关系 + 人格画像" },
            { icon: FileText, title: "推理可追溯", desc: "每条建议完整因果链可查" },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.title} className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Icon size={16} />
                </div>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{f.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <div className="flex gap-2">
          <GlowButton onClick={() => void window.ovoAPI?.app.getVersion().then((v) => alert(`版本: ${v}`))}>
            查看版本
          </GlowButton>
        </div>
      </Card>
    </div>
  );
}
