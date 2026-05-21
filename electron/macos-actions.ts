/**
 * macOS 原生动作封装。所有函数都用 osascript / shell.openExternal 调系统应用。
 * 失败时抛带语义的错误，让 action-executor 转成 ActionResult.error 给 UI 展示。
 *
 * SEC-3 安全设计：所有用户/LLM 提供的字符串走 osascript 的 `on run argv` 机制，
 * 通过命令行参数传入 AppleScript，**绝不字符串拼接进脚本本体**。
 * 这样 \n、引号、AppleScript 关键字都无法逃逸成可执行语句。
 */
import { execa } from "execa";
import { loadElectron } from "./electron-loader.js";
import { getExpandedPath } from "./path-helpers.js";

function execEnv() {
  return { ...process.env, PATH: getExpandedPath() };
}

/**
 * 跑一段 AppleScript，参数通过 `on run argv` 传入。
 * 脚本里用 `item N of argv` 取值，参数被 AppleScript 当作字符串字面量处理，无法转义出 string literal。
 */
async function runOsaWithArgs(script: string, args: string[], timeout = 10_000) {
  // 防御：osascript 在 macOS 上对 argv 长度有限制（约 256K），单参数太长截断
  const cleanArgs = args.map((a) => (typeof a === "string" ? a : String(a ?? "")).slice(0, 64_000));
  try {
    const { stdout } = await execa("osascript", ["-e", script, ...cleanArgs], {
      timeout,
      env: execEnv()
    });
    return stdout;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/not authorized|not allowed|-1743/i.test(msg)) {
      throw new Error("自动化权限未授予，请在 系统设置 → 隐私与安全 → 自动化 中允许 ovo 控制目标应用");
    }
    throw new Error(`osascript 失败: ${msg.slice(0, 240)}`);
  }
}

/** 在 Reminders.app 创建一条提醒 */
export async function createReminder(opts: { title: string; dueAt?: string }) {
  if (opts.dueAt) {
    await runOsaWithArgs(
      `on run argv
  tell application "Reminders"
    make new reminder with properties {name:(item 1 of argv), due date:(date (item 2 of argv))}
  end tell
end run`,
      [opts.title, opts.dueAt]
    );
  } else {
    await runOsaWithArgs(
      `on run argv
  tell application "Reminders"
    make new reminder with properties {name:(item 1 of argv)}
  end tell
end run`,
      [opts.title]
    );
  }
  return { ok: true };
}

/** 在默认日历建一个事件（开始时间用 ISO；结束时间不传则不设） */
export async function createCalendarEvent(opts: {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
}) {
  const script = `on run argv
  set theTitle to item 1 of argv
  set startStr to item 2 of argv
  set startDate to date startStr
  set endStr to ""
  if (count of argv) >= 3 then set endStr to item 3 of argv
  set loc to ""
  if (count of argv) >= 4 then set loc to item 4 of argv
  set hasEnd to (endStr is not "")
  set hasLoc to (loc is not "")
  tell application "Calendar"
    tell calendar 1
      if hasEnd and hasLoc then
        make new event with properties {summary:theTitle, start date:startDate, end date:(date endStr), location:loc}
      else if hasEnd then
        make new event with properties {summary:theTitle, start date:startDate, end date:(date endStr)}
      else if hasLoc then
        make new event with properties {summary:theTitle, start date:startDate, location:loc}
      else
        make new event with properties {summary:theTitle, start date:startDate}
      end if
    end tell
  end tell
end run`;
  const args = [opts.title, opts.startsAt, opts.endsAt ?? "", opts.location ?? ""];
  await runOsaWithArgs(script, args, 12_000);
  return { ok: true };
}

/** 给指定联系人发 iMessage（params 必须 requireConfirm=true 由用户确认后才走到这里） */
export async function sendIMessage(opts: { to: string; body: string }) {
  const script = `on run argv
  set toAddr to item 1 of argv
  set bodyText to item 2 of argv
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy toAddr of targetService
    send bodyText to targetBuddy
  end tell
end run`;
  await runOsaWithArgs(script, [opts.to, opts.body], 12_000);
  return { ok: true };
}

/** 在 Mail.app 创建一封草稿邮件并打开（不直接发送） */
export async function createMailDraft(opts: { to?: string; subject?: string; body?: string }) {
  const script = `on run argv
  set toAddr to item 1 of argv
  set subjStr to item 2 of argv
  set bodyStr to item 3 of argv
  tell application "Mail"
    set newMessage to make new outgoing message with properties {visible:true, subject:subjStr, content:bodyStr}
    if toAddr is not "" then
      tell newMessage
        make new to recipient at end of to recipients with properties {address:toAddr}
      end tell
    end if
  end tell
end run`;
  const args = [opts.to ?? "", opts.subject ?? "", opts.body ?? ""];
  await runOsaWithArgs(script, args, 12_000);
  return { ok: true };
}

/** 用默认浏览器打开一个 URL。SEC-2 上层已校验过 scheme 白名单 */
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

// ============================================================================
// 反向查询（产出物看板用）—— 拉 macOS Reminders / Calendar 未来 24h 内的条目
// ============================================================================

export interface ReminderItem {
  /** 提醒事项名 */
  name: string;
  /** 截止时间 ISO（可能为空） */
  dueAt?: string;
  /** 所属列表名 */
  listName?: string;
  /** 是否已完成 */
  completed: boolean;
}

export interface CalendarEventItem {
  /** 事件标题 */
  title: string;
  /** 开始时间 ISO */
  startsAt: string;
  /** 结束时间 ISO */
  endsAt?: string;
  /** 所属日历名 */
  calendarName?: string;
  /** 地点 */
  location?: string;
}

/**
 * 拉未来 N 小时内未完成的 Reminders（默认 48 小时窗口，覆盖"今天+明天"）。
 * 解析返回行格式：name\tdueISO\tlistName
 * 若没有 due date 的提醒则不返回（"未来"窗口的语义）。
 */
export async function listUpcomingReminders(hours = 48): Promise<ReminderItem[]> {
  const horizonMs = Date.now() + hours * 3600 * 1000;
  const horizonIso = new Date(horizonMs).toISOString();
  const script = `on run argv
  set out to ""
  set horizonText to item 1 of argv
  set horizonDate to (current date) -- placeholder, 下面用 ISO 解析
  tell application "Reminders"
    repeat with lst in lists
      try
        repeat with r in (every reminder of lst whose completed is false)
          try
            set rDue to due date of r
            if rDue is not missing value then
              set rName to name of r
              set lstName to name of lst
              set out to out & rName & tab & (rDue as string) & tab & lstName & linefeed
            end if
          end try
        end repeat
      end try
    end repeat
  end tell
  return out
end run`;
  let stdout = "";
  try {
    stdout = await runOsaWithArgs(script, [horizonIso], 12_000);
  } catch {
    return [];
  }
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: ReminderItem[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const name = parts[0];
    const dueStr = parts[1];
    const listName = parts[2] ?? undefined;
    // AppleScript 的 date 字符串 -> Date — 容错解析
    const due = new Date(dueStr);
    if (Number.isNaN(due.getTime())) continue;
    if (due.getTime() > horizonMs) continue;
    if (due.getTime() < Date.now() - 60 * 60 * 1000) continue; // 已过期 1h 之前不要
    out.push({ name, dueAt: due.toISOString(), listName, completed: false });
  }
  // 按时间正序
  out.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  return out.slice(0, 30);
}

/**
 * 拉未来 N 小时内的 Calendar 事件（默认 48 小时窗口）。
 * 返回字段尽力提取，失败的字段留 undefined。
 */
export async function listUpcomingCalendarEvents(hours = 48): Promise<CalendarEventItem[]> {
  const startIso = new Date().toISOString();
  const endIso = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const script = `on run argv
  set out to ""
  tell application "Calendar"
    repeat with cal in calendars
      try
        set evts to (every event of cal whose start date > ((current date) - 3600) and start date < ((current date) + 172800))
        repeat with ev in evts
          try
            set evTitle to summary of ev
            set evStart to start date of ev
            set evEnd to end date of ev
            set calName to name of cal
            set evLoc to location of ev
            if evLoc is missing value then set evLoc to ""
            set out to out & evTitle & tab & (evStart as string) & tab & (evEnd as string) & tab & calName & tab & evLoc & linefeed
          end try
        end repeat
      end try
    end repeat
  end tell
  return out
end run`;
  let stdout = "";
  try {
    stdout = await runOsaWithArgs(script, [startIso, endIso], 15_000);
  } catch {
    return [];
  }
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: CalendarEventItem[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const title = parts[0];
    const start = new Date(parts[1]);
    if (Number.isNaN(start.getTime())) continue;
    const endDate = parts[2] ? new Date(parts[2]) : undefined;
    const calendarName = parts[3] || undefined;
    const location = parts[4] || undefined;
    out.push({
      title,
      startsAt: start.toISOString(),
      endsAt: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
      calendarName,
      location
    });
  }
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return out.slice(0, 30);
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
