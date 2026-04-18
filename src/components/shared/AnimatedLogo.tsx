import type { CSSProperties } from "react";
import { useMemo } from "react";

export type LogoState = "idle" | "watching" | "thinking" | "executing";

interface AnimatedLogoProps {
  size?: number;
  state?: LogoState;
  className?: string;
}

const stateConfig: Record<LogoState, { name: string; color: string }> = {
  idle: { name: "待机", color: "#8AA896" },
  watching: { name: "观察", color: "#07C160" },
  thinking: { name: "思考", color: "#5B9BD5" },
  executing: { name: "执行", color: "#07C160" },
};

const styleId = "ovo-animated-logo-styles";

let styleInjected = false;
function injectStyles() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
@keyframes ovo-idle-breathe{0%,100%{opacity:.5;transform:scale(.96)}50%{opacity:.65;transform:scale(1)}}
@keyframes ovo-blink-l{0%,78%,100%{transform:scaleY(1)}81%,86%{transform:scaleY(.05)}}
@keyframes ovo-blink-r{0%,78%,100%{transform:scaleY(1)}81%,86%{transform:scaleY(.05)}}
@keyframes ovo-head-scan{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes ojo-eye-alert{from{stroke-opacity:.6}to{stroke-opacity:1}}
@keyframes ovo-scan-pupil{0%,100%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
@keyframes ovo-squint{0%,100%{transform:scaleY(.78)}50%{transform:scaleY(.72)}}
@keyframes ovo-think-l{0%,100%{transform:translate(-3px,-6px)}50%{transform:translate(2px,-8px)}}
@keyframes ovo-think-r{0%,100%{transform:translate(2px,-6px)}50%{transform:translate(-3px,-8px)}}
@keyframes ovo-dash-march{to{stroke-dashoffset:-10}}
@keyframes ovo-think-dot{0%,100%{transform:translateY(0);opacity:.25}45%{transform:translateY(-5px);opacity:1}}
@keyframes ovo-exec-heartbeat{0%,100%{transform:scale(1)}40%{transform:scale(1.06)}}
@keyframes ovo-exec-flash{0%,100%{stroke-opacity:1;stroke-width:1.5}50%{stroke-opacity:.4;stroke-width:1}}
@keyframes ovo-exec-fill{0%,100%{transform:scale(1)}50%{transform:scale(3);opacity:.6}}
@keyframes ovo-v-shoot{from{stroke-dashoffset:40}to{stroke-dashoffset:0}}
@keyframes ovo-ring-out{0%{r:18;stroke-opacity:.6;stroke-width:1.5}100%{r:34;stroke-opacity:0;stroke-width:.3}}
.ovo-logo-g{transform-box:fill-box;transform-origin:center;transition:opacity .2s ease}
.ovo-logo-g.fading{opacity:0}
  `;
  document.head.appendChild(style);
}

export function AnimatedLogo({ size = 48, state = "idle", className }: AnimatedLogoProps) {
  const config = stateConfig[state];
  const svgHeight = size * 0.55;

  useMemo(() => injectStyles(), []);

  const isDark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const circleStroke = isDark ? "#E8F5EE" : "#191919";
  const defaultStroke = "#8AA896";

  // State-specific SVG rendering
  const content = useMemo(() => {
    if (state === "idle") {
      return (
        <g className="ovo-logo-g" style={{ animation: "ovo-idle-breathe 3.8s ease-in-out infinite" }}>
          <circle cx="20" cy="22" r="14" stroke={defaultStroke} strokeWidth="1.5" fill="none"
            style={{ animation: "ovo-blink-l 7s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="60" cy="22" r="14" stroke={defaultStroke} strokeWidth="1.5" fill="none"
            style={{ animation: "ovo-blink-r 7s ease-in-out infinite 0.18s", transformBox: "fill-box", transformOrigin: "center" }} />
          <path d="M34 15 L40 28 L46 15" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
        </g>
      );
    }

    if (state === "watching") {
      return (
        <g className="ovo-logo-g" style={{ animation: "ovo-head-scan 5s ease-in-out infinite" }}>
          <circle cx="20" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
            style={{ animation: "ojo-eye-alert 2.5s ease-in-out infinite alternate", transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="60" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
            style={{ animation: "ojo-eye-alert 2.5s ease-in-out infinite alternate", transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="20" cy="22" r="5" fill={config.color}
            style={{ animation: "ovo-scan-pupil 2.5s ease-in-out infinite" }} />
          <circle cx="60" cy="22" r="5" fill={config.color}
            style={{ animation: "ovo-scan-pupil 2.5s ease-in-out infinite 0.05s" }} />
          <path d="M34 15 L40 28 L46 15" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }

    if (state === "thinking") {
      return (
        <g className="ovo-logo-g">
          <circle cx="20" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
            style={{ animation: "ovo-squint 3s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="60" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
            style={{ animation: "ovo-squint 3s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="20" cy="22" r="5" fill={config.color} opacity={0.8}
            style={{ animation: "ovo-think-l 3.5s ease-in-out infinite" }} />
          <circle cx="60" cy="22" r="5" fill={config.color} opacity={0.8}
            style={{ animation: "ovo-think-r 3.5s ease-in-out infinite" }} />
          <path d="M34 15 L40 28 L46 15" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="4 3" style={{ animation: "ovo-dash-march 0.8s linear infinite" }} />
          {/* Thinking dots */}
          <circle cx="56" cy="6" r="2" fill={config.color} style={{ animation: "ovo-think-dot 1s ease-in-out infinite" }} />
          <circle cx="68" cy="6" r="2" fill={config.color} style={{ animation: "ovo-think-dot 1s ease-in-out infinite 0.22s" }} />
          <circle cx="80" cy="6" r="2" fill={config.color} style={{ animation: "ovo-think-dot 1s ease-in-out infinite 0.44s" }} />
        </g>
      );
    }

    // executing
    return (
      <g className="ovo-logo-g" style={{ animation: "ovo-exec-heartbeat 0.55s ease-in-out infinite" }}>
        {/* Expanding rings */}
        <circle cx="20" cy="22" r="18" fill="none" stroke={config.color}
          style={{ animation: "ovo-ring-out 0.55s ease-out infinite" }} />
        <circle cx="60" cy="22" r="18" fill="none" stroke={config.color}
          style={{ animation: "ovo-ring-out 0.55s ease-out infinite 0.1s" }} />
        <circle cx="20" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
          style={{ animation: "ovo-exec-flash 0.55s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
        <circle cx="60" cy="22" r="14" stroke={config.color} strokeWidth="1.5" fill="none"
          style={{ animation: "ovo-exec-flash 0.55s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
        <circle cx="20" cy="22" r="5" fill={config.color}
          style={{ animation: "ovo-exec-fill 0.55s ease-in-out infinite" }} />
        <circle cx="60" cy="22" r="5" fill={config.color}
          style={{ animation: "ovo-exec-fill 0.55s ease-in-out infinite" }} />
        <path d="M34 15 L40 28 L46 15" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="40" style={{ animation: "ovo-v-shoot 0.45s linear infinite" }} />
      </g>
    );
  }, [state, config.color, defaultStroke]);

  return (
    <svg
      width={size}
      height={svgHeight}
      viewBox="0 0 100 44"
      fill="none"
      className={className}
      style={{ overflow: "visible" }}
    >
      {content}
    </svg>
  );
}
