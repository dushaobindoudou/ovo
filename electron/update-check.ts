/**
 * C7 stub: 自动更新检查（不引入 electron-updater，避免依赖膨胀）
 *
 * 启动后 30 秒异步 fetch GitHub Releases API，比较 tag_name 与当前版本。
 * 发现新版本 → errorLogger.alert("info", ...) 让用户在 StatusPanel 看到。
 *
 * 不自动下载/安装 — 完整的自动更新需要 Apple Developer 账号 + 代码签名 + Notarization +
 * electron-builder publish 配置，那是独立的 PR。
 *
 * 完全离线 / API 失败都是合理 fallback：不告警、不阻断、不显示"更新失败"打扰用户。
 */
import { app } from "electron";
import { errorLogger } from "./error-logger.js";

interface GitHubReleaseInfo {
  tag_name: string;
  html_url: string;
  published_at?: string;
}

const REPO_OWNER = "dushaobindoudou";
const REPO_NAME = "ovo";
const CHECK_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 24 * 3600 * 1000; // 每天检查一次

function compareSemver(a: string, b: string): number {
  // 简化 semver 比较：v0.2.0 → [0,2,0]
  const parse = (v: string) => v.replace(/^v/, "").split(".").map((s) => parseInt(s, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

async function fetchLatestRelease(): Promise<GitHubReleaseInfo | null> {
  try {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as GitHubReleaseInfo;
  } catch {
    return null;
  }
}

async function runOnce(): Promise<void> {
  const release = await fetchLatestRelease();
  if (!release?.tag_name) return;
  const current = app.getVersion();
  const latest = release.tag_name;
  if (compareSemver(latest, current) > 0) {
    errorLogger.alert("info", "auto-update.available", "Ovo 有新版本可用", {
      current,
      latest,
      url: release.html_url
    });
  }
}

let started = false;

/** 启动更新检查 — 仅生产构建跑（dev 跑测试干扰开发） */
export function startUpdateChecker(): void {
  if (started) return;
  started = true;
  if (!app.isPackaged) return; // dev 模式不查
  setTimeout(() => {
    void runOnce();
    setInterval(() => void runOnce(), CHECK_INTERVAL_MS).unref?.();
  }, CHECK_DELAY_MS);
}
