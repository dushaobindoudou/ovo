/**
 * F4-A: 流程 tab —— 动态进度条版（每行一个完整推断）
 *
 * 设计原则：
 *  · 每行一次推断，进度段数 = 真实跑了几段（1-5+ 段，不是固定 4 段）
 *  · 文案中性人话：不出现"ovo 怎么样"
 *  · 展开 4 段 section：看屏幕 / 理解 / 执行 / 记忆 / 补关系
 *  · F4-C: 理解段可看到完整 prompt + LLM 原始返回
 */
import { useEffect, useState } from "react";
import { Card } from "../shared/Card";
import { ChevronDown, ChevronRight, AlertTriangle, Eye, EyeOff } from "lucide-react";
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

export function ProcessPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-md bg-[var(--bg-card)] p-1 w-fit">
        <ViewTab label="动作清单" active={view === "actions"} onClick={() => setView("actions")} />
        <ViewTab label="技术回放" active={view === "replay"} onClick={() => setView("replay")} />
      </div>

      {view === "actions" ? (
        <ActionHistoryPanel />
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
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">技术回放</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          每一次 ovo 看屏幕、想了什么、做了什么的完整回放。点开看详情。
        </p>
      </div>

      {pipelines.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">还没看过你的屏幕</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">用一会儿 ovo，每次推断都会在这里留底</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {pipelines.map((p) => (
            <PipelineProgressRow
              key={p.id}
              pipeline={p}
              expanded={expandedId === p.id}
              onToggle={() => onToggle(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
      <PipelineSection icon="📸" title="ovo 看到了什么" tint="info">
        <div className="space-y-1.5 text-[13px] leading-relaxed">
          <p>
            <span className="text-[var(--text-muted)]">{formatRelative(timestamp)}看了 </span>
            <span className="font-medium">{c.appName || "屏幕"}</span>
            {c.windowTitle && <span className="text-[var(--text-muted)]"> · {c.windowTitle}</span>}
          </p>
          {c.charCount > 0 ? (
            <div className="space-y-1">
              <p className="text-[var(--text-muted)]">
                OCR 抓到 <span className="text-[var(--text-secondary)]">{c.charCount}</span> 字
                {c.ocrPreview && c.charCount > c.ocrPreview.length && (
                  <span> · 下方仅显示前 {c.ocrPreview.length} 字</span>
                )}
              </p>
              {c.ocrPreview && (
                <button
                  type="button"
                  onClick={() => setShowFullOcr((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  {showFullOcr ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showFullOcr ? "收起 OCR 原文" : "看 OCR 原文"}
                </button>
              )}
              {showFullOcr && c.ocrPreview && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                  {c.ocrPreview}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-[var(--text-muted)]">没识别出文字</p>
          )}
        </div>
      </PipelineSection>

      {/* ② 进 AI 的内容 + AI 输出原文（透明日志） */}
      {(u.promptPreview || u.rawResponse) && (
        <PipelineSection icon="🧠" title="给 AI 的内容 / AI 的回复" tint="ai">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {showRaw ? <EyeOff size={11} /> : <Eye size={11} />}
            {showRaw ? "收起完整 prompt 与响应" : "展开看 prompt 与响应（隐私透明）"}
          </button>
          {showRaw && (
            <div className="mt-2 space-y-2">
              {u.promptPreview && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">→ 发给 AI 的 prompt</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">{u.promptPreview}</pre>
                </div>
              )}
              {u.rawResponse && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">← AI 回复原文</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--bg-base)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">{u.rawResponse}</pre>
                </div>
              )}
            </div>
          )}
        </PipelineSection>
      )}

      {/* ③ AI 决策：意图 / 角色 / 动作 / 记忆 */}
      <PipelineSection icon="💡" title="AI 的判断与决策" tint="accent">
        <div className="space-y-1.5 text-[13px] leading-relaxed">
          {status === "failed" && !u.intent && (
            <p className="text-[var(--danger)]">理解失败，没看明白</p>
          )}
          {u.intent && (
            <p>
              <span className="text-[var(--text-muted)]">觉得你在 </span>
              <span className="font-medium">{u.intent}</span>
            </p>
          )}
          {u.role && (
            <p>
              <span className="text-[var(--text-muted)]">觉得你是 </span>
              <span className="font-medium">{u.role}</span>
              {u.roleConfidence > 0 && (
                <span className="text-[var(--text-muted)]"> · {(u.roleConfidence * 100).toFixed(0)}% 把握</span>
              )}
            </p>
          )}
          {u.latentIntent && (
            <p>
              <span className="text-[var(--text-muted)]">长期目标 </span>
              <span>{u.latentIntent}</span>
            </p>
          )}
          {u.prediction && (
            <p>
              <span className="text-[var(--text-muted)]">猜你接下来 </span>
              <span>{u.prediction}</span>
            </p>
          )}
          {u.risk && u.risk !== "none" && (
            <p className={u.risk === "high" || u.risk === "critical" ? "text-[var(--danger)]" : "text-[var(--warning)]"}>
              ⚠ {({ low: "一点点风险", medium: "中等风险", high: "较高风险", critical: "严重风险" } as Record<string, string>)[u.risk] ?? `${u.risk} 风险`}
            </p>
          )}
          {(a.executed > 0 || a.pending > 0) && (
            <p>
              <span className="text-[var(--text-muted)]">⚡ </span>
              {a.executed > 0 && <span className="text-[var(--text-muted)]">完成 {a.executed} 个动作</span>}
              {a.executed > 0 && a.pending > 0 && <span className="text-[var(--text-muted)]">，</span>}
              {a.pending > 0 && <span className="text-[var(--text-muted)]">{a.pending} 个等你确认</span>}
              {a.items.length > 0 && (
                <span className="text-[var(--text-muted)]">: {a.items.slice(0, 3).map((it) => `${it.status} ${it.description}`).join("；")}</span>
              )}
            </p>
          )}
          {(u.offerCount > 0 || u.suggestionCount > 0) && (
            <p className="text-[var(--text-muted)]">
              💬 {u.offerCount > 0 && `提议 ${u.offerCount} 条长期服务`}
              {u.offerCount > 0 && u.suggestionCount > 0 && "，"}
              {u.suggestionCount > 0 && `${u.suggestionCount} 条小建议`}
            </p>
          )}
          {(r.newEntities > 0 || r.newRelationships > 0) && (
            <p>
              <span className="text-[var(--text-muted)]">📚 记下 </span>
              <span>
                {r.newEntities > 0 && `${r.newEntities} 个新概念`}
                {r.newEntities > 0 && r.newRelationships > 0 && " / "}
                {r.newRelationships > 0 && `${r.newRelationships} 个新关联`}
              </span>
            </p>
          )}
          {(rel.added > 0 || rel.reinforced > 0) && (
            <p>
              <span className="text-[var(--text-muted)]">🔗 补 </span>
              {rel.added > 0 && <span>+{rel.added} 新关系</span>}
              {rel.added > 0 && rel.reinforced > 0 && " / "}
              {rel.reinforced > 0 && <span>{rel.reinforced} 条加强</span>}
            </p>
          )}
        </div>
      </PipelineSection>
    </div>
  );
}

function PipelineSection({
  icon, title, tint, children,
}: { icon: string; title: string; tint: "info" | "ai" | "accent"; children: React.ReactNode }) {
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
          <span>{icon}</span>
          <span>{title}</span>
        </p>
        {children}
      </div>
    </div>
  );
}
