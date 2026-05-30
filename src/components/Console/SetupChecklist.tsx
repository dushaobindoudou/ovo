/**
 * P0-1 首启 Setup Checklist —— 一站式启动自检。
 *
 * 北极星：用户首次启动 5 分钟内能清楚知道 Ovo 能不能工作、卡在哪、下一步点哪里。
 *
 * 聚合 4 类信号：
 *   ① 屏幕录制权限（usePermissions）
 *   ② 截图 / OCR + 活动窗口识别（useHealth.getLatest → CaptureHealthCheck）
 *   ③ AI 后端可用 + 配置有效（agent.status）
 *   ④ 自动化权限（提醒 / 日历 / 邮件）—— 按需，首次用到时系统会请求，这里只做告知
 *
 * 任一关键项失败 → 显示「是什么 + 为什么 + 下一步点哪里」。
 * 全部关键项通过 → 折叠成「可以开始使用」，用户可一键收起（localStorage 记住）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, Circle, ShieldAlert, Cpu, ScanText, Eye, Bell, ChevronUp
} from "lucide-react";
import { Card } from "../shared/Card";
import { GlowButton } from "../shared/GlowButton";
import { usePermissions } from "../../hooks/usePermissions";
import { useHealth } from "../../hooks/useHealth";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;
const DONE_KEY = "ovo.setup-checklist.collapsed";

type ItemStatus = "pass" | "fail" | "checking" | "neutral";

interface ChecklistItem {
  key: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  /** 通过 / 进行中时的说明（是什么） */
  detail: string;
  /** 失败时：为什么 + 下一步 */
  why?: string;
  status: ItemStatus;
  action?: { label: string; run: () => void | Promise<void> };
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === "pass") return <CheckCircle2 size={15} className="shrink-0 text-[var(--success,#22c55e)]" />;
  if (status === "fail") return <XCircle size={15} className="shrink-0 text-[var(--warning,#f59e0b)]" />;
  if (status === "checking") return <Loader2 size={15} className="shrink-0 animate-spin text-[var(--text-muted)]" />;
  return <Circle size={15} className="shrink-0 text-[var(--text-muted)]" />;
}

export function SetupChecklist() {
  const { loaded, isGranted, isNotAvailable, requestScreenRecording, checkStatus } = usePermissions();
  const { getLatest, onUpdate } = useHealth();

  const [health, setHealth] = useState<Awaited<ReturnType<typeof getLatest>>>(null);
  const [agent, setAgent] = useState<{ availableBackends?: string[]; current?: string | null } | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return false; }
  });

  const refreshAgent = useCallback(async () => {
    if (!isElectron) return;
    setLoadingAgent(true);
    try { setAgent(await window.ovoAPI.agent.status()); }
    catch { setAgent(null); }
    finally { setLoadingAgent(false); }
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    void getLatest().then(setHealth);
    void refreshAgent();
    const off = onUpdate((p) => setHealth(p));
    const t = setInterval(() => { void getLatest().then(setHealth); }, 8000);
    return () => { off?.(); clearInterval(t); };
  }, [getLatest, onUpdate, refreshAgent]);

  const screenState: ItemStatus = !loaded
    ? "checking"
    : isNotAvailable("screenRecording")
    ? "neutral"
    : isGranted("screenRecording")
    ? "pass"
    : "fail";

  const captureState: ItemStatus = screenState === "fail"
    ? "fail"
    : !health
    ? "checking"
    : health.ok
    ? "pass"
    : "fail";

  const windowState: ItemStatus = !health ? "checking" : health.appName ? "pass" : (health.ok ? "pass" : "checking");

  const backendOk = !!agent && (agent.availableBackends?.length ?? 0) > 0 && !!agent.current;
  const backendState: ItemStatus = loadingAgent ? "checking" : backendOk ? "pass" : "fail";

  const items: ChecklistItem[] = useMemo(() => {
    const list: ChecklistItem[] = [];

    list.push({
      key: "screen",
      icon: ShieldAlert,
      label: "屏幕录制权限",
      detail: screenState === "neutral" ? "当前平台无需此权限" : "Ovo 通过它看到你的屏幕来理解上下文",
      status: screenState,
      why: "未授权 → Ovo 看不到任何屏幕内容，无法工作。到「系统设置 → 隐私与安全性 → 屏幕录制」勾选 Ovo。",
      action: screenState === "fail"
        ? { label: "去授权", run: async () => { await requestScreenRecording(); await checkStatus(); } }
        : undefined
    });

    list.push({
      key: "capture",
      icon: ScanText,
      label: "截图 / OCR 可用",
      detail: health?.ok
        ? `最近一次识别置信度 ${Math.round((health.confidence ?? 0))}%，文本 ${health.textLength ?? 0} 字`
        : "截屏并提取屏幕文字",
      status: captureState,
      why: screenState === "fail"
        ? "先授予屏幕录制权限，截图/OCR 才能开始。"
        : `自检失败：${health?.error ?? "暂时拿不到可截图的窗口"}。请确认屏幕上有可见的应用窗口。`
    });

    list.push({
      key: "window",
      icon: Eye,
      label: "活动窗口识别",
      detail: health?.appName ? `正在看：${health.appName}` : "识别你当前在用哪个 App",
      status: windowState,
      why: "暂时识别不到活动窗口，切换到任意应用窗口后会自动恢复。"
    });

    list.push({
      key: "backend",
      icon: Cpu,
      label: "AI 后端可用",
      detail: backendOk
        ? `当前后端：${agent?.current}${(agent?.availableBackends?.length ?? 0) > 1 ? `（共 ${agent?.availableBackends?.length} 个可用）` : ""}`
        : "把屏幕内容变成理解和建议的大脑",
      status: backendState,
      why: "没有检测到可用 AI 后端。默认用 hermes（无需 API Key）；或到「设置 → AI 后端」配置 API Key。配好后点重新检测。",
      action: !backendOk && !loadingAgent
        ? { label: "重新检测", run: async () => { await window.ovoAPI.agent.detectBackends(); await refreshAgent(); } }
        : undefined
    });

    list.push({
      key: "automation",
      icon: Bell,
      label: "自动化权限（提醒 / 日历 / 邮件）",
      detail: "按需：第一次让 Ovo 写提醒或发邮件时，macOS 会弹窗请求授权",
      status: "neutral"
    });

    return list;
  }, [screenState, captureState, windowState, backendState, backendOk, loadingAgent, health, agent, requestScreenRecording, checkStatus, refreshAgent]);

  // 关键项：屏幕（除非平台不需要）、截图/OCR、AI 后端
  const criticalKeys = ["screen", "capture", "backend"];
  const allReady = items
    .filter((i) => criticalKeys.includes(i.key))
    .every((i) => i.status === "pass" || i.status === "neutral");

  // 全部就绪且用户已收起 → 不再占位
  if (!isElectron) return null;
  if (allReady && collapsed) return null;

  const collapse = () => {
    try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
    setCollapsed(true);
  };

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {allReady
            ? <CheckCircle2 size={15} className="text-[var(--success,#22c55e)]" />
            : <Loader2 size={15} className="animate-spin text-[var(--accent)]" />}
          <p className="text-sm font-semibold">
            {allReady ? "Ovo 已就绪，可以开始使用" : "启动自检"}
          </p>
        </div>
        {allReady && (
          <button
            type="button"
            onClick={collapse}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <ChevronUp size={12} /> 收起
          </button>
        )}
      </div>

      {!allReady && (
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          逐项确认 Ovo 能不能工作。卡住的项会告诉你原因和下一步。
        </p>
      )}

      <ul className="space-y-1.5">
        {items.map((it) => {
          const Icon = it.icon;
          const showWhy = it.status === "fail" && it.why;
          return (
            <li
              key={it.key}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2"
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={it.status} />
                <Icon size={13} className="shrink-0 text-[var(--text-muted)]" />
                <span className="flex-1 text-[12px] font-medium">{it.label}</span>
                {it.action && (
                  <GlowButton onClick={() => void it.action!.run()} className="px-2 py-0.5 text-[11px]">
                    {it.action.label}
                  </GlowButton>
                )}
              </div>
              <p className={`mt-0.5 pl-[26px] text-[10.5px] ${showWhy ? "text-[var(--warning,#f59e0b)]" : "text-[var(--text-muted)]"}`}>
                {showWhy ? it.why : it.detail}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
