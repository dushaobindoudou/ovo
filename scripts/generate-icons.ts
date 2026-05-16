/**
 * 生成 OVO 应用图标（PNG + icns）到 build/。
 *
 * 用法：pnpm gen:icons
 *
 * 必须作为 Electron app 入口跑（因为 nativeImage 仅在 Electron main 进程可用）。
 * 启动 → app.whenReady → 渲染并写文件 → app.quit。
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderAppIcon, renderTrayIcon } from "../electron/icon-renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const BUILD_DIR = path.join(ROOT, "build");
const ICONSET_DIR = path.join(BUILD_DIR, "icon.iconset");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writePng(filePath: string, size: number) {
  const img = renderAppIcon(size);
  fs.writeFileSync(filePath, img.toPNG());
  console.log(`  wrote ${path.relative(ROOT, filePath)} (${size}x${size})`);
}

function writeTrayPng(filePath: string) {
  const img = renderTrayIcon();
  fs.writeFileSync(filePath, img.toPNG());
  console.log(`  wrote ${path.relative(ROOT, filePath)} (tray)`);
}

function main() {
  ensureDir(BUILD_DIR);

  console.log("[icons] 生成应用 PNG");
  writePng(path.join(BUILD_DIR, "icon.png"), 1024);
  writePng(path.join(BUILD_DIR, "icon-512.png"), 512);
  writePng(path.join(BUILD_DIR, "icon-256.png"), 256);

  console.log("[icons] 生成托盘 PNG");
  writeTrayPng(path.join(BUILD_DIR, "icon-tray.png"));

  // macOS：用 iconutil 生成 icns
  if (process.platform === "darwin") {
    console.log("[icons] 生成 macOS .icns");
    ensureDir(ICONSET_DIR);
    const SIZES = [
      { size: 16, suffix: "16x16" },
      { size: 32, suffix: "16x16@2x" },
      { size: 32, suffix: "32x32" },
      { size: 64, suffix: "32x32@2x" },
      { size: 128, suffix: "128x128" },
      { size: 256, suffix: "128x128@2x" },
      { size: 256, suffix: "256x256" },
      { size: 512, suffix: "256x256@2x" },
      { size: 512, suffix: "512x512" },
      { size: 1024, suffix: "512x512@2x" }
    ];
    for (const { size, suffix } of SIZES) {
      writePng(path.join(ICONSET_DIR, `icon_${suffix}.png`), size);
    }
    try {
      execSync(`iconutil -c icns -o "${path.join(BUILD_DIR, "icon.icns")}" "${ICONSET_DIR}"`);
      console.log(`  wrote build/icon.icns`);
      fs.rmSync(ICONSET_DIR, { recursive: true, force: true });
    } catch (err) {
      console.error("[icons] iconutil 失败：", err);
    }
  }

  console.log("[icons] 完成");
}

app.whenReady().then(() => {
  try {
    main();
    app.quit();
  } catch (err) {
    console.error("[icons] 失败", err);
    app.exit(1);
  }
});
