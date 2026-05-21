import { Volume2, Sparkles, ListTodo, MessageSquare, Eye } from "lucide-react";
import { Card } from "../shared/Card";
import { Empty } from "../shared/Empty";
import { GlowButton } from "../shared/GlowButton";
import { StatusBadge } from "../shared/StatusBadge";
import { usePendingActions } from "../../hooks/usePendingActions";
import { useSuggestions } from "../../hooks/useSuggestions";
import { useTTS } from "../../hooks/useTTS";
import { useInsights } from "../../hooks/useInsights";

const FREQ_LABEL: Record<string, string> = {
  daily: "每天",
  weekly: "每周",
  "event-driven": "触发式",
  "one-shot": "一次"
};

const isElectronInternal = typeof window !== "undefined" && !!window.ovoAPI;

function SamplePipelineCTA() {
  const handleRun = async () => {
    if (!isElectronInternal) return;
    try { await window.ovoAPI.dev.runSamplePipeline(); } catch { /* ignore */ }
  };
  return (
    <GlowButton className="!text-xs" onClick={() => void handleRun()}>
      运行示例 Pipeline
    </GlowButton>
  );
}

function OffersSection() {
  const { latest } = useInsights();
  if (!latest) return null;
  const hasContent = latest.role || latest.latentIntent || (latest.offers && latest.offers.length > 0);
  if (!hasContent) return null;
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent)]" />
          <h3 className="text-sm font-semibold">ovo 想帮你做的事</h3>
          <span className="text-[10px] text-[var(--text-muted)]">基于 {latest.appName}</span>
        </div>
        {latest.role && (
          <div className="rounded-lg bg-[var(--bg-base)] px-3 py-2 text-xs">
            <span className="text-[var(--text-muted)]">推断你此刻的角色：</span>
            <span className="font-semibold">{latest.role.role}</span>
            <span className="ml-2 text-[var(--text-muted)]">({(latest.role.confidence * 100).toFixed(0)}%)</span>
            {latest.role.evidence?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-[10px] text-[var(--text-muted)]">
                {latest.role.evidence.slice(0, 3).map((e, i) => (
                  <li key={i} className="truncate">{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {latest.latentIntent && (
          <div className="rounded-lg bg-[var(--bg-base)] px-3 py-2 text-xs">
            <span className="text-[var(--text-muted)]">长期意图：</span>
            {latest.latentIntent}
          </div>
        )}
        {latest.offers && latest.offers.length > 0 ? (
          <div className="space-y-2">
            {latest.offers.map((offer) => (
              <div key={offer.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{offer.title}</p>
                  <span className="shrink-0 rounded-md bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    {FREQ_LABEL[offer.frequency] ?? offer.frequency}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{offer.value_prop}</p>
                {offer.first_action_preview && (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">▸ {offer.first_action_preview}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <GlowButton
                    className="!text-xs"
                    onClick={() => {
                      // M4: capability 注册是哲学第三章承诺，但完整 capability 系统（定时调度 / 触发器 / 自动执行）
                      // 需要独立 PR；当前先把 accepted 记到反馈表 → feedback-engine 据此提升类似 offer 的评分。
                      // 用户看到的文案应明确"我感兴趣"，不暗示自动执行。
                      void window.ovoAPI?.suggestion?.feedback?.({
                        suggestionId: offer.id,
                        suggestionType: `offer:${offer.needs_capability ?? offer.frequency}`,
                        action: "accepted"
                      });
                    }}
                  >
                    我感兴趣
                  </GlowButton>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                    onClick={() => {
                      void window.ovoAPI?.suggestion?.feedback?.({
                        suggestionId: offer.id,
                        suggestionType: `offer:${offer.needs_capability ?? offer.frequency}`,
                        action: "rejected"
                      });
                    }}
                  >
                    不要
                  </button>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    契合度 {(offer.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty compact icon={Eye} title="还没有长期服务建议" hint="ovo 还在观察你的工作模式" />
        )}
      </div>
    </Card>
  );
}

export function SuggestionsPanel({ ctx }: { ctx?: { selectedId: string | null } }) {
  const { pending, confirmAction, cancelAction } = usePendingActions();
  const { suggestions, removeSuggestion } = useSuggestions();
  const { speak } = useTTS();

  const selectedId = ctx?.selectedId ?? "_pending";

  // Pending actions view
  if (selectedId === "_pending" || selectedId.startsWith("action:")) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">建议 & 待处理</h2>
        <OffersSection />
        {pending.length === 0 ? (
          <Card>
            <Empty
              icon={ListTodo}
              title="没有待处理动作"
              hint="ovo 检测到可执行动作时会在这里通知你"
            />
            <div className="mt-3 flex justify-center"><SamplePipelineCTA /></div>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((item) => (
              <Card key={item.action.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{item.action.description}</p>
                    <StatusBadge status="warning" label="待确认" />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{item.action.id}</p>
                  {item.action.params && Object.keys(item.action.params).length > 0 && (
                    <div className="rounded-lg bg-[var(--bg-base)] p-2 text-xs font-mono text-[var(--text-muted)]">
                      {JSON.stringify(item.action.params, null, 2)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <GlowButton
                      onClick={() => void confirmAction({ action: item.action, pipelineId: item.pipelineId })}
                    >
                      确认执行
                    </GlowButton>
                    <button
                      type="button"
                      onClick={() => void cancelAction({ actionId: item.action.id, pipelineId: item.pipelineId })}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Suggestion history view
  if (selectedId === "_recent" || selectedId.startsWith("suggestion:")) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">最近建议</h2>
        {suggestions.length === 0 ? (
          <Card>
            <Empty
              icon={MessageSquare}
              title="还没有建议记录"
              hint="AI 会根据你的使用习惯生成操作建议"
            />
            <div className="mt-3 flex justify-center"><SamplePipelineCTA /></div>
          </Card>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{s.content}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="朗读"
                      onClick={() => void speak(`${s.title}. ${s.content ?? ""}`)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"
                    >
                      <Volume2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSuggestion(s.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Empty state
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">智能建议</h2>
      <Card>
        <div className="py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">请在左侧列表选择一项查看详情</p>
        </div>
      </Card>
    </div>
  );
}
