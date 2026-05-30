import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
// XIcon 之前 sticky 卡片用的，sticky 已废
import type { FloatingStatePayload } from "../../types/ovo";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

const DEFAULT_STATE: FloatingStatePayload = {
  summary: null,
  activeApp: null,
  activeWindowTitle: null,
  pipelineStatus: "idle",
  unreadCount: 0,
  lastPipelineAt: 0,
  lastRiskLevel: "none"
};

/**
 * 状态视觉。设计：科技感 + 心跳呼吸，不复杂、不打扰。
 * 没有 scene 图标——LLM 输出的 summary 自由文本走 hover tooltip 即可。
 */
// P1.15: 新增 has_suggestion 状态——未读建议高亮（青色 + 慢呼吸），优先级高于 idle
type Visual = "idle" | "thinking" | "generating" | "alert" | "error" | "has_suggestion";

// B1 / B2 修复（2026-05-17）：
//   PALETTE 这里仍保留 hex 而非直接 var()——因为 SVG <stop stopColor> 属性在 attribute 层面
//   不解析 CSS var()（只有 style 属性会）。这里的 hex 值必须与 src/index.css :root 的
//   --state-* / --info / --warning / --danger CSS 变量保持一致，是品牌色板的"SVG 镜像"。
//
//   归一映射（2026-05-21 品牌统一：静息/识别态 → systemBlue，与主界面 --accent
//   #007aff/#0a84ff + 应用图标同源；仅保留"功能性状态色"以传达语义）：
//     idle           → systemBlue (#0a84ff)  ← 品牌主色，与主界面/图标一致
//     has_suggestion → systemBlue 偏亮 (#409cff) ← 同色系，仅亮度区分"有新建议"
//     thinking       → --state-thinking       (#5856d6 systemIndigo，工作中的语义信号)
//     generating     → --warning              (#ff9500，生成中的语义信号)
//     alert / error  → --danger               (#ff3b30，警告/错误必须红，不可统一为蓝)
//
//   暗色 mode 视觉差异已通过 :root[data-theme="dark"] 在 index.css 处理（state-* 自动切换）；
//   FloatingIcon 自身是独立 BrowserWindow 也继承 data-theme，未来重构时把 hex → useEffect+
//   getComputedStyle 读 CSS var 即可完全归一（性能开销 < 1ms 不值得引入 useState 复杂度）
const PALETTE: Record<Visual, { glow: string; ring: string; accent: string; cycle: number }> = {
  idle:           { glow: "#0a84ff", ring: "#0a84ff66", accent: "#0a84ff", cycle: 3.0 },
  has_suggestion: { glow: "#409cff", ring: "#409cff99", accent: "#409cff", cycle: 2.0 },
  thinking:       { glow: "#5856d6", ring: "#5856d666", accent: "#7c7be0", cycle: 1.4 },
  generating:     { glow: "#ff9500", ring: "#ff950066", accent: "#ff9500", cycle: 0.55 },
  alert:          { glow: "#ff3b30", ring: "#ff3b3099", accent: "#ff3b30", cycle: 0.7 },
  error:          { glow: "#ff3b30", ring: "#ff3b3066", accent: "#ff3b30", cycle: 1.6 }
};

// timeAgo 之前 sticky 卡片 summarySub 用，sticky 已废

function pickVisual(state: FloatingStatePayload): Visual {
  const isAlert = state.lastRiskLevel === "high" || state.lastRiskLevel === "critical";
  if (isAlert) return "alert";
  if (state.pipelineStatus === "thinking") return "thinking";
  if (state.pipelineStatus === "generating") return "generating";
  if (state.pipelineStatus === "alert") return "alert";
  // P1.15: idle 时如果有未读建议，升级为 has_suggestion 状态（青色 + 慢呼吸）
  if (state.unreadCount > 0) return "has_suggestion";
  return "idle";
}

/**
 * P2-1: 悬浮球「人话状态」——用原生 title tooltip（OS 级，不撑 96×96 窗口、零布局影响）。
 * 文案与主界面 LiveStatusBar 口径一致。
 */
function statusText(state: FloatingStatePayload): string {
  if (state.pipelineStatus === "alert" || state.lastRiskLevel === "high" || state.lastRiskLevel === "critical") {
    return "有重要提醒";
  }
  if (state.pipelineStatus === "thinking" || state.pipelineStatus === "generating") {
    return "正在生成建议…";
  }
  if (state.unreadCount > 0) {
    return `有 ${state.unreadCount} 条建议${state.summary ? ` · ${state.summary}` : ""}`;
  }
  if (state.summary) return state.summary;
  if (state.activeApp) return `正在看 ${state.activeApp}`;
  return "Ovo 正在观察 · 点击展开";
}

export function FloatingIcon() {
  const [state, setState] = useState<FloatingStatePayload>(DEFAULT_STATE);

  // 强制 body / html / #root 透明 + overflow:hidden，杀滚动条
  // P2: tooltip 绝对定位时易把文档撑出窗口高度 → 出现滚动条 + 滚轮影响
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root") as HTMLElement | null;
    const prev = {
      htmlBg: html.style.background, htmlOverflow: html.style.overflow,
      htmlW: html.style.width, htmlH: html.style.height, htmlMargin: html.style.margin,
      bodyBg: body.style.background, bodyOverflow: body.style.overflow,
      bodyW: body.style.width, bodyH: body.style.height, bodyMargin: body.style.margin,
      rootBg: root?.style.background ?? "", rootOverflow: root?.style.overflow ?? "",
      rootW: root?.style.width ?? "", rootH: root?.style.height ?? ""
    };
    html.style.background = "transparent";
    html.style.overflow = "hidden";
    html.style.width = "100%";
    html.style.height = "100%";
    html.style.margin = "0";
    body.style.background = "transparent";
    body.style.overflow = "hidden";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.margin = "0";
    if (root) {
      root.style.background = "transparent";
      root.style.overflow = "hidden";
      root.style.width = "100%";
      root.style.height = "100%";
    }
    return () => {
      html.style.background = prev.htmlBg;
      html.style.overflow = prev.htmlOverflow;
      html.style.width = prev.htmlW;
      html.style.height = prev.htmlH;
      html.style.margin = prev.htmlMargin;
      body.style.background = prev.bodyBg;
      body.style.overflow = prev.bodyOverflow;
      body.style.width = prev.bodyW;
      body.style.height = prev.bodyH;
      body.style.margin = prev.bodyMargin;
      if (root) {
        root.style.background = prev.rootBg;
        root.style.overflow = prev.rootOverflow;
        root.style.width = prev.rootW;
        root.style.height = prev.rootH;
      }
    };
  }, []);

  // 订阅主进程 floating 状态
  useEffect(() => {
    if (!isElectron) return;
    void window.ovoAPI.floating.getState().then((s) => s && setState(s)).catch(() => {});
    const off = window.ovoAPI.on("floating:state-update", (payload) => {
      if (payload) setState(payload);
    });
    const t = window.setInterval(() => setState((s) => ({ ...s })), 5_000);
    return () => {
      try { off(); } catch { /* ignore */ }
      window.clearInterval(t);
    };
  }, []);

  const visual = pickVisual(state);
  const palette = PALETTE[visual];

  // 点击：toggle sticky 卡（不再一击就开主窗口）
  const [sticky, setSticky] = useState(false);
  // sticky 切换时让主进程动态调整窗口高度——默认仅 108px 显示球，展开时撑到 260
  useEffect(() => {
    if (!isElectron) return;
    void window.ovoAPI.floating.setExpanded(sticky).catch(() => {});
  }, [sticky]);

  // 用户反馈：点击悬浮球应该直接打开主窗口，不再弹 sticky 确认。sticky 卡片完全废弃。
  const handleOpenConsole = async () => {
    if (!isElectron) return;
    try { await window.ovoAPI.floating.clearUnread(); } catch { /* ignore */ }
    try { await window.ovoAPI.app.toggleConsole(); } catch { /* ignore */ }
    setSticky(false);
  };
  // 保留 handleToggleSticky 别名兼容旧引用，但行为改为直接开主窗口
  const handleToggleSticky = handleOpenConsole;

  // 球本身的拖动：mousedown → IPC drag-start；pointermove → IPC drag-move；
  // pointerup → drag-end；总位移 < 5px 视为 click（避免拖动末尾误触发 toggle）
  // 用 pointer events + setPointerCapture，移到窗口外也能收事件
  const dragStartScreenRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const DRAG_THRESHOLD = 5;

  const handlePointerDown = useCallback(async (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (!isElectron) return;
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    dragStartScreenRef.current = { x: e.screenX, y: e.screenY };
    draggedRef.current = false;
    try { await window.ovoAPI.floating.dragStart(); } catch { /* ignore */ }
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartScreenRef.current;
    if (!start) return;
    const dx = e.screenX - start.x;
    const dy = e.screenY - start.y;
    if (!draggedRef.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      draggedRef.current = true;
    }
    if (draggedRef.current) {
      void window.ovoAPI.floating.dragMove({ dx, dy }).catch(() => {});
    }
  }, []);

  // P3.1: 拖动结束后显示位置已保存的反馈（scale 弹动 + 短暂 ring）
  const [justDropped, setJustDropped] = useState(false);
  const handlePointerUp = useCallback(async (e: ReactPointerEvent<HTMLButtonElement>) => {
    const wasDragging = draggedRef.current;
    dragStartScreenRef.current = null;
    draggedRef.current = false;
    try { (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    try { await window.ovoAPI.floating.dragEnd(); } catch { /* ignore */ }
    if (!wasDragging) {
      void handleToggleSticky();
    } else {
      // P3.1: 拖动结束 → 位置已自动保存（floating.dragEnd 内会落 preferences），给个视觉确认
      setJustDropped(true);
      window.setTimeout(() => setJustDropped(false), 600);
    }
  }, [handleToggleSticky]);

  // 用户反馈：sticky 卡片已废弃，点球直接 toggleConsole。summaryText/summarySub 也不再展示

  return (
    // 外层根：不再用 webkit-app-region:drag。球本身走 JS 拖动（pointer events + IPC setPosition），
    // 这样点球能拖、点 tooltip/卡内按钮能正常响应，不再有"幽灵拖动区"。
    // 球永远锚定在窗口右上角 96×96 区域，sticky 展开时窗口向左下延伸 (300×288)，
    // 球的屏幕位置不变，卡片在其左下方出现。
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "transparent" } as CSSProperties}
    >
      {/* 球：固定 96×96，贴窗口右上角 — P3.1: justDropped 时短暂 scale 弹动反馈 */}
      <div
        className={`absolute right-0 top-0 flex h-[96px] w-[96px] items-center justify-center transition-transform ${
          justDropped ? "scale-110 duration-150" : "scale-100 duration-300"
        }`}
      >
        <button
          type="button"
          onPointerDown={(e) => void handlePointerDown(e)}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => void handlePointerUp(e)}
          aria-label="ovo 悬浮球（拖动可移位，点击展开）"
          title={statusText(state)}
          className="flex h-20 w-20 items-center justify-center"
          style={{
            background: "transparent",
            border: "none",
            cursor: "grab",
            outline: "none",
            touchAction: "none"
          } as CSSProperties}
        >
          <SiriOrb visual={visual} palette={palette} />
        </button>

        {/* 高 risk 红色角标，球左上 — 用 var(--danger) 在浅/暗主题都正确响应 */}
        {visual === "alert" && (
          <span
            className="absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white"
            style={{
              animation: "ovo-pulse 0.8s ease-in-out infinite",
              boxShadow: "0 0 6px rgba(255,59,48,0.8)"
            }}
          >
            !
          </span>
        )}

        {/* 未读建议数字徽标，球右下 */}
        {state.unreadCount > 0 && (
          <span
            className="absolute right-1.5 bottom-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{
              background: palette.accent,
              boxShadow: `0 0 5px ${palette.accent}66`
            }}
          >
            {state.unreadCount > 99 ? "99+" : state.unreadCount}
          </span>
        )}
      </div>

      {/* 折叠态没有 tooltip——96×96 窗口装不下，且 hover 弹窗会打扰用户。
          状态通过球的颜色/动画传达；详情走 sticky 大卡。 */}

      {/* sticky 大卡已废弃 — 用户反馈"点击悬浮球应直接打开主窗口"。保留 unused state 兼容 */}

      <style>{`
        @keyframes ovo-breathe {
          0%, 100% { transform: scale(0.92); opacity: 0.85; }
          50%      { transform: scale(1.02); opacity: 1; }
        }
        @keyframes ovo-heartbeat {
          0%, 100% { transform: scale(1); }
          25%      { transform: scale(1.08); }
          50%      { transform: scale(0.98); }
          75%      { transform: scale(1.05); }
        }
        @keyframes ovo-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ovo-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.25); opacity: 0.85; }
        }
        @keyframes ovo-flicker {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

interface SiriOrbProps {
  visual: Visual;
  palette: { glow: string; ring: string; accent: string; cycle: number };
}

function SiriOrb({ visual, palette }: SiriOrbProps) {
  const breatheAnim =
    visual === "generating" ? `ovo-heartbeat ${palette.cycle}s ease-in-out infinite`
    : visual === "alert" ? `ovo-pulse ${palette.cycle}s ease-in-out infinite`
    : visual === "error" ? `ovo-flicker ${palette.cycle}s ease-in-out infinite`
    : `ovo-breathe ${palette.cycle}s ease-in-out infinite`;

  const showThinkingOrbits = visual === "thinking";
  const showAlertRipple = visual === "alert";

  return (
    <svg
      width={80}
      height={80}
      viewBox="0 0 100 100"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="ovo-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.95" />
          <stop offset="55%" stopColor={palette.glow} stopOpacity="0.45" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ovo-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="50%" stopColor={palette.glow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0.0" />
        </radialGradient>
        <filter id="ovo-soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 状态光晕外圈（呼吸） */}
      <g style={{ transformOrigin: "50px 50px", animation: breatheAnim }}>
        <circle cx={50} cy={50} r={36} fill="url(#ovo-glow)" />
        <circle cx={50} cy={50} r={28} fill="none" stroke={palette.ring} strokeWidth={0.7} />
        <circle cx={50} cy={50} r={20} fill="none" stroke={palette.ring} strokeWidth={0.4} />
      </g>

      {/* 核心点（始终亮） */}
      <circle cx={50} cy={50} r={10} fill="url(#ovo-core)" filter="url(#ovo-soft-shadow)" />

      {/* thinking: 3 颗粒子在 r=28 圆轨上旋转 */}
      {showThinkingOrbits && (
        <g style={{ transformOrigin: "50px 50px", animation: "ovo-orbit 4.5s linear infinite" }}>
          <circle cx={50} cy={22} r={1.8} fill={palette.accent} />
          <circle cx={50 + 28 * Math.cos((-Math.PI / 2) + (Math.PI * 2 / 3))} cy={50 + 28 * Math.sin((-Math.PI / 2) + (Math.PI * 2 / 3))} r={1.8} fill={palette.accent} opacity={0.6} />
          <circle cx={50 + 28 * Math.cos((-Math.PI / 2) + (Math.PI * 4 / 3))} cy={50 + 28 * Math.sin((-Math.PI / 2) + (Math.PI * 4 / 3))} r={1.8} fill={palette.accent} opacity={0.4} />
        </g>
      )}

      {/* alert: 向外扩散的水波 */}
      {showAlertRipple && (
        <>
          <circle cx={50} cy={50} fill="none" stroke={palette.accent}>
            <animate attributeName="r" from="28" to="44" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={50} cy={50} fill="none" stroke={palette.accent}>
            <animate attributeName="r" from="28" to="44" dur="1.2s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" begin="0.6s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}
