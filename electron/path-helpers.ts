import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMMON_BINS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];

function expandHomePaths(home: string): string[] {
  return [
    path.join(home, ".local/bin"),
    path.join(home, ".bun/bin"),
    path.join(home, ".cargo/bin"),
    path.join(home, ".npm-global/bin"),
    path.join(home, ".deno/bin"),
    path.join(home, ".volta/bin"),
    path.join(home, ".rye/shims"),
    path.join(home, ".pyenv/shims"),
    path.join(home, ".asdf/shims")
  ];
}

function nvmCurrentBin(home: string): string[] {
  const aliasFile = path.join(home, ".nvm/alias/default");
  try {
    if (!fs.existsSync(aliasFile)) return [];
    const version = fs.readFileSync(aliasFile, "utf8").trim();
    if (!version) return [];
    const guess = path.join(home, ".nvm/versions/node", version.startsWith("v") ? version : `v${version}`, "bin");
    return fs.existsSync(guess) ? [guess] : [];
  } catch {
    return [];
  }
}

function parseShellRcPath(home: string): string[] {
  const candidates = [".zshrc", ".bashrc", ".bash_profile", ".profile"];
  const found: string[] = [];
  for (const file of candidates) {
    const filePath = path.join(home, file);
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      // 匹配 `export PATH=...` 与 `PATH=...`
      const re = /(?:^|\n)\s*(?:export\s+)?PATH=["']?([^"'\n]+)["']?/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content))) {
        const segments = match[1]
          .replace(/\$PATH/g, "")
          .replace(/\$HOME/g, home)
          .replace(/~\//g, `${home}/`)
          .split(":")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const seg of segments) {
          if (!found.includes(seg)) found.push(seg);
        }
      }
    } catch {
      /* ignore single file */
    }
  }
  return found;
}

let cached: string | null = null;

/**
 * 在打包应用里，从 Finder 启动的进程 PATH 仅含 /usr/bin:/bin，
 * 拿不到 /opt/homebrew/bin 这些用户安装的 CLI（hermes、claude 等）。
 *
 * 这里收集尽可能完整的常见 bin 路径，并附加用户 shell rc 中声明的 PATH，
 * 用 ":" 拼成一份扩展的 PATH 字符串，传给 execa。
 */
export function getExpandedPath(): string {
  if (cached) return cached;
  const home = os.homedir();
  const segments: string[] = [];
  if (process.env.PATH) segments.push(...process.env.PATH.split(":"));
  segments.push(...COMMON_BINS);
  segments.push(...expandHomePaths(home));
  segments.push(...nvmCurrentBin(home));
  segments.push(...parseShellRcPath(home));

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  cached = ordered.join(":");
  return cached;
}

/** 调试或 UI 展示用 */
export function describeExpandedPath(): { entries: string[]; total: number } {
  const entries = getExpandedPath().split(":").filter(Boolean);
  return { entries, total: entries.length };
}
