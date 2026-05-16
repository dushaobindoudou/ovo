/**
 * 打包后冒烟检查：解开 app.asar，验证 ipc-handlers.js 中的 ipcMain.handle 数量
 * 与 preload.cjs 白名单一致。这是为了避免历史问题：渲染器 channel 与主进程注册不一致
 * 导致"No handler registered"。
 *
 * 用法：pnpm smoke:postpack
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

const APP_PATH = path.resolve("out/mac-arm64/ovo.app/Contents/Resources/app.asar");

function fail(msg: string): never {
  console.error(`[postpack-smoke] FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(APP_PATH)) {
  fail(`未找到 ${APP_PATH}，请先 pnpm pack:dir`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ovo-postpack-"));
console.log(`[postpack-smoke] extract -> ${tmp}`);
try {
  execFileSync("npx", ["asar", "extract", APP_PATH, tmp], { stdio: ["ignore", "pipe", "pipe"] });
} catch (err) {
  fail(`asar extract 失败: ${err instanceof Error ? err.message : String(err)}`);
}

const ipcPath = path.join(tmp, "dist-electron/electron/ipc-handlers.js");
const preloadPath = path.join(tmp, "electron/preload.cjs");
if (!fs.existsSync(ipcPath)) fail("ipc-handlers.js 不在 asar 中");
if (!fs.existsSync(preloadPath)) fail("preload.cjs 不在 asar 中");

const ipcSrc = fs.readFileSync(ipcPath, "utf8");
const preloadSrc = fs.readFileSync(preloadPath, "utf8");

const handleMatches = ipcSrc.match(/ipcMain\.handle\(\s*"([^"]+)"/g) ?? [];
const handlerNames = handleMatches
  .map((m) => /ipcMain\.handle\(\s*"([^"]+)"/.exec(m)?.[1])
  .filter((s): s is string => Boolean(s));
console.log(`[postpack-smoke] handlers registered: ${handlerNames.length}`);

const allowedSection = preloadSrc.match(/ALLOWED_CHANNELS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
const allowedNames = Array.from(allowedSection.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
console.log(`[postpack-smoke] preload allowed invoke channels: ${allowedNames.length}`);

const eventSection = preloadSrc.match(/ALLOWED_EVENT_CHANNELS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
const eventNames = Array.from(eventSection.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
console.log(`[postpack-smoke] preload allowed event channels: ${eventNames.length}`);

let failed = false;
const requireAtLeast = (label: string, actual: number, min: number) => {
  if (actual < min) {
    console.error(`[postpack-smoke] FAIL: ${label} 期望 >= ${min}, 实际 ${actual}`);
    failed = true;
  }
};
requireAtLeast("ipcMain.handle 数量", handlerNames.length, 50);
requireAtLeast("preload invoke 白名单", allowedNames.length, 50);
requireAtLeast("preload event 白名单", eventNames.length, 8);

const handlerSet = new Set(handlerNames);
const missingHandlers: string[] = [];
for (const ch of allowedNames) {
  if (!handlerSet.has(ch)) {
    // 排除一定不需要 handler 的 channel（事件性的）
    if (ch === "permissions:status" || ch === "log:stream") continue;
    missingHandlers.push(ch);
  }
}
if (missingHandlers.length > 0) {
  console.error(`[postpack-smoke] FAIL: preload 暴露但主进程未注册的 channel：${missingHandlers.join(", ")}`);
  failed = true;
}

const allowedSet = new Set(allowedNames);
const orphanHandlers: string[] = [];
for (const h of handlerNames) {
  if (!allowedSet.has(h)) orphanHandlers.push(h);
}
if (orphanHandlers.length > 0) {
  console.warn(`[postpack-smoke] WARN: 主进程注册但 preload 未暴露：${orphanHandlers.join(", ")}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  process.exit(1);
}
console.log("[postpack-smoke] PASS");
