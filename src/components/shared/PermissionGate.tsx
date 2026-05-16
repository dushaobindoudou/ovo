import { useEffect, useState } from "react";
import { ShieldAlert, ExternalLink, RefreshCcw, X } from "lucide-react";
import { GlowButton } from "./GlowButton";
import { usePermissions } from "../../hooks/usePermissions";

const DISMISS_KEY = "ovo.permission-banner.dismissedAt";
const DISMISS_MS = 1000 * 60 * 30; // 30 分钟内不再弹

/**
 * 屏幕录制权限全局引导。
 * - 当 `screenRecordingMissing` 为 true 时，在控制台顶部展示引导条
 * - 用户可临时关闭（30 分钟）或直接跳转系统设置
 * - 提供"我已授权 → 重新检查"让用户确认后立即刷新
 * - 首次进入应用（且权限缺失）时展示一次性教学弹窗
 */
export function PermissionGate() {
  const { loaded, screenRecordingMissing, status, openSettings, checkStatus, requestScreenRecording, runtimeDiagnostic } = usePermissions();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (!ts) return false;
      return Date.now() - Number(ts) < DISMISS_MS;
    } catch { return false; }
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (!screenRecordingMissing) return;
    // 首次运行（从未 dismiss 过）时弹出完整教学
    try {
      const everSeen = localStorage.getItem("ovo.permission-onboarding.seen");
      if (!everSeen) {
        setShowOnboarding(true);
        localStorage.setItem("ovo.permission-onboarding.seen", String(Date.now()));
      }
    } catch { /* ignore */ }
  }, [loaded, screenRecordingMissing]);

  if (!loaded) return null;
  if (!screenRecordingMissing && !runtimeDiagnostic) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      const ok = await requestScreenRecording();
      // 首次调用 macOS 会弹原生提示，用户允许后系统会要求重启应用
      if (!ok) {
        // 未授予：直接打开系统设置
        openSettings("screen");
      }
    } finally {
      setRequesting(false);
    }
  };

  const statusText = (() => {
    const v = status.screenRecording;
    if (v === "denied") return "已拒绝（需要前往系统设置手动开启）";
    if (v === "not-determined") return "未设定（点击下方按钮触发授权提示）";
    if (v === "restricted") return "受限制（由系统管理员策略限制）";
    return "未知，请尝试重新检查";
  })();

  return (
    <>
      {!dismissed && runtimeDiagnostic && (
        <div className="border-b border-[var(--danger)]/30 bg-[var(--danger)]/8 px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--danger)]/15 text-[var(--danger)]">
              <ShieldAlert size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                运行时自检异常（可能启动了旧版 ovo）
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {runtimeDiagnostic.message}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <GlowButton
                onClick={() => openSettings("screen")}
                className="!py-1.5 !text-xs"
              >
                打开系统设置
              </GlowButton>
              <button
                type="button"
                onClick={handleDismiss}
                title="稍后再说"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!dismissed && screenRecordingMissing && (
        <div className="border-b border-[var(--warning)]/30 bg-[var(--warning)]/8 px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--warning)]/15 text-[var(--warning)]">
              <ShieldAlert size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                ovo 需要 <span className="text-[var(--warning)]">屏幕录制</span> 权限
              </p>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                当前状态：{statusText} · 未授权时截图与 OCR 将无法工作
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void checkStatus()}
                title="重新检查"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <RefreshCcw size={14} />
              </button>
              <GlowButton
                onClick={() => openSettings("screen")}
                className="!py-1.5 !text-xs"
              >
                前往系统设置
              </GlowButton>
              <button
                type="button"
                onClick={handleDismiss}
                title="稍后再说"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-lg)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">欢迎使用 ovo</h3>
                <p className="text-xs text-[var(--text-secondary)]">在开始之前，ovo 需要一项系统权限</p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl bg-[var(--bg-base)] p-4 text-sm">
              <p className="font-medium text-[var(--text-primary)]">为什么需要屏幕录制？</p>
              <p className="text-[var(--text-secondary)]">
                ovo 作为主动式助手，会定时对屏幕截图并通过 OCR 理解上下文，从而给出与场景相关的建议。
                <strong className="text-[var(--text-primary)]">所有数据均在本机处理，不上传任何服务器</strong>。
              </p>
              <ol className="ml-4 list-decimal space-y-1 text-xs text-[var(--text-secondary)]">
                <li>点击下方"触发系统授权提示"，macOS 将弹出授权请求</li>
                <li>若已被拒绝过，则点击"打开系统设置"，手动开启"屏幕录制 · ovo"</li>
                <li>首次授权后可能需要<strong className="text-[var(--warning)]">退出并重新启动 ovo</strong>才能生效</li>
              </ol>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <GlowButton onClick={() => void handleRequestAccess()} disabled={requesting}>
                {requesting ? "请求中..." : "触发系统授权提示"}
              </GlowButton>
              <button
                type="button"
                onClick={() => openSettings("screen")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                <ExternalLink size={14} />
                打开系统设置
              </button>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="ml-auto rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                稍后再说
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
