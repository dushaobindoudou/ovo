import type { CSSProperties } from "react";

interface OvoLogoProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
  /** "light" / "dark" 强制色板；"auto" 跟随 document data-theme；"on-accent" = 放在 accent 背景上（白色对比） */
  variant?: "light" | "dark" | "auto" | "on-accent";
  /** 可选：自定义 V 形桥梁颜色 — 默认走 CSS var(--accent) */
  accentColor?: string;
}

/**
 * OVO 品牌 Logo — 双圆圈 + V 形桥梁
 *
 * B1 / B3 修复（2026-05-17）：
 *   - 删除写死的微信绿 #07C160，V 桥用 CSS var(--accent)（默认 systemBlue）
 *   - 这是项目唯一的 logo 真值源（B1）—— SiriOrb / AnimatedLogo / icon-renderer 都应该用它或一致色板
 *   - 暗色 / 浅色 / on-accent 场景都通过 variant + CSS var 控制，零硬编码
 *
 * 设计来源: docs/ui-design/ — 但色板从微信绿迁到 systemBlue（避免品牌混淆）
 */
export function OvoLogo({ size = 20, style, className, variant = "auto", accentColor }: OvoLogoProps) {
  const isDark = variant === "auto"
    ? typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    : variant === "dark";

  // B2: 不再写死 hex，全部走 CSS 变量
  const circleStroke =
    variant === "on-accent" ? "#FFFFFF" :        // accent 背景上用白色描边
    isDark ? "var(--text-primary)" :              // 暗色用主文字色
    "var(--text-primary)";                        // 浅色同样（CSS 变量已在两套主题下分别定义）
  const vColor = accentColor ?? (variant === "on-accent" ? "#FFFFFF" : "var(--accent)");

  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox="0 0 80 44"
      fill="none"
      style={style}
      className={className}
      aria-label="Ovo"
    >
      <circle cx="20" cy="22" r="14" stroke={circleStroke} strokeWidth="2" />
      <circle cx="60" cy="22" r="14" stroke={circleStroke} strokeWidth="2" />
      <path
        d="M34 15 L40 28 L46 15"
        stroke={vColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
