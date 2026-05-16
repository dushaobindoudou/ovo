import { createRequire } from "node:module";

type ElectronModule = typeof import("electron");

// ESM 模式下 require 不是全局可用的；createRequire 基于 import.meta.url 重建一个。
// 测试脚本（pure node 环境）里 createRequire 也存在，所以同样安全。
let cached: ElectronModule | null | undefined;

export function loadElectron(): ElectronModule | null {
  if (cached !== undefined) return cached;
  try {
    const localRequire = createRequire(import.meta.url);
    cached = localRequire("electron") as ElectronModule;
    // 当 electron 是 string（renderer/preload context 时是 path string），视为不可用
    if (typeof cached !== "object" || !cached) cached = null;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function getUserDataPath(): string {
  const electron = loadElectron();
  if (electron?.app && typeof electron.app.getPath === "function") {
    try {
      return electron.app.getPath("userData");
    } catch {
      /* fallthrough */
    }
  }
  return process.cwd();
}
