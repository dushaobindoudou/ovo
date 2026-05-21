/**
 * text-sanitize.ts —— LLM 输出落地为"用户可见文本"前的统一清洗层。
 *
 * 用户多次反馈：浮窗/Toast/详情卡里冒出一段前端代码（CSS 选择器、JS 片段）。
 * 真根因：LLM 偶尔把 OCR 看到的屏幕代码原文当作 prediction / summary /
 * suggestion.content / action.description 写回来。我们之前只在 receipt 这
 * 一个口子做过过滤（copy_to_clipboard），其他 N 个口子全裸——任何一处都可能漏。
 *
 * 解决：在 LLM 输出 parse 后**一次性**清洗所有面向用户的文本字段。后续 UI
 * 端可以认为这些字段已经"安全"，无需各自再防御。
 *
 * 策略：宁可错杀少量真实自然语言，也不要把代码漏到用户脸前——代码看起来
 * 就是"出 bug 了"，破坏信任远甚于偶尔抽象化一句话。
 */

/**
 * 检测一段文本是否"看起来像代码"。
 *
 * 启发式（任一命中即视为代码）：
 *   - 含 markdown 围栏 ```
 *   - 含常见编程关键字 + 紧跟标识符/括号（function/class/const/let/var/import/...）
 *   - 含箭头函数语法 => {
 *   - 含 CSS 选择器特征（伪类 :hover/:disabled/:not、属性选择器、@media、grid- 等）
 *   - 大括号/分号密度异常高
 *   - 多行（≥4）带缩进结构
 *
 * 故意保守：用户讨论"代码"二字本身不会触发，要有结构特征才触发。
 */
export function looksLikeCode(s: string): boolean {
  if (!s) return false;
  const text = String(s);
  if (/```/.test(text)) return true;
  // 编程关键字结构
  if (/\b(function|class|const|let|var|import|export|return|interface|public|private|async|await)\s+[A-Za-z_]/.test(text)) return true;
  if (/=>\s*[{(]/.test(text)) return true;
  // CSS 特征：伪类/属性选择器/@规则/grid- 等
  if (/:(?:not|hover|focus|active|disabled|first-child|last-child|nth-child)\b/.test(text)) return true;
  if (/@media\b|@keyframes\b|@import\b|@supports\b/.test(text)) return true;
  if (/\{[^{}]*:[^{}]*[;}]/.test(text) && /[{}]/.test(text)) {
    // 至少一个 "key:value;" 结构 + 多个大括号 = CSS / JSON-ish
    const braces = (text.match(/[{}]/g) ?? []).length;
    if (braces >= 2) return true;
  }
  // 大括号 / 分号密度
  const braceCount = (text.match(/[{}]/g) ?? []).length;
  const semiCount = (text.match(/;/g) ?? []).length;
  if (text.length > 40 && braceCount + semiCount >= 5) return true;
  // 4+ 连续行带缩进（典型代码结构）
  const indentedLines = (text.match(/(^|\n)[ \t]{2,}\S/g) ?? []).length;
  if (indentedLines >= 4) return true;
  return false;
}

/**
 * 把"用户可见"的一段文本清洗成安全文案。
 *   - 检测到代码 → 用 fallback 句替换，保留长度信息让 UX 不至于落空
 *   - 普通文本 → 原样返回
 *
 * @param raw    LLM 输出的原始字符串
 * @param fallback 命中时的替换文案（默认中文友好语义）
 * @param maxLen 普通文本的最大保留长度（防 LLM 突然吐巨长段落）
 */
export function sanitizeUserVisibleText(raw: unknown, fallback?: string, maxLen = 800): string {
  if (raw === null || raw === undefined) return "";
  const text = typeof raw === "string" ? raw : String(raw);
  if (looksLikeCode(text)) {
    const lines = text.split(/\r?\n/).length;
    const fb = fallback ?? `（Ovo 看到屏幕上有约 ${lines} 行代码 / 配置内容，已隐藏原文）`;
    return fb;
  }
  if (text.length > maxLen) {
    return text.slice(0, maxLen).trimEnd() + "…";
  }
  return text;
}

/**
 * 清洗 LLM 返回的整套 parsed payload —— 一次调用覆盖所有 user-visible 字段。
 * 直接 mutate 传入对象（性能更好，主流程已经把 parsed 当 mutable 用）。
 *
 * 覆盖范围：
 *   - intent / summary / prediction（顶层观察）
 *   - actions[].description
 *   - suggestions[].title / .content / .detail
 *   - offers[].title / .value_prop / .first_action_preview
 */
export function sanitizeParsedPayload(parsed: Record<string, unknown> | null | undefined): void {
  if (!parsed || typeof parsed !== "object") return;
  if (typeof parsed.intent === "string") parsed.intent = sanitizeUserVisibleText(parsed.intent, "（在看代码或配置）");
  if (typeof parsed.summary === "string") parsed.summary = sanitizeUserVisibleText(parsed.summary, "（看到一段代码 / 配置，未提取语义）");
  if (typeof parsed.prediction === "string") parsed.prediction = sanitizeUserVisibleText(parsed.prediction, "（基于屏幕上的代码内容，暂无明确预测）");
  const actions = parsed.actions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (typeof a?.description === "string") a.description = sanitizeUserVisibleText(a.description, "（动作描述涉及代码，已隐藏）", 200);
    }
  }
  const suggestions = parsed.suggestions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(suggestions)) {
    for (const s of suggestions) {
      if (typeof s?.title === "string") s.title = sanitizeUserVisibleText(s.title, "（建议涉及代码片段）", 120);
      if (typeof s?.content === "string") s.content = sanitizeUserVisibleText(s.content, "（建议正文含代码，已隐藏避免干扰）", 400);
      if (typeof s?.detail === "string") s.detail = sanitizeUserVisibleText(s.detail, "（详情含代码，已隐藏）", 400);
    }
  }
  const offers = parsed.offers as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(offers)) {
    for (const o of offers) {
      if (typeof o?.title === "string") o.title = sanitizeUserVisibleText(o.title, "（offer 标题涉及代码）", 80);
      if (typeof o?.value_prop === "string") o.value_prop = sanitizeUserVisibleText(o.value_prop, "（涉及代码内容，已抽象）", 200);
      if (typeof o?.first_action_preview === "string") o.first_action_preview = sanitizeUserVisibleText(o.first_action_preview, "", 160);
    }
  }
}
