/**
 * P0-2 First Win 引导 —— 让首启用户第一分钟就知道「怎样触发价值」。
 *
 * 主动助手如果第一分钟没产出，用户会以为它不可用。空状态光说"正在观察"不够，
 * 这里给 3-4 个可操作场景卡：用户照着做就能拿到第一条有用建议。
 *
 * 行为：
 *   - 仅在「冷启动」期出现（还没有第一条 prediction / 建议 / pending）。
 *   - 第一条建议出现后自动消失，并记 localStorage，之后不再反复打扰。
 *   - 点场景卡 → 即时反馈「好，打开后我会盯着这个场景」。
 *   - 等待超过 5 分钟仍无建议 → 给出明确原因（没截到屏 / 还没遇到可帮的机会）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, FileText, Code2, Globe, Sparkles, Eye } from "lucide-react";
import { Card } from "../shared/Card";

const DONE_KEY = "ovo.first-win.done";
const WAIT_HINT_MS = 5 * 60 * 1000;

interface FirstWinGuideProps {
  /** 是否已拿到第一条价值（prediction / 建议 / pending 任一） */
  firstWinAchieved: boolean;
  /** 距上次截屏多少秒；<0 表示还没截过 */
  captureAgo: number;
}

const SCENARIOS = [
  { key: "email", icon: Mail, title: "打开一封待回复的邮件", desc: "Ovo 会帮你准备回复草稿" },
  { key: "notes", icon: FileText, title: "打开会议纪要", desc: "提取待办事项和提醒" },
  { key: "code", icon: Code2, title: "停在一段代码 TODO", desc: "建议下一步怎么改" },
  { key: "research", icon: Globe, title: "打开一个调研网页", desc: "总结要点并给后续动作" }
];

export function FirstWinGuide({ firstWinAchieved, captureAgo }: FirstWinGuideProps) {
  const [done, setDone] = useState<boolean>(() => {
    try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return false; }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const startedAt = useRef<number>(Date.now());

  // 第一条价值到手 → 记住并不再打扰
  useEffect(() => {
    if (firstWinAchieved && !done) {
      try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
      setDone(true);
    }
  }, [firstWinAchieved, done]);

  // 5 分钟仍无建议 → 显示诊断原因
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      if (Date.now() - startedAt.current >= WAIT_HINT_MS) setWaitedTooLong(true);
    }, 15_000);
    return () => clearInterval(t);
  }, [done]);

  const waitReason = useMemo(() => {
    if (captureAgo < 0) {
      return "Ovo 还没截到任何屏幕：确认上面的「启动自检」全部通过，并保证屏幕上有可见的应用窗口。";
    }
    return "Ovo 在看，但还没遇到能帮上忙的机会。试着打开下面任意一个场景，给它一个明确的上下文。";
  }, [captureAgo]);

  if (done || firstWinAchieved) return null;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={15} className="text-[var(--accent)]" />
        <p className="text-sm font-semibold">拿到第一条建议</p>
      </div>
      <p className="mb-2.5 text-[11px] text-[var(--text-muted)]">
        Ovo 会观察你正在做的事。挑一个场景照着做，几十秒内就能看到它的第一条建议。
      </p>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isSel = selected === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelected(s.key)}
              className={`flex items-start gap-2 rounded-md border p-2 text-left transition-colors ${
                isSel
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/60"
              }`}
            >
              <Icon size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium">{s.title}</span>
                <span className="mt-0.5 block text-[10.5px] text-[var(--text-muted)]">{s.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-dim)] p-2 text-[11px] text-[var(--text-secondary)]">
          <Eye size={12} className="shrink-0 text-[var(--accent)]" />
          <span>
            好，打开「{SCENARIOS.find((x) => x.key === selected)?.title}」后我会盯着这个场景，准备好建议就弹给你。
          </span>
        </div>
      )}

      {waitedTooLong && (
        <div className="mt-2 rounded-md border border-[var(--warning,#f59e0b)]/40 bg-[var(--warning,#f59e0b)]/5 p-2 text-[11px] text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--warning,#f59e0b)]">已经等了几分钟还没有建议？</p>
          <p className="mt-0.5 text-[var(--text-muted)]">{waitReason}</p>
        </div>
      )}
    </Card>
  );
}
