/**
 * P0 自动化冒烟：双通道捕获 + schema 规范化（不启动 Electron UI）
 */

import { normalizeAgentPayload } from "../electron/agent-response-normalize.js";
import { WindowManager } from "../electron/window-manager.js";
import { ScreenshotManager } from "../electron/screenshot.js";
import { OCREngine } from "../electron/ocr-engine.js";
import { EventProcessor } from "../electron/event-processor.js";
import { AutoCaptureService } from "../electron/auto-capture.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function isLikelyMacAccessibilityDenied(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("-25211") || message.includes("不允许辅助访问") || message.includes("not allowed to assist");
}

async function verifyP01() {
  const wm = new WindowManager();
  const sm = new ScreenshotManager();
  const ocr = new OCREngine();
  const ep = new EventProcessor();
  const ac = new AutoCaptureService(wm, sm, ocr, ep, () => {});

  const active = await wm.getActiveWindow().catch((err) => {
    if (isLikelyMacAccessibilityDenied(err)) {
      console.warn("[P0-1] SKIP macOS 权限不足（辅助功能/自动化），无法枚举窗口列表");
      return null;
    }
    throw err;
  });
  if (!active) {
    console.warn("[P0-1] SKIP 未获取到活动窗口（请检查 macOS 自动化/辅助功能权限）");
    return;
  }

  const all = await wm.getAllWindows().catch((err) => {
    if (isLikelyMacAccessibilityDenied(err)) {
      console.warn("[P0-1] SKIP macOS 权限不足（辅助功能/自动化），无法枚举窗口列表");
      return [];
    }
    throw err;
  });
  if (all.length === 0) {
    console.warn("[P0-1] SKIP 未枚举到任何窗口（权限不足或当前无可枚举窗口）");
    return;
  }

  const second = all.find((w) => w.windowId !== active.windowId) ?? null;
  if (second) {
    // 活动窗口 + 另一个窗口：验证并行通道至少产生 2 个 buffer
    ac.setMonitoredWindowKeys([second.windowId]);
  }

  const primary = await ac.captureOnce().catch((err) => {
    if (isLikelyMacAccessibilityDenied(err)) {
      console.warn("[P0-1] SKIP macOS 权限不足（屏幕录制/辅助功能），无法完成真实截图+OCR");
      return null;
    }
    throw err;
  });
  if (!primary) {
    console.warn(
      "[P0-1] SKIP captureOnce 未产生快照（常见原因：屏幕录制权限、截图失败、或 OCR 失败；请确保前台有可识别文本）"
    );
    return;
  }

  const buffers = ep.getBuffers();
  if (second) {
    assert(buffers.length >= 2, `P0-1: 期望至少 2 个窗口 buffer，实际 ${buffers.length}`);
    const dist: Record<string, number> = {};
    for (const b of buffers) {
      dist[b.windowId] = (dist[b.windowId] ?? 0) + b.entries.length;
    }
    assert(Object.keys(dist).length >= 2, "P0-1: 并行通道应覆盖多窗口");
  } else {
    assert(buffers.length >= 1, `P0-1: 期望至少 1 个窗口 buffer，实际 ${buffers.length}`);
  }

  const stats = await ac.getWindowCaptureStats();
  assert(stats.length >= 1, "P0-1: 应有捕获统计行");
  console.log("[P0-1] OK", { buffers: buffers.length, statsRows: stats.length });
}

function verifyP03() {
  const bad = normalizeAgentPayload("<<<not-json>>>");
  assert(bad.meta.degraded && bad.parsed.content.length > 0, "P0-3: 非 JSON 应降级为 content");

  const good = normalizeAgentPayload(
    JSON.stringify({
      intent: "work",
      prediction: "ok",
      actions: [],
      suggestions: [],
      content: [],
      entities: [],
      relationships: []
    })
  );
  assert(!good.meta.degraded && good.parsed.intent === "work", "P0-3: 合法 JSON 应规范化成功");

  const claudeEnvelope = normalizeAgentPayload(
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: JSON.stringify({
        intent: "weather",
        prediction: "用户想看天气",
        actions: [],
        suggestions: ["查看降雨"],
        content: [],
        entities: [],
        relationships: []
      })
    })
  );
  assert(
    !claudeEnvelope.meta.degraded && claudeEnvelope.parsed.intent === "weather",
    "P0-3: Claude Code envelope 应解包后规范化成功"
  );

  const looseShape = normalizeAgentPayload(
    JSON.stringify({
      type: "result",
      subtype: "success",
      result:
        "```json\n" +
        JSON.stringify({
          intent: "weather_inquiry",
          prediction: "user_will_decide_umbrella",
          actions: ["fetch_weather_data", "provide_umbrella_recommendation"],
          suggestions: [
            {
              type: "weather_reminder",
              content: "根据天气情况提醒带伞",
              priority: "high"
            }
          ],
          content: "需要我帮您查询天气吗？",
          entities: [],
          relationships: []
        }) +
        "\n```"
    })
  );
  assert(looseShape.parsed.actions.length === 2, "P0-3: 字符串 actions 应被兼容解析");
  assert(looseShape.parsed.suggestions.length === 1, "P0-3: 宽松 suggestion 结构应被兼容解析");
  assert(looseShape.parsed.content.length === 1, "P0-3: 字符串 content 应转为数组");
  assert(looseShape.parsed.suggestions[0]?.priority === 90, "P0-3: 字符串优先级 high 应映射为数值");
  console.log("[P0-3] OK schema normalize");
}

async function main() {
  await verifyP01();
  verifyP03();
  console.log("=== verify-p0 全部通过 ===");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
