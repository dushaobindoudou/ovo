import type { CSSProperties } from "react";

interface OvoLogoProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
  variant?: "light" | "dark" | "auto";
}

/**
 * OVO 静态 Logo - 双圆圈 + V 形桥梁
 * 设计来源: docs/ui-design/ovo_brand_wechat_green.html
 */
export function OvoLogo({ size = 20, style, className, variant = "auto" }: OvoLogoProps) {
  // Auto-detect theme from document if not specified
  const isDark = variant === "auto"
    ? typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    : variant === "dark";

  const circleStroke = isDark ? "#E8F5EE" : "#191919";
  const vColor = "#07C160";

  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox="0 0 80 44"
      fill="none"
      style={style}
      className={className}
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
