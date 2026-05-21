/**
 * F4-A: 流程 tab —— 动态进度条版（每行一个完整推断）
 *
 * 设计原则：
 *  · 每行一次推断，进度段数 = 真实跑了几段（1-5+ 段，不是固定 4 段）
 *  · 文案中性人话：不出现"ovo 怎么样"
 *  · 展开 4 段 section：看屏幕 / 理解 / 执行 / 记忆 / 补关系
 *  · F4-C: 理解段可看到完整 prompt + LLM 原始返回
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../shared/Card";
import { ChevronDown, ChevronRight, AlertTriangle, Eye, EyeOff, Camera, Brain, Lightbulb, Zap, BookOpen, GitBranch, ChevronUp, ChevronDown as ChevronDown2, X as XIcon } from "lucide-react";
import { ActionHistoryPanel } from "./ActionHistoryPanel";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

type StageStatus = "done" | "failed" | "skipped" | "pending";

interface Phase {
  key: string;
  label: string;
  status: StageStatus;
  brief: string;
  durationMs?: number;
}

interface PipelineRow {
  id: string;
  timestamp: number;
  duration: number;
  status: "completed" | "failed" | "running";
  appName: string;
  windowTitle: string;
  summary: string;
  phases: Phase[];
  detail: {
    capture: { ocrPreview: string; charCount: number; appName: string; windowTitle: string };
    understand: {
      intent: string; prediction: string; role: string; roleConfidence: number;
      latentIntent: string; risk: string; offerCount: number; suggestionCount: number; durationSec: number;
      promptPreview: string; rawResponse: string;
    };
    act: { executed: number; pending: number; items: Array<{ description: string; status: string; output: string }> };
    remember: { newEntities: number; newRelationships: number; topEntityNames: string[] };
    relate: { added: number; reinforced: number; durationMs: number };
  };
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "<1 秒";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`;
  return `${Math.floor(ms / 60_000)} 分 ${Math.floor((ms % 60_000) / 1000)} 秒`;
}

const DOT_BY_STATUS: Record<StageStatus, string> = {
  done: "bg-[var(--accent)] border-[var(--accent)]",
  failed: "bg-[var(--danger)] border-[var(--danger)]",
  skipped: "bg-[var(--text-muted)]/40 border-[var(--text-muted)]/40",
  pending: "bg-transparent border-[var(--border)]"
};
const LINE_BY_STATUS: Record<StageStatus, string> = {
  done: "bg-[var(--accent)]",
  failed: "bg-[var(--danger)]",
  skipped: "bg-[var(--border)]",
  pending: "bg-[var(--border)]"
};

type ProcessView = "actions" | "replay";

interface ProcessPanelCtx {
  selectedId: string | null;
  pendingOpenActionId?: string | null;
  consumeOpenAction?: () => void;
}

export function ProcessPanel({ ctx }: { ctx?: ProcessPanelCtx }) {
  const { t } = useTranslation();
  const [view, setView] = useState<ProcessView>("actions");
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!isElectron) return;
    if (view !== "replay") return;
    const fetchData = () => {
      void window.ovoAPI.process.getPipelines(50).then((rows) => setPipelines((rows ?? []) as PipelineRow[]));
    };
    fetchData();
    const t = setInterval(fetchData, 5000);
    const t2 = setInterval(() => tick((n) => n + 1), 1000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [view]);

  useEffect(() => {
    if (ctx?.selectedId && !ctx.selectedId.startsWith("_")) {
      setExpandedId(ctx.selectedId);
      setView("replay");
    }
  }, [ctx?.selectedId]);

  // A: OverviewPanel "查看详情" 跨 tab 跳转时强制切到 actions 视图
  useEffect(() => {
    if (ctx?.pendingOpenActionId) setView("actions");
  }, [ctx?.pendingOpenActionId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-md bg-[var(--bg-card)] p-1 w-fit">
        <ViewTab label={t("process.tabActions")} active={view === "actions"} onClick={() => setView("actions")} />
        <ViewTab label={t("process.tabReplay")} active={view === "replay"} onClick={() => setView("replay")} />
      </div>

      {view === "actions" ? (
        <ActionHistoryPanel
          initialActionId={ctx?.pendingOpenActionId ?? null}
          onConsumeInitial={ctx?.consumeOpenAction}
        />
      ) : (
        <ReplayView
          pipelines={pipelines}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
        />
      )}
    </div>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 text-[12px] transition-colors ${
        active
          ? "bg-[var(--bg-content)] font-medium text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}

function ReplayView({
  pipelines, expandedId, onToggle
}: { pipelines: PipelineRow[]; expandedId: string | null; onToggle: (id: string) => void }) {
  const { t } = useTranslation();
  // U1 用户反馈：inline 展开让卡片变形难扫读。改成 drawer 模式：
  //   - 列表项极简（标题 + 时间 + 状态 dot），点击 → drawer 滑入
  //   - drawer 带"上一条 / 下一条"导航，不打断列表 scroll 上下文
  void expandedId; void onToggle; // 旧 inline API 暂留参数兼容，本视图不再用
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdx = useMemo(
    () => pipelines.findIndex((p) => p.id === activeId),
    [pipelines, activeId]
  );
  const active = activeIdx >= 0 ? pipelines[activeIdx] : null;
  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx >= 0 && activeIdx < pipelines.length - 1;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t("process.replayTitle")}</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {t("process.replaySubtitle")}
        </p>
      </div>

      {pipelines.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t("process.emptyTitle")}</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("process.emptyHint")}</p>
          </div>
        </Card>
      ) : (
        <ul className="divide-y divide-[var(--border-light)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          {pipelines.map((p) => (
            <PipelineRowCompact
              key={p.id}
              pipeline={p}
              onClick={() => setActiveId(p.id)}
            />
          ))}
        </ul>
      )}

      {/* U1 drawer — 右侧滑入，覆盖式但带上下条导航 */}
      {active && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          style={{ zIndex: 400 }}
          onClick={() => setActiveId(null)}
        >
          <aside
            className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col bg-[var(--bg-card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* drawer 头部：上一条 / 下一条 / 关闭 */}
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => hasPrev && setActiveId(pipelines[activeIdx - 1].id)}
                  className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-30"
                  title={t("process.prevNewer")}
                  aria-label={t("process.prev")}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => hasNext && setActiveId(pipelines[activeIdx + 1].id)}
                  className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-30"
                  title={t("process.nextOlder")}
                  aria-label={t("process.next")}
                >
                  <ChevronDown2 size={14} />
                </button>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {activeIdx + 1} / {pipelines.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{active.summary}</p>
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                  aria-label={t("process.close")}
                >
                  <XIcon size={14} />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <PipelineDetailView pipeline={active} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** U1 极简列表行 — 不再 inline 展开，点击触发 drawer */
function PipelineRowCompact({ pipeline, onClick }: { pipeline: PipelineRow; onClick: () => void }) {
  const isFailed = pipeline.status === "failed";
  const hasRisk = pipeline.detail.understand.risk === "high" || pipeline.detail.understand.risk === "critical";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-card-hover)]"
      >
        {/* 状态 dot */}
        <div className={`h-2 w-2 shrink-0 rounded-full ${
          isFailed ? "bg-[var(--danger)]" :
          hasRisk ? "bg-[var(--warning)]" :
          "bg-[var(--success)]"
        }`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{pipeline.summary}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            {formatRelative(pipeline.timestamp)} · 用时 {formatDuration(pipeline.duration)}
            {isFailed && <span className="ml-1 text-[var(--danger)]">· 失败</span>}
            {hasRisk && <span className="ml-1 text-[var(--warning)]">· 风险</span>}
          </p>
        </div>
        <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />
      </button>
    </li>
  );
}

// U1 重构后已不再使用 — PipelineRowCompact 替代了 inline 展开模式
// 保留函数定义但 eslint-disable，给可能的回滚保留 fallback。下次清理周期可删
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PipelineProgressRow({
  pipeline, expanded, onToggle
}: { pipeline: PipelineRow; expanded: boolean; onToggle: () => void }) {
  const isFailed = pipeline.status === "failed";
  const hasRisk = pipeline.detail.understand.risk === "high" || pipeline.detail.understand.risk === "critical";

  return (
    <div
      className={`rounded-lg border transition-colors ${
        expanded ? "border-[var(--accent)]/50 bg-[var(--bg-card)]" : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/30"
      }`}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="shrink-0 text-[var(--text-muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {/* 动态进度条：N 段 */}
        <div className="flex shrink-0 items-center">
          {pipeline.phases.map((phase, idx) => (
            <div key={phase.key} className="flex items-center" title={`${phase.label} · ${phase.brief}`}>
              <div className="flex flex-col items-center">
                <div className={`h-2.5 w-2.5 rounded-full border ${DOT_BY_STATUS[phase.status]}`} />
                <span className="mt-1 max-w-[80px] truncate text-[9px] text-[var(--text-muted)]">{phase.label}</span>
              </div>
              {idx < pipeline.phases.length - 1 && (
                <div className={`mx-1.5 h-[2px] w-6 -translate-y-1.5 ${LINE_BY_STATUS[phase.status]}`} />
              )}
            </div>
          ))}
        </div>

        <div className="ml-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {hasRisk && <AlertTriangle size={12} className="shrink-0 text-[var(--danger)]" />}
            {isFailed && <span className="shrink-0 rounded bg-[var(--danger)]/15 px-1.5 py-0.5 text-[9px] text-[var(--danger)]">失败</span>}
            <p className="truncate text-sm">{pipeline.summary}</p>
          </div>
        </div>

        <div className="shrink-0 text-right text-[10px] text-[var(--text-muted)]">
          <div>{formatRelative(pipeline.timestamp)}</div>
          <div className="mt-0.5">用时 {formatDuration(pipeline.duration)}</div>
        </div>
      </button>

      {expanded && <PipelineDetailView pipeline={pipeline} />}
    </div>
  );
}

function PipelineDetailView({ pipeline }: { pipeline: PipelineRow }) {
  const { t } = useTranslation();
  const { detail, status, timestamp } = pipeline;
  const u = detail.understand;
  const a = detail.act;
  const r = detail.remember;
  const c = detail.capture;
  const rel = detail.relate;

  const [showFullOcr, setShowFullOcr] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // 三段：① 看到了什么 ② 给 AI 的内容 ③ AI 决策（动作/记忆/关系）
  return (
    <div className="space-y-3 border-t border-[var(--border)] p-4">
      {/* ① 看到了什么 */}
      <PipelineSection Icon={Camera} title={t("process.sectionSaw")} tint="info">
        <div className="space-y-1.5 text-[13px] leading-relaxed">
          <p>
            <span className="text-[var(--text-muted)]">{t("process.sawAt", { time: formatRelative(timestamp) })}</span>
            <span className="font-medium">{c.appName || t("process.screenFallback")}</span>
            {c.windowTitle && <span className="text-[var(--text-muted)]"> · {c.windowTitle}</span>}
          </p>
          {c.charCount > 0 ? (
            <div className="space-y-1">
              <p className="text-[var(--text-muted)]">
                {t("process.ocrCapturedPre")}<span className="text-[var(--text-secondary)]">{c.charCount}</span>{t("process.ocrCapturedUnit")}
                {c.ocrPreview && c.charCount > c.ocrPreview.length && (
                  <span>{t("process.ocrPreviewNote", { n: c.ocrPreview.length })}</span>
                )}
              </p>
              {c.ocrPreview && (
                <button
                  type="button"
                  onClick={() => setShowFullOcr((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  {showFullOcr ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showFullOcr ? t("process.ocrCollapse") : t("process.ocrExpand")}
                </button>
              )}
              {showFullOcr && c.ocrPreview && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                  {c.ocrPreview}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-[var(--text-muted)]">{t("process.ocrNone")}</p>
          )}
        </div>
      </PipelineSection>

      {/* ② 进 AI 的内容 + AI 输出原文（透明日志） */}
      {(u.promptPreview || u.rawResponse) && (
        <PipelineSection Icon={Brain} title={t("process.sectionPrompt")} tint="ai">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {showRaw ? <EyeOff size={11} /> : <Eye size={11} />}
            {showRaw ? t("process.promptCollapse") : t("process.promptExpand")}
          </button>
          {showRaw && (
            <div className="mt-2 space-y-2">
              {u.promptPreview && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t("process.promptToAi")}</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">{u.promptPreview}</pre>
                </div>
              )}
              {u.rawResponse && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t("process.aiReply")}</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">{u.rawResponse}</pre>
                </div>
              )}
            </div>
          )}
        </PipelineSection>
      )}

      {/* ③ AI 决策：意图 / 角色 / 动作 / 记忆 */}
      <PipelineSection Icon={Lightbulb} title={t("process.sectionJudge")} tint="accent">
        <div className="space-y-1.5 text-[13px] leading-relaxed">
          {status === "failed" && !u.intent && (
            <p className="text-[var(--danger)]">{t("process.understandFailed")}</p>
          )}
          {u.intent && (
            <p>
              <span className="text-[var(--text-muted)]">{t("process.thinkYouDoing")}</span>
              <span className="font-medium">{u.intent}</span>
            </p>
          )}
          {u.role && (
            <p>
              <span className="text-[var(--text-muted)]">{t("process.thinkYouAre")}</span>
              <span className="font-medium">{u.role}</span>
              {u.roleConfidence > 0 && (
                <span className="text-[var(--text-muted)]">{t("process.confidencePct", { n: (u.roleConfidence * 100).toFixed(0) })}</span>
              )}
            </p>
          )}
          {u.latentIntent && (
            <p>
              <span className="text-[var(--text-muted)]">{t("process.longGoal")}</span>
              <span>{u.latentIntent}</span>
            </p>
          )}
          {u.prediction && (
            <p>
              <span className="text-[var(--text-muted)]">{t("process.guessNext")}</span>
              <span>{u.prediction}</span>
            </p>
          )}
          {u.risk && u.risk !== "none" && (
            <p className={`flex items-center gap-1.5 ${u.risk === "high" || u.risk === "critical" ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>
              <AlertTriangle size={12} className="shrink-0" />
              {({ low: t("process.riskLow"), medium: t("process.riskMedium"), high: t("process.riskHigh"), critical: t("process.riskCritical") } as Record<string, string>)[u.risk] ?? t("process.riskOther", { risk: u.risk })}
            </p>
          )}
          {(a.executed > 0 || a.pending > 0) && (
            <p className="flex items-start gap-1.5">
              <Zap size={12} className="mt-1 shrink-0 text-[var(--text-muted)]" />
              <span>
                {a.executed > 0 && <span className="text-[var(--text-muted)]">{t("process.doneActions", { n: a.executed })}</span>}
                {a.executed > 0 && a.pending > 0 && <span className="text-[var(--text-muted)]">{t("process.comma")}</span>}
                {a.pending > 0 && <span className="text-[var(--text-muted)]">{t("process.pendingConfirm", { n: a.pending })}</span>}
                {a.items.length > 0 && (
                  <span className="text-[var(--text-muted)]">: {a.items.slice(0, 3).map((it) => `${it.status} ${it.description}`).join("；")}</span>
                )}
              </span>
            </p>
          )}
          {(u.offerCount > 0 || u.suggestionCount > 0) && (
            <p className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <Lightbulb size={12} className="shrink-0" />
              <span>
                {u.offerCount > 0 && t("process.offerLong", { n: u.offerCount })}
                {u.offerCount > 0 && u.suggestionCount > 0 && t("process.comma")}
                {u.suggestionCount > 0 && t("process.suggSmall", { n: u.suggestionCount })}
              </span>
            </p>
          )}
          {(r.newEntities > 0 || r.newRelationships > 0) && (
            <p className="flex items-center gap-1.5">
              <BookOpen size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span>
                <span className="text-[var(--text-muted)]">{t("process.recordedPre")}</span>
                {r.newEntities > 0 && t("process.newConcepts", { n: r.newEntities })}
                {r.newEntities > 0 && r.newRelationships > 0 && " / "}
                {r.newRelationships > 0 && t("process.newRelations", { n: r.newRelationships })}
              </span>
            </p>
          )}
          {(rel.added > 0 || rel.reinforced > 0) && (
            <p className="flex items-center gap-1.5">
              <GitBranch size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span>
                <span className="text-[var(--text-muted)]">{t("process.relatePre")}</span>
                {rel.added > 0 && <span>{t("process.relNew", { n: rel.added })}</span>}
                {rel.added > 0 && rel.reinforced > 0 && " / "}
                {rel.reinforced > 0 && <span>{t("process.relReinforced", { n: rel.reinforced })}</span>}
              </span>
            </p>
          )}
        </div>
      </PipelineSection>
    </div>
  );
}

function PipelineSection({
  Icon, title, tint, children,
}: { Icon: ComponentType<{ size?: number; className?: string }>; title: string; tint: "info" | "ai" | "accent"; children: React.ReactNode }) {
  const palette = {
    info:   { bg: "var(--bg-card-hover)", bar: "var(--text-secondary)" },
    ai:     { bg: "var(--bg-card-hover)", bar: "var(--warning)" },
    accent: { bg: "var(--bg-card-hover)", bar: "var(--accent)" },
  }[tint];
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-[var(--border)]/60 pl-3"
      style={{ background: palette.bg + "55" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: palette.bar }}
      />
      <div className="px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Icon size={12} className="shrink-0" />
          <span>{title}</span>
        </p>
        {children}
      </div>
    </div>
  );
}
