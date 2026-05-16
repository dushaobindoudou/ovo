/**
 * macOS 原生动作封装。所有函数都用 osascript / shell.openExternal 调系统应用。
 * 失败时抛带语义的错误，让 action-executor 转成 ActionResult.error 给 UI 展示。
 */
import { execa } from "execa";
import { loadElectron } from "./electron-loader.js";
import { getExpandedPath } from "./path-helpers.js";

function execEnv() {
  return { ...process.env, PATH: getExpandedPath() };
}

async function runOsa(script: string, timeout = 10_000) {
  try {
    const { stdout } = await execa("osascript", ["-e", script], { timeout, env: execEnv() });
    return stdout;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/not authorized|not allowed|-1743/i.test(msg)) {
      throw new Error("自动化权限未授予，请在 系统设置 → 隐私与安全 → 自动化 中允许 ovo 控制目标应用");
    }
    throw new Error(`osascript 失败: ${msg.slice(0, 240)}`);
  }
}

function escapeAS(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 在 Reminders.app 创建一条提醒 */
export async function createReminder(opts: { title: string; dueAt?: string }) {
  const due = opts.dueAt ? `, due date:date "${escapeAS(opts.dueAt)}"` : "";
  const script = `tell application "Reminders" to make new reminder with properties {name:"${escapeAS(opts.title)}"${due}}`;
  await runOsa(script);
  return { ok: true };
}

/** 在默认日历建一个事件（开始时间用 ISO；结束时间不传则默认 +1h） */
export async function createCalendarEvent(opts: {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
}) {
  const start = escapeAS(opts.startsAt);
  const end = opts.endsAt ? escapeAS(opts.endsAt) : "";
  const loc = opts.location ? `, location:"${escapeAS(opts.location)}"` : "";
  const script = `tell application "Calendar"
  tell calendar 1
    make new event with properties {summary:"${escapeAS(opts.title)}", start date:date "${start}"${end ? `, end date:date "${end}"` : ""}${loc}}
  end tell
end tell`;
  await runOsa(script, 12_000);
  return { ok: true };
}

/** 给指定联系人发 iMessage（params 必须 requireConfirm=true 由用户确认后才走到这里） */
export async function sendIMessage(opts: { to: string; body: string }) {
  const script = `tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${escapeAS(opts.to)}" of targetService
  send "${escapeAS(opts.body)}" to targetBuddy
end tell`;
  await runOsa(script, 12_000);
  return { ok: true };
}

/** 在 Mail.app 创建一封草稿邮件并打开（不直接发送） */
export async function createMailDraft(opts: { to?: string; subject?: string; body?: string }) {
  const to = opts.to ? `, address:"${escapeAS(opts.to)}"` : "";
  const subject = opts.subject ? `, subject:"${escapeAS(opts.subject)}"` : "";
  const body = opts.body ? `, content:"${escapeAS(opts.body)}"` : "";
  const recipientBlock = opts.to
    ? `tell newMessage
      make new to recipient at end of to recipients with properties {address:"${escapeAS(opts.to)}"}
    end tell`
    : "";
  const script = `tell application "Mail"
  set newMessage to make new outgoing message with properties {visible:true${subject}${body}}
  ${recipientBlock}
end tell`;
  void to;
  await runOsa(script, 12_000);
  return { ok: true };
}

/** 用默认浏览器打开一个 URL */
export async function openUrl(url: string) {
  const electron = loadElectron();
  if (electron?.shell?.openExternal) {
    await electron.shell.openExternal(url);
    return { ok: true };
  }
  // fallback：command-line `open`
  await execa("open", [url], { env: execEnv() });
  return { ok: true };
}

/** 在某个搜索引擎上搜 query。target 用枚举值，未知统一走 google */
export async function searchWeb(query: string, target?: string) {
  const enc = encodeURIComponent(query);
  const map: Record<string, string> = {
    google: `https://www.google.com/search?q=${enc}`,
    stackoverflow: `https://stackoverflow.com/search?q=${enc}`,
    github: `https://github.com/search?q=${enc}`,
    twitter: `https://twitter.com/search?q=${enc}`,
    docs: `https://duckduckgo.com/?q=${enc}+documentation`
  };
  const url = map[target ?? "google"] ?? map.google;
  return openUrl(url);
}
