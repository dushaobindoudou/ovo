import type { OCRTextEntry, WindowBuffer } from "./types.js";

function levenshtein(a: string, b: string) {
  if (!a) return b.length;
  if (!b) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
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
    return true;
  }

  getBuffers() {
    return [...this.buffers.values()];
  }

  drainBuffers() {
    const list: WindowBuffer[] = [];
    // Use for...of to atomically drain all buffers
    for (const value of this.buffers.values()) {
      if (value.entries.length > 0) {
        list.push({
          ...value,
          entries: [...value.entries]
        });
        value.entries = [];
      }
    }
    return list;
  }
}
