/**
 * NEW-3: 同窗口连续帧的增量聚合。
 *
 * 一个 buffer 可能含 3-5 帧 OCR（drain 间隔 5s ×几次 OCR），相邻帧文本相似度 80-95%。
 * 全量 join 后送 LLM 会让 token 翻 3-5 倍，且让模型反复读重复内容。
 *
 * 这个模块把多帧 OCR 压成「初始基线 + 后续变化」的形式：
 *   - 第 1 帧：全量
 *   - 第 N 帧：与第 N-1 帧做行集合 diff，只列「+新增 / -移除」的行
 *   - 行内变化（如光标移动、文字微调）忽略——用集合而非序列对齐，cheap 且足够
 *
 * 算法：每帧拆行 → 取 trim 后非空行 → Set 比对。复杂度 O(n)，远低于 Myers diff。
 */
import type { OCRTextEntry } from "./types.js";

const MAX_ADDED_LINES_PER_FRAME = 30;
const MAX_REMOVED_LINES_PER_FRAME = 10;
// 帧间相似度 > 这个阈值就当作完全没变化，整帧跳过
const FRAME_UNCHANGED_RATIO = 0.95;

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * 把同一窗口的多帧 OCR 压成「基线 + 增量」形式，专供 LLM prompt 使用。
 * 单帧时直接返回原文，多帧时返回结构化 diff。
 */
export function buildAggregatedText(entries: OCRTextEntry[]): string {
  if (entries.length === 0) return "";
  if (entries.length === 1) return entries[0].text;

  const segments: string[] = [];
  const baseline = entries[0].text;
  segments.push(`[基线内容（首帧 OCR）]\n${baseline}`);

  let prevLines = new Set(splitLines(baseline));
  let lastChangedIdx = 0;

  for (let i = 1; i < entries.length; i += 1) {
    const curLines = splitLines(entries[i].text);
    const curSet = new Set(curLines);

    // 完全相同的整帧跳过
    if (prevLines.size === curSet.size) {
      let identical = true;
      for (const line of curSet) {
        if (!prevLines.has(line)) { identical = false; break; }
      }
      if (identical) continue;
    }

    const added: string[] = [];
    const removed: string[] = [];
    for (const line of curLines) {
      if (!prevLines.has(line)) added.push(line);
    }
    for (const line of prevLines) {
      if (!curSet.has(line)) removed.push(line);
    }

    // 变化比例太小（< 5%）的当作噪音跳过
    const totalChange = added.length + removed.length;
    const baseSize = Math.max(prevLines.size, curSet.size, 1);
    if (totalChange / baseSize < (1 - FRAME_UNCHANGED_RATIO) && totalChange < 3) {
      prevLines = curSet;
      continue;
    }

    const diffParts: string[] = [];
    if (added.length > 0) {
      const shown = added.slice(0, MAX_ADDED_LINES_PER_FRAME);
      diffParts.push(
        `新增 ${added.length} 行${added.length > shown.length ? `（仅显示前 ${shown.length}）` : ""}:`
          + "\n" + shown.map((l) => `+ ${l}`).join("\n")
      );
    }
    if (removed.length > 0) {
      const shown = removed.slice(0, MAX_REMOVED_LINES_PER_FRAME);
      diffParts.push(
        `移除 ${removed.length} 行${removed.length > shown.length ? `（仅显示前 ${shown.length}）` : ""}:`
          + "\n" + shown.map((l) => `- ${l}`).join("\n")
      );
    }

    if (diffParts.length > 0) {
      const elapsed = Math.max(0, Math.round((entries[i].timestamp - entries[lastChangedIdx].timestamp) / 1000));
      segments.push(`[+${elapsed}s 变化]\n${diffParts.join("\n")}`);
      lastChangedIdx = i;
    }
    prevLines = curSet;
  }

  // 帧之间全部无显著变化 → 只返回 baseline，不带 diff section
  if (segments.length === 1) return baseline;
  return segments.join("\n\n");
}

/**
 * 给调试 UI 用：返回 diff 统计（不含原文）。
 */
export function summarizeAggregation(entries: OCRTextEntry[]): {
  frameCount: number;
  baselineLength: number;
  changedFrames: number;
  totalAdded: number;
  totalRemoved: number;
} {
  if (entries.length === 0) {
    return { frameCount: 0, baselineLength: 0, changedFrames: 0, totalAdded: 0, totalRemoved: 0 };
  }
  let prev = new Set(splitLines(entries[0].text));
  let changedFrames = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  for (let i = 1; i < entries.length; i += 1) {
    const cur = new Set(splitLines(entries[i].text));
    let added = 0; let removed = 0;
    for (const l of cur) if (!prev.has(l)) added += 1;
    for (const l of prev) if (!cur.has(l)) removed += 1;
    if (added + removed > 0) {
      changedFrames += 1;
      totalAdded += added;
      totalRemoved += removed;
    }
    prev = cur;
  }
  return {
    frameCount: entries.length,
    baselineLength: entries[0].text.length,
    changedFrames,
    totalAdded,
    totalRemoved
  };
}
