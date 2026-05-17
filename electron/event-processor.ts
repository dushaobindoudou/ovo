import type { OCRTextEntry, WindowBuffer } from "./types.js";
import { errorLogger } from "./error-logger.js";

const BUFFER_WARN_ENTRY_THRESHOLD = 200;

/**
 * 快速相似度——替代原来的 Levenshtein（O(n·m) 同步阻塞主进程的元凶）。
 *
 * 三段采样比较：取首 256 / 中 256 / 末 256 字符做 FNV-1a 哈希；
 * 三段都匹配 → 1.0（极度相似）；匹配 2 段 → 0.66；1 段 → 0.33；0 段 → 0。
 * 配合长度差阈值（>30% 直接判异）几乎对所有真实场景给出正确判定。
 *
 * 复杂度 O(n)，2000 字 string 比较 < 0.5ms（原 Levenshtein 数百毫秒）。
 */
function fnv1a(str: string, start: number, end: number): number {
  let h = 0x811c9dc5;
  const limit = Math.min(end, str.length);
  for (let i = start; i < limit; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  // 长度差 > 30% 直接判异——文本量差这么大基本不可能是同一画面
  const la = a.length;
  const lb = b.length;
  const lenDiff = Math.abs(la - lb) / Math.max(la, lb);
  if (lenDiff > 0.3) return 0;
  // 三段哈希采样：首 / 中 / 末
  const window = 256;
  const aMid = Math.max(0, Math.floor(la / 2) - window / 2);
  const bMid = Math.max(0, Math.floor(lb / 2) - window / 2);
  const aEnd = Math.max(0, la - window);
  const bEnd = Math.max(0, lb - window);
  let hits = 0;
  if (fnv1a(a, 0, window) === fnv1a(b, 0, window)) hits += 1;
  if (fnv1a(a, aMid, aMid + window) === fnv1a(b, bMid, bMid + window)) hits += 1;
  if (fnv1a(a, aEnd, la) === fnv1a(b, bEnd, lb)) hits += 1;
  return hits / 3;
}

export class EventProcessor {
  private buffers = new Map<string, WindowBuffer>();

  append(windowId: string, appName: string, windowTitle: string, entry: OCRTextEntry) {
    const key = `${windowId}::${appName}`;
    const existing = this.buffers.get(key);
    if (!existing) {
      this.buffers.set(key, {
        windowId,
        appName,
        windowTitle,
        entries: [entry],
        lastFullText: entry.text
      });
      return true;
    }
    const score = similarity(existing.lastFullText, entry.text);
    if (score > 0.9) return false;
    existing.entries.push(entry);
    existing.lastFullText = entry.text;
    if (existing.entries.length === BUFFER_WARN_ENTRY_THRESHOLD) {
      errorLogger.alert("warn", "event-processor", "窗口缓冲积压", {
        windowId,
        appName,
        entryCount: existing.entries.length
      });
    }
    return true;
  }

  getBuffers() {
    return [...this.buffers.values()];
  }

  /**
   * 取出所有窗口的累积 OCR 数据。
   *
   * **不变量（NEW-2，必须保持）**：返回的每个 WindowBuffer 严格属于单一 (windowId, appName)，
   * 绝不可跨窗口/跨应用合并。下游 pipeline 按窗口独立调用 LLM，混合会导致：
   *   - LLM 把多 app 内容当一段理解 → 推断混乱
   *   - 敏感信息跨应用泄露（看银行 + 看推特 = 银行内容被当推特的上下文）
   *   - 用户体验：建议明显错位
   * 修改 buffers Map 的 key 策略（当前 `${windowId}::${appName}`）前必须同步修这里。
   */
  drainBuffers() {
    const list: WindowBuffer[] = [];
    for (const [key, value] of this.buffers.entries()) {
      if (value.entries.length === 0) continue;
      // Invariant 检查：key 必须能反推回 windowId + appName
      const expectedKey = `${value.windowId}::${value.appName}`;
      if (key !== expectedKey) {
        errorLogger.alert("error", "event-processor", "buffer key 不变量被破坏", {
          actualKey: key,
          expectedKey,
          windowId: value.windowId,
          appName: value.appName
        });
        continue; // 拒绝输出可疑的 buffer，宁可丢一帧也不混发
      }
      list.push({
        ...value,
        entries: [...value.entries]
      });
      value.entries = [];
    }
    return list;
  }

  /** 清空指定窗口的 buffer（按 key 或 windowId 前缀匹配） */
  clearBufferForWindow(windowId: string) {
    for (const key of Array.from(this.buffers.keys())) {
      if (key.startsWith(`${windowId}::`)) this.buffers.delete(key);
    }
  }

  /** 清空所有 buffer（auto-capture 启动时调用，避免老的 ovo 自身 OCR 残留） */
  clearAllBuffers() {
    this.buffers.clear();
  }
}
