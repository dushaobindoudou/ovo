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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      label: t("setupChecklist.screenLabel"),
      detail: screenState === "neutral" ? t("setupChecklist.screenDetailNa") : t("setupChecklist.screenDetail"),
      status: screenState,
      why: t("setupChecklist.screenWhy"),
      action: screenState === "fail"
        ? { label: t("setupChecklist.screenAction"), run: async () => { await requestScreenRecording(); await checkStatus(); } }
        : undefined
    });

    list.push({
      key: "capture",
      icon: ScanText,
      label: t("setupChecklist.captureLabel"),
      detail: health?.ok
        ? t("setupChecklist.captureDetailOk", { conf: Math.round(health.confidence ?? 0), len: health.textLength ?? 0 })
        : t("setupChecklist.captureDetail"),
      status: captureState,
      why: screenState === "fail"
        ? t("setupChecklist.captureWhyScreen")
        : t("setupChecklist.captureWhy", { err: health?.error ?? "—" })
    });

    list.push({
      key: "window",
      icon: Eye,
      label: t("setupChecklist.windowLabel"),
      detail: health?.appName ? t("setupChecklist.windowDetailWatching", { app: health.appName }) : t("setupChecklist.windowDetail"),
      status: windowState,
      why: t("setupChecklist.windowWhy")
    });

    const backendCount = agent?.availableBackends?.length ?? 0;
    list.push({
      key: "backend",
      icon: Cpu,
      label: t("setupChecklist.backendLabel"),
      detail: backendOk
        ? (backendCount > 1
            ? t("setupChecklist.backendDetailOkMulti", { cur: agent?.current, n: backendCount })
            : t("setupChecklist.backendDetailOk", { cur: agent?.current }))
        : t("setupChecklist.backendDetail"),
      status: backendState,
      why: t("setupChecklist.backendWhy"),
      action: !backendOk && !loadingAgent
        ? { label: t("setupChecklist.backendAction"), run: async () => { await window.ovoAPI.agent.detectBackends(); await refreshAgent(); } }
        : undefined
    });

    list.push({
      key: "automation",
      icon: Bell,
      label: t("setupChecklist.automationLabel"),
      detail: t("setupChecklist.automationDetail"),
      status: "neutral"
    });

    return list;
  }, [t, screenState, captureState, windowState, backendState, backendOk, loadingAgent, health, agent, requestScreenRecording, checkStatus, refreshAgent]);

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
            {allReady ? t("setupChecklist.ready") : t("setupChecklist.title")}
          </p>
        </div>
        {allReady && (
          <button
            type="button"
            onClick={collapse}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <ChevronUp size={12} /> {t("setupChecklist.collapse")}
          </button>
        )}
      </div>

      {!allReady && (
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          {t("setupChecklist.subtitle")}
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
