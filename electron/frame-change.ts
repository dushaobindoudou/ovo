/**
 * 帧间变化检测——屏幕内容未变化时跳过 OCR。
 *
 * 算法：对每个窗口缩略图，缩到 8×8 灰度（64 个 byte），求平均亮度后做差分哈希。
 * 与上一帧的哈希做 Hamming 距离比较；距离低于阈值认为没变化。
 *
 * 性能：每帧 resize + getBitmap + hash 总计 1-3ms（NativeImage 走 native 实现）；
 *      远低于 OCR 的 30-2000ms，跳过命中时收益巨大（看视频/读文档等静态场景）。
 */
import type { NativeImage } from "electron";

const HASH_SIZE = 8; // 8×8 = 64 bit
const TOTAL_BITS = HASH_SIZE * HASH_SIZE;
// Hamming 距离阈值：低于此值认为"基本没变"。
// 8×8 共 64 bit，5/64 ≈ 8% 变化容忍——文本闪动光标不算变化，但内容滚动会触发。
const UNCHANGED_THRESHOLD = 5;
// 强制 OCR 最小间隔：即使内容没变，每 N 秒至少跑一次确保下游 buffer 仍在更新
const FORCE_RECHECK_MS = 60_000;

function computeHash(image: NativeImage): bigint {
  // 缩到 8×8 RGBA = 256 字节
  const small = image.resize({ width: HASH_SIZE, height: HASH_SIZE, quality: "good" });
  const bitmap = small.getBitmap(); // Buffer RGBA
  // 计算每个像素的灰度（Rec. 601）
  const grays = new Array<number>(TOTAL_BITS);
  let sum = 0;
  for (let i = 0; i < TOTAL_BITS; i += 1) {
    const o = i * 4;
    const r = bitmap[o] ?? 0;
    const g = bitmap[o + 1] ?? 0;
    const b = bitmap[o + 2] ?? 0;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    grays[i] = gray;
    sum += gray;
  }
  const avg = sum / TOTAL_BITS;
  // 高于均值为 1，否则为 0
  let hash = 0n;
  for (let i = 0; i < TOTAL_BITS; i += 1) {
    if (grays[i] >= avg) hash |= 1n << BigInt(i);
  }
  return hash;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor !== 0n) {
    if (xor & 1n) count += 1;
    xor >>= 1n;
  }
  return count;
}

export class FrameChangeDetector {
  private hashes = new Map<string, { hash: bigint; lastForcedAt: number }>();

  /**
   * 判断 windowId 对应窗口的画面是否相对上次有明显变化。
   * - 第一次见这个窗口 → 总是认为变化（需要 OCR）
   * - 距上次强制 OCR 超过 FORCE_RECHECK_MS → 也认为变化
   * - 否则比较哈希
   */
  hasChanged(windowId: string, image: NativeImage): boolean {
    let hash: bigint;
    try {
      hash = computeHash(image);
    } catch {
      // 出错时不阻断流程，直接当作"变化了"让 OCR 继续
      return true;
    }
    const prev = this.hashes.get(windowId);
    const now = Date.now();
    if (!prev) {
      this.hashes.set(windowId, { hash, lastForcedAt: now });
      return true;
    }
    const elapsed = now - prev.lastForcedAt;
    if (elapsed >= FORCE_RECHECK_MS) {
      // 强制刷新，更新哈希和时间戳
      this.hashes.set(windowId, { hash, lastForcedAt: now });
      return true;
    }
    const distance = hammingDistance(hash, prev.hash);
    if (distance > UNCHANGED_THRESHOLD) {
      // 有实质变化
      this.hashes.set(windowId, { hash, lastForcedAt: prev.lastForcedAt });
      return true;
    }
    // 没变化
    return false;
  }

  /** 清除某个 windowId 的状态（窗口关闭/清缓存时调） */
  forget(windowId: string) {
    this.hashes.delete(windowId);
  }

  /** 清全部 */
  clear() {
    this.hashes.clear();
  }

  size() {
    return this.hashes.size;
  }
}
