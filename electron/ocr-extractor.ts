/**
 * P4: OCR 文本结构化抽取
 *
 * 目的：把 OCR 出的一锅粥（按钮 / 菜单 / 正文 全混在一起）
 * 拆出有结构的"关键信号"——URL / 邮箱 / 价格 / 代码块 / 标题 / 日期 / 文件路径
 *
 * 这些信号单独喂给 LLM 比正文 OCR 更准——LLM 不被 UI 文字噪音干扰。
 */

export interface StructuredSignals {
  urls: string[];
  emails: string[];
  prices: string[];           // "$95,234" / "￥4,200" / "23.5 BTC" 等
  codeSnippets: string[];     // 可能是代码块的片段
  headings: string[];         // 短行 + 看起来像标题（全大写、首字母大写、末尾无标点）
  filePaths: string[];        // /Users/... 或 ~/... 或 C:\... 或 ./...
  dates: string[];            // ISO / 2026-04-28 / 2026年4月28日
  ipAddrs: string[];          // 偶尔有
  hashtags: string[];
}

const URL_RE = /https?:\/\/[^\s)<>'"`]+/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// 价格: 货币符号 / ISO 代码 + 数字（含千位分隔和小数）；或纯数字 + 单位（USD/CNY/BTC/ETH）
const PRICE_RE = /(?:\$|￥|¥|€|£|US\$|HK\$|CNY|USD|EUR|JPY|RMB)\s?[\d]+(?:[,，][\d]{3})*(?:\.\d+)?|\d+(?:[,，]\d{3})*(?:\.\d+)?\s?(?:BTC|ETH|USDT|USD|CNY|RMB|EUR|GBP|JPY|元|美元|港币)/g;
const FILE_PATH_RE = /(?:^|\s)((?:\/Users\/|~\/|\.{1,2}\/|[A-Z]:\\)[A-Za-z0-9_./\\-]{2,}\.[A-Za-z0-9]{1,8})/g;
const DATE_RE = /\b(?:\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const HASHTAG_RE = /#[一-龥A-Za-z0-9_]{2,30}/g;

/** 可能是代码：包含连续的 () {} ; = 操作符 + 缩进 / 大括号密度 */
const CODE_HINT_RE = /[{};=()<>[\]]/g;

function uniqueTrim(arr: string[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const t = x.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function detectHeadings(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 标题特征：3-60 字符、不以标点结尾、字母占多数、有大写字母 / 中文实词
    if (line.length < 3 || line.length > 60) continue;
    if (/[。！？.!?,;]$/.test(line)) continue;
    const letters = line.match(/[A-Za-z一-龥]/g)?.length ?? 0;
    if (letters < line.length * 0.5) continue;
    // 全大写英文短句 / 中文 + 中英文混合都算
    const upperRatio = ((line.match(/[A-Z]/g)?.length ?? 0) /
      Math.max(1, (line.match(/[A-Za-z]/g)?.length ?? 0)));
    const isLikelyHeading =
      upperRatio > 0.5 ||                                    // 全大写英文
      /^第[一二三四五六七八九十百千]+[章节部分]/.test(line) || // "第三章 X"
      /^\d+\.\s+\S/.test(line) ||                            // "1. 标题"
      /^[一二三四五六七八九十]+、/.test(line);                // "一、标题"
    if (isLikelyHeading) out.push(line);
  }
  return uniqueTrim(out, 8);
}

function detectCodeSnippets(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buf: string[] = [];
  let bufScore = 0;
  const flush = () => {
    if (buf.length >= 2 && bufScore >= 4) {
      out.push(buf.join("\n").slice(0, 240));
    }
    buf = [];
    bufScore = 0;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const codeChars = (line.match(CODE_HINT_RE)?.length ?? 0);
    const looksCode =
      codeChars >= 2 ||                                     // 多个代码符号
      /^\s{2,}\S/.test(raw) ||                              // 缩进
      /^(import|export|function|const|let|var|class|def|return|if|for|while)\b/.test(line) ||
      /[a-zA-Z_]\w*\s*\(/.test(line);                       // 函数调用
    if (looksCode) {
      buf.push(line);
      bufScore += codeChars;
    } else {
      flush();
    }
  }
  flush();
  return uniqueTrim(out, 5);
}

function matchAll(text: string, re: RegExp, limit = 10): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] ?? m[0]);
    if (out.length >= limit) break;
  }
  return uniqueTrim(out, limit);
}

export function extractStructured(text: string): StructuredSignals {
  if (!text || text.length < 5) {
    return {
      urls: [], emails: [], prices: [], codeSnippets: [],
      headings: [], filePaths: [], dates: [], ipAddrs: [], hashtags: []
    };
  }
  return {
    urls: matchAll(text, URL_RE),
    emails: matchAll(text, EMAIL_RE),
    prices: matchAll(text, PRICE_RE),
    codeSnippets: detectCodeSnippets(text),
    headings: detectHeadings(text),
    filePaths: matchAll(text, FILE_PATH_RE),
    dates: matchAll(text, DATE_RE),
    ipAddrs: matchAll(text, IP_RE, 5),
    hashtags: matchAll(text, HASHTAG_RE, 8)
  };
}

/** 把结构化信号打包成 prompt 用的简短字符串。空时返回 "" */
export function formatStructuredForPrompt(s: Partial<StructuredSignals>): string {
  const lines: string[] = [];
  const urls = s.urls ?? []; if (urls.length) lines.push(`URL: ${urls.join(" | ")}`);
  const emails = s.emails ?? []; if (emails.length) lines.push(`Email: ${emails.join(" | ")}`);
  const prices = s.prices ?? []; if (prices.length) lines.push(`价格/金额: ${prices.join(" | ")}`);
  const headings = s.headings ?? []; if (headings.length) lines.push(`标题: ${headings.slice(0, 5).join(" | ")}`);
  const filePaths = s.filePaths ?? []; if (filePaths.length) lines.push(`文件路径: ${filePaths.join(" | ")}`);
  const codeSnippets = s.codeSnippets ?? [];
  if (codeSnippets.length) {
    const preview = codeSnippets[0].split("\n").slice(0, 3).join(" / ");
    lines.push(`代码片段(${codeSnippets.length}): ${preview}`);
  }
  const dates = s.dates ?? []; if (dates.length) lines.push(`日期: ${dates.join(" | ")}`);
  const hashtags = s.hashtags ?? []; if (hashtags.length) lines.push(`话题: ${hashtags.join(" | ")}`);
  const ipAddrs = s.ipAddrs ?? []; if (ipAddrs.length) lines.push(`IP: ${ipAddrs.join(" | ")}`);
  return lines.join("\n");
}
