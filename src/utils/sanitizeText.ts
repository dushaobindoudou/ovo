/**
 * sanitizeText.ts —— 前端兜底文本清洗。
 *
 * 用户多次反馈：弹窗/浮窗/详情卡里冒出一段 CSS / JS 代码。
 * 后端 sanitizeParsedPayload 已经在 LLM 新输出时清洗，但：
 *   1. 数据库里已经存着清洗前生成的脏数据（KG events、suggestions 等）
 *   2. 某些字段直接从 DB 拼到 UI，没经过 LLM parse 路径
 *   3. 任何一处遗漏都会让代码污染重新冒出来
 *
 * 所以所有 UI 渲染面向用户文本前必须再过一次本文件的 sanitize。
 * 这是终极防线 —— 即使后端漏了，前端也不会暴露给用户。
 *
 * 注意：与 electron/text-sanitize.ts 是同一份逻辑的前端镜像。
 *      两边都改时记得同步（这种代码量小，不值得搞 monorepo shared pkg）。
 */

/**
 * 检测一段文本是否"看起来像代码"。
 * 启发式与后端 text-sanitize.ts 保持一致。
 */
export function looksLikeCode(s: string): boolean {
  if (!s) return false;
  const text = String(s);
  if (/```/.test(text)) return true;
  if (/\b(function|class|const|let|var|import|export|return|interface|public|private|async|await)\s+[A-Za-z_]/.test(text)) return true;
  if (/=>\s*[{(]/.test(text)) return true;
  // CSS 特征：伪类/伪元素 / @规则 / grid-* / minmax / repeat( /  cubic-bezier 等
  if (/:(?:not|hover|focus|active|disabled|first-child|last-child|nth-child)\b/.test(text)) return true;
  if (/@media\b|@keyframes\b|@import\b|@supports\b/.test(text)) return true;
  if (/\bgrid-(?:cols|template|columns|rows)\b|\bminmax\(|\brepeat\(\s*\d/.test(text)) return true;
  // Tailwind 转义 \: 是 minified css 的明显特征
  if (/\\:[a-z]/.test(text)) return true;
  // key:value; 结构 + 多个大括号
  if (/\{[^{}]*:[^{}]*[;}]/.test(text)) {
    const braces = (text.match(/[{}]/g) ?? []).length;
    if (braces >= 2) return true;
  }
  // 大括号 / 分号密度
  const braceCount = (text.match(/[{}]/g) ?? []).length;
  const semiCount = (text.match(/;/g) ?? []).length;
  if (text.length > 40 && braceCount + semiCount >= 5) return true;
  // 4+ 连续行带缩进
  const indentedLines = (text.match(/(^|\n)[ \t]{2,}\S/g) ?? []).length;
  if (indentedLines >= 4) return true;
  return false;
}

/**
 * 兜底清洗：命中代码 → 替换为友好语义；过长 → 截断。
 *
 * @param raw     原始字符串
 * @param fallback 命中代码时的替换文案
 * @param maxLen  普通文本最大长度
 */
export function sanitizeForDisplay(raw: unknown, fallback?: string, maxLen = 600): string {
  if (raw === null || raw === undefined) return "";
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text) return "";
  if (looksLikeCode(text)) {
    const lines = text.split(/\r?\n/).length;
    return fallback ?? `（Ovo 看到屏幕上有约 ${lines} 行代码 / 配置，已隐藏原文）`;
  }
  if (text.length > maxLen) {
    return text.slice(0, maxLen).trimEnd() + "…";
  }
  return text;
}
