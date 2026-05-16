/**
 * 文件路径被动识别。完全不调任何 fs API：
 * 仅从 OCR 文本里 regex 提取看起来像文件路径/文件名的字符串。
 * 由 pipeline 的 graphUpdate 阶段消费，写为 application_file entity。
 */

const FILE_EXT_WHITELIST = new Set([
  // 代码
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "pyx", "go", "rs", "java", "kt", "swift", "m", "cpp", "cc", "c", "h", "hpp",
  "rb", "php", "lua", "scala", "clj", "ex",
  // 文本/文档
  "md", "mdx", "txt", "rst", "tex", "org", "rtf",
  "pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "csv", "tsv",
  // 网页/配置
  "html", "css", "scss", "less", "vue", "svelte", "yaml", "yml", "toml", "ini",
  "json", "json5", "xml", "env",
  // 数据
  "sql", "db", "sqlite", "parquet", "log",
  // 媒体
  "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "mov", "mp3", "wav",
  // shell
  "sh", "zsh", "bash", "fish"
]);

export interface ExtractedFilePath {
  /** 完整识别出的字符串（可能是绝对路径、~ 相对路径、或纯文件名） */
  path: string;
  /** 仅文件名（去掉目录） */
  name: string;
  /** 扩展名（小写，无 .） */
  ext: string;
  /** 类别 */
  kind: "absolute" | "tilde" | "filename";
}

const ABS_PATH_RE = /(?:^|[\s"'`([<])(\/(?:Users|home|opt|tmp|var)\/[\w./@+-]+\.[A-Za-z0-9]{1,8})/g;
const TILDE_PATH_RE = /(?:^|[\s"'`([<])(~\/[\w./@+-]+\.[A-Za-z0-9]{1,8})/g;
// 纯文件名（不带路径分隔符），常见于编辑器 tab、git diff 输出
// 必须前后是空白/标点，避免抓 "google.com" 这种
const BARE_FILENAME_RE = /(?:^|[\s"'`([|<>])([A-Za-z0-9_\-.]+\.[A-Za-z0-9]{1,8})(?=[\s"'`)\]|<>:,;]|$)/g;

function stripQuotes(s: string) {
  return s.replace(/^["'`<[(]+|["'`>\])]+$/g, "");
}

function classify(raw: string, kind: ExtractedFilePath["kind"]): ExtractedFilePath | null {
  const cleaned = stripQuotes(raw).trim();
  if (!cleaned) return null;
  const lastSlash = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  const name = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  const lastDot = name.lastIndexOf(".");
  if (lastDot < 0 || lastDot === name.length - 1) return null;
  const ext = name.slice(lastDot + 1).toLowerCase();
  if (!FILE_EXT_WHITELIST.has(ext)) return null;
  // 过滤明显是网址尾巴的（"index.html" 在域名后）—— 但 url 通常被前面的 scheme 冲掉，这里只做最小过滤
  if (/^https?:\/\//i.test(cleaned)) return null;
  return { path: cleaned, name, ext, kind };
}

/**
 * 从一段 OCR 文本里抽取文件路径候选。
 * 返回去重后的列表，相同 path 只保留一条；优先级：absolute > tilde > filename。
 */
export function extractFilePaths(text: string): ExtractedFilePath[] {
  if (!text || text.length < 4) return [];
  const found = new Map<string, ExtractedFilePath>();

  const collect = (re: RegExp, kind: ExtractedFilePath["kind"]) => {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const candidate = classify(match[1] ?? match[0], kind);
      if (!candidate) continue;
      const existing = found.get(candidate.path);
      if (!existing) {
        found.set(candidate.path, candidate);
      } else if (rank(candidate.kind) < rank(existing.kind)) {
        found.set(candidate.path, candidate);
      }
    }
  };

  collect(ABS_PATH_RE, "absolute");
  collect(TILDE_PATH_RE, "tilde");
  collect(BARE_FILENAME_RE, "filename");

  return Array.from(found.values()).slice(0, 50); // 单次上限 50
}

function rank(k: ExtractedFilePath["kind"]) {
  return k === "absolute" ? 0 : k === "tilde" ? 1 : 2;
}
