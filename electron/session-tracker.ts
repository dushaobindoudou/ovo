/**
 * P2: Session Trajectory tracker
 *
 * 维护过去 ~5 分钟用户经过的"窗口活动序列"，给 LLM prompt 注入轨迹上下文。
 * 不是逐条 OCR 文本（那量太大），而是压缩后的"活动 step"：
 *   { ts, appName, windowTitle, snippet }
 *
 * 设计要点：
 * - 同一窗口连续命中只压成一条 step（保留首次时间 + 最近 snippet）
 * - 超过 windowMs 的 step 自动 evict
 * - getTrajectoryForPrompt() 输出已格式化的可读串
 */

export interface SessionStep {
  /** 窗口首次进入轨迹的时间戳 */
  firstSeenAt: number;
  /** 同窗口最近一次 OCR 时间 */
  lastSeenAt: number;
  /**
   * 源窗口 ID。轨迹召回时按此过滤，防止跨窗口污染 prompt
   * （看 Twitter 时不该捎带 Claude Code 的轨迹）。
   * 历史 step 没有 windowId 时落为 LEGACY_WINDOW_ID，召回默认排除。
   */
  windowId: string;
  appName: string;
  windowTitle: string;
  /** 该步内最有信息量的一段文字（每次 OCR 时择优更新） */
  snippet: string;
}

export const LEGACY_WINDOW_ID = "__legacy__";

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 分钟
const MAX_STEPS = 30;
/** 同一窗口在多少毫秒内被认为是同一 step（更长会被合并） */
const SAME_STEP_GAP_MS = 30 * 1000;
const SNIPPET_MAX = 240;

function pickBetterSnippet(prev: string, next: string): string {
  // 选信息密度更高的：去掉空白后长度更长，但不超过 SNIPPET_MAX
  const a = (prev || "").replace(/\s+/g, " ").trim();
  const b = (next || "").replace(/\s+/g, " ").trim();
  const winner = b.length > a.length ? b : a;
  return winner.slice(0, SNIPPET_MAX);
}

export class SessionTracker {
  private steps: SessionStep[] = [];

  constructor(private readonly windowMs: number = DEFAULT_WINDOW_MS) {}

  append(input: { timestamp: number; windowId: string; appName: string; windowTitle: string; text: string }) {
    this.evictOld(input.timestamp);
    const winId = input.windowId || LEGACY_WINDOW_ID;
    const last = this.steps[this.steps.length - 1];
    // sameStep 判定改用 windowId 主键；windowTitle 仅作 fallback（windowId 缺失时）
    const sameStep =
      last &&
      last.windowId === winId &&
      last.appName === input.appName &&
      last.windowTitle === input.windowTitle &&
      input.timestamp - last.lastSeenAt <= SAME_STEP_GAP_MS;

    if (sameStep && last) {
      last.lastSeenAt = input.timestamp;
      last.snippet = pickBetterSnippet(last.snippet, input.text);
      return;
    }
    this.steps.push({
      firstSeenAt: input.timestamp,
      lastSeenAt: input.timestamp,
      windowId: winId,
      appName: input.appName,
      windowTitle: input.windowTitle,
      snippet: pickBetterSnippet("", input.text)
    });
    if (this.steps.length > MAX_STEPS) {
      this.steps = this.steps.slice(-MAX_STEPS);
    }
  }

  private evictOld(now: number) {
    const cutoff = now - this.windowMs;
    let firstKeep = 0;
    while (firstKeep < this.steps.length && this.steps[firstKeep].lastSeenAt < cutoff) {
      firstKeep++;
    }
    if (firstKeep > 0) this.steps = this.steps.slice(firstKeep);
  }

  getSteps(activeWindowId?: string): SessionStep[] {
    this.evictOld(Date.now());
    if (!activeWindowId) return [...this.steps];
    // 按 windowId 过滤，并排除 legacy（windowId 为空的历史步）
    return this.steps.filter((s) => s.windowId === activeWindowId && s.windowId !== LEGACY_WINDOW_ID);
  }

  /**
   * 给 LLM prompt 用的字符串表示。压缩格式：
   *   [HH:MM] AppName · WindowTitle — snippet (≤80 字)
   * 多步用换行分隔。
   *
   * 传 activeWindowId 时只返回该窗口的轨迹（防跨窗口污染）。
   * 不传时返回所有窗口（仅用于 UI 调试展示，不要给 LLM 用）。
   */
  getTrajectoryForPrompt(activeWindowId?: string): string {
    const steps = this.getSteps(activeWindowId);
    if (steps.length === 0) return "";
    return steps
      .map((s) => {
        const t = new Date(s.firstSeenAt);
        const hh = String(t.getHours()).padStart(2, "0");
        const mm = String(t.getMinutes()).padStart(2, "0");
        const dur = Math.max(1, Math.round((s.lastSeenAt - s.firstSeenAt) / 1000));
        const snippet = s.snippet.length > 80 ? s.snippet.slice(0, 80) + "…" : s.snippet;
        return `[${hh}:${mm} +${dur}s] ${s.appName} · ${s.windowTitle.slice(0, 40)} — ${snippet}`;
      })
      .join("\n");
  }

  clear() {
    this.steps = [];
  }
}

/** 单例：所有窗口共享一条轨迹 */
export const sessionTracker = new SessionTracker();

/* ──────────────────────────────────────────────────────────────────────
 * P6: 软活动状态推断（不依赖 native hook，不需要 Accessibility 权限）
 *
 * 用 session 轨迹 + OCR 文本变化推断用户当前状态：
 *   - active_typing: 同一窗口里，文本快速增长（用户在打字 / 写代码 / 写文档）
 *   - reading: 同一窗口 ≥ 2 min 且文本变化小
 *   - exploring: 短时间内窗口切换频繁（在找东西 / 切换上下文）
 *   - idle: 长时间无窗口切换 + 文本不变化
 *
 * 用法：在 buildObservationPrompt 里注入"## 用户活动状态"段，
 * 让 LLM 知道"用户正在认真创作"vs"在划水"
 * ────────────────────────────────────────────────────────────────────── */

export type UserActivityState = "active_typing" | "reading" | "exploring" | "idle" | "unknown";

export interface ActivitySignal {
  state: UserActivityState;
  /** 当前窗口持续了多少秒 */
  currentWindowDwellSec: number;
  /** 过去 60s 切了几个窗口 */
  recentSwitches: number;
  /** 当前窗口最近文本变化量（粗略估计：snippet 长度变化） */
  recentTextDelta: number;
  /** 给 prompt 用的人话描述 */
  description: string;
}

export function inferActivityState(activeWindowId?: string): ActivitySignal {
  // 注意：recentSwitches 是"用户在切换任务"的信号——这条要看全局轨迹，
  // 否则 active 窗口里永远只看到自己（dwell 越来越长，永远不会判 exploring）。
  // 所以这里**故意**不按 windowId 过滤；activeWindowId 仅作未来扩展占位。
  void activeWindowId;
  const steps = sessionTracker.getSteps();
  if (steps.length === 0) {
    return {
      state: "unknown",
      currentWindowDwellSec: 0,
      recentSwitches: 0,
      recentTextDelta: 0,
      description: "暂无活动数据"
    };
  }
  const now = Date.now();
  const last = steps[steps.length - 1];
  const dwellSec = Math.max(0, Math.round((now - last.firstSeenAt) / 1000));
  const since60s = now - 60_000;
  const recentSwitches = steps.filter((s) => s.firstSeenAt >= since60s).length - 1; // 当前算 0 切

  // 文本 delta：当前 step 持续中，snippet 累加趋势
  const recentTextDelta = last.snippet.length;

  let state: UserActivityState;
  let description: string;

  if (recentSwitches >= 3) {
    state = "exploring";
    description = `过去 60 秒切换了 ${recentSwitches + 1} 个窗口，可能在找东西/切换任务`;
  } else if (dwellSec >= 120 && recentTextDelta < 50) {
    state = "reading";
    description = `在 ${last.appName} 已停留 ${dwellSec}s，文本变化少，可能在阅读/思考`;
  } else if (dwellSec >= 5 && recentTextDelta >= 100) {
    state = "active_typing";
    description = `在 ${last.appName} 持续输入/创作 ${dwellSec}s`;
  } else if (dwellSec >= 300) {
    state = "idle";
    description = `${last.appName} 长时间无变化（${dwellSec}s），可能空闲`;
  } else {
    state = "unknown";
    description = `刚切到 ${last.appName} ${dwellSec}s`;
  }

  return { state, currentWindowDwellSec: dwellSec, recentSwitches, recentTextDelta, description };
}
