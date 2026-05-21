/**
 * 主进程轻量 i18n（P3）。
 *
 * renderer 用 react-i18next；主进程（托盘菜单 / 回执 toast 文案 / 通知）走这里。
 * 语言来源：preferences-store.uiLanguage（"zh" | "en" | "system"）。
 *   - "system" → app.getLocale()（OS 语言），zh* → 中文，其余 → 英文。
 * main.ts 启动时 setMainLanguage(prefs.getUiLanguage())；renderer 改语言时经 IPC 同步过来。
 *
 * 只覆盖主进程产生的面向用户文案；不追求完整，按需补 DICT。
 */
import { app } from "electron";

type Lang = "zh" | "en";
export type MainLanguagePref = "zh" | "en" | "system";

let pref: MainLanguagePref = "system";

export function setMainLanguage(p: MainLanguagePref): void {
  pref = p === "zh" || p === "en" ? p : "system";
}

function resolve(): Lang {
  if (pref === "zh" || pref === "en") return pref;
  let loc = "en";
  try { loc = app.getLocale() || "en"; } catch { /* app 未 ready 时兜底 en */ }
  return loc.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const DICT: Record<Lang, Record<string, string>> = {
  zh: {
    "tray.openConsole": "打开控制台",
    "tray.quit": "退出 ovo",
    "tray.tooltip": "ovo - AI 桌面助手",
    "receipt.copied": "ovo 已帮你复制",
    "receipt.copiedCode": "已复制 {len} 字符（约 {lines} 行，看起来是代码）",
    "receipt.copiedLong": "已复制：{preview}…（共 {len} 字符）",
    "receipt.emailSent": "ovo 已发送邮件",
    "receipt.imessageSent": "ovo 已发送 iMessage",
    "receipt.to": "收件人: {to}",
    "receipt.subject": "主题: {subject}",
    "receipt.reminderSet": "ovo 已设置提醒",
    "receipt.calendarAdded": "ovo 已加入日历",
    "receipt.noteLogged": "ovo 已记录提醒"
  },
  en: {
    "tray.openConsole": "Open console",
    "tray.quit": "Quit ovo",
    "tray.tooltip": "ovo - AI desktop assistant",
    "receipt.copied": "ovo copied for you",
    "receipt.copiedCode": "Copied {len} chars (~{lines} lines, looks like code)",
    "receipt.copiedLong": "Copied: {preview}… ({len} chars total)",
    "receipt.emailSent": "ovo sent the email",
    "receipt.imessageSent": "ovo sent the iMessage",
    "receipt.to": "To: {to}",
    "receipt.subject": "Subject: {subject}",
    "receipt.reminderSet": "ovo set a reminder",
    "receipt.calendarAdded": "ovo added to calendar",
    "receipt.noteLogged": "ovo logged a reminder"
  }
};

/** 主进程翻译。vars 用 {name} 占位插值。缺失 key 回退到 key 本身。 */
export function mt(key: string, vars?: Record<string, string | number>): string {
  const lang = resolve();
  let s = DICT[lang][key] ?? DICT.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
