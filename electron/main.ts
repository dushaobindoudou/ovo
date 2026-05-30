import { app, BrowserWindow, Tray, Menu, screen, systemPreferences, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import { Logger } from "./logger.js";
// C8: verify-real-logs 改成 dynamic import — 不再静态进入主 bundle
// 生产 build 走 isPackaged 守卫，env 即使被设也无效
import { errorLogger } from "./error-logger.js";
import { scheduler } from "./scheduler.js";
import { preferencesStore } from "./preferences-store.js";
import { setActiveRedactionLevel } from "./sensitive-filter.js";
import { systemEvents } from "./system-events.js";
import { startUpdateChecker } from "./update-check.js";
import { inferActivityState } from "./session-tracker.js";
import { renderAppIcon, renderTrayIcon } from "./icon-renderer.js";
import { mt, setMainLanguage } from "./i18n-main.js";
import type { AgentSuggestion, AgentAction } from "./types.js";
import type { AutoCaptureService } from "./auto-capture.js";
import { safeExecute } from "./safe-execute.js";

let consoleWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let logger: Logger | null = null;
let sharedKG: KnowledgeGraphEngine | null = null;
let suggestionToastManager: SuggestionToastManager | null = null;

const isDev = process.env.NODE_ENV === "development";

function resolvePreloadPath() {
  const candidates = [
    path.join(app.getAppPath(), "preload.cjs"),
    path.join(app.getAppPath(), "electron", "preload.cjs"),
    path.join(process.cwd(), "electron", "preload.cjs")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  // 兜底，保持与历史行为兼容
  return path.join(app.getAppPath(), "electron", "preload.cjs");
}

/** 用当前语言（i18n-main）重建托盘菜单 + tooltip。语言切换时也调它。 */
function refreshTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: mt("tray.openConsole"),
      click: () => {
        if (consoleWindow) {
          consoleWindow.show();
          consoleWindow.focus();
        }
      }
    },
    { type: "separator" },
    {
      label: mt("tray.quit"),
      click: () => app.quit()
    }
  ]);
  tray.setToolTip(mt("tray.tooltip"));
  tray.setContextMenu(contextMenu);
}

function createTray() {
  try {
    const trayIcon = renderTrayIcon();
    tray = new Tray(trayIcon);
    refreshTrayMenu();
    tray.on("click", () => {
      if (consoleWindow) {
        consoleWindow.show();
        consoleWindow.focus();
      }
    });

    logger?.info("electron:tray", "系统托盘创建完成");
  } catch (err) {
    logger?.error("electron:tray", "托盘创建失败", { error: err instanceof Error ? err.message : String(err) });
  }
}

function resolveRendererEntry(urlHash: string) {
  if (isDev) return `http://localhost:5173/${urlHash}`;
  const candidates = [
    path.join(app.getAppPath(), "dist", "index.html"),
    path.join(app.getAppPath(), "..", "dist", "index.html"),
    path.join(app.getAppPath(), "..", "..", "dist", "index.html"),
    path.join(process.cwd(), "dist", "index.html")
  ];
  const hit = candidates.find((file) => fs.existsSync(file));
  const html = hit ?? candidates[0];
  return `file://${html}${urlHash}`;
}

interface CreateWindowExtra {
  /** R2: 显示窗口时不抢焦点（toast 等悬浮提示用）；走 showInactive() */
  inactive?: boolean;
}

function createWindow(
  urlHash: string,
  options: Electron.BrowserWindowConstructorOptions,
  extra: CreateWindowExtra = {}
) {
  // 同一版本应用共享 partition，但每次 patch 版本递增可隔离脏 session 缓存。
  const partition = `persist:ovo-${app.getVersion()}`;
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // SEC-6: 启用 sandbox——纵深防御。preload 只用 contextBridge + ipcRenderer，
      // sandbox 下仍可用。即便 renderer 被 XSS，sandbox 限制 syscall 面，攻击难度大幅提升。
      sandbox: true,
      // SEC-7: 默认安全标志
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition
    },
    ...options
  });

  // SEC-7: 拒绝 renderer 自己 window.open / target=_blank 打开新窗口（XSS 武器化路径）
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // 限制导航：只允许 dev:5173 / file: 自身页面，其他导航请求拒绝
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const u = new URL(url);
      const allowedHosts = new Set(["localhost"]);
      const isOwnFile = u.protocol === "file:";
      const isDevHost = u.protocol === "http:" && allowedHosts.has(u.hostname) && u.port === "5173";
      if (!isOwnFile && !isDevHost) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  const entry = resolveRendererEntry(urlHash);

  void win.loadURL(entry);
  win.once("ready-to-show", () => {
    if (extra.inactive) {
      // showInactive 显示但不激活窗口；用户当前正在交互的应用不丢焦点
      win.showInactive();
    } else {
      win.show();
    }
  });
  const windowName = urlHash.replace("#", "") || "main";
  logger?.info("electron:window", "窗口创建完成", {
    windowName,
    title: options.title ?? ""
  });
  return win;
}

// 更克制的 toast：单张 340×140，最多同时 1 张（新的覆盖旧的），避免遮挡用户内容
const TOAST_WIDTH = 340;
const TOAST_HEIGHT = 140;
const TOAST_GAP = 10;
const TOAST_MARGIN = 20;
const TOAST_MAX_ACTIVE = 1;
const TOAST_AUTO_CLOSE_MS = 18_000;
// R5-1: 动作 toast 专用 —— 最多纵向叠 4 行（避免互相重叠 + 不溢出屏幕）；同一动作 2 分钟内不重复弹
const MAX_ACTION_TOAST_ROWS = 4;
const ACTION_DEDUP_TTL = 2 * 60_000;
const TOAST_STAGGER_MS = 400;
// F1: dedup 30min（之前 1h 太长，用户反复看不到同主题）
const RECENT_TITLE_TTL_NEW = 30 * 60_000;
// F1: active_typing 最多延后 2 次，第 3 次强弹（避免一直敲键盘永远看不到）
const MAX_DEFER_ATTEMPTS = 2;

interface ActiveToast {
  id: string;
  slot: number;
  window: BrowserWindow;
  timer: NodeJS.Timeout;
}

function encodeToastPayload(suggestion: AgentSuggestion) {
  return Buffer.from(JSON.stringify(suggestion), "utf8").toString("base64url");
}

type ToastVerbosity = "silent" | "alerts" | "all";
const TOAST_PRIORITY_THRESHOLD = 80;

// R2: 智能 tier 判定 + 不打扰策略
type ToastTier = "critical" | "important" | "soft";

const COOLDOWN_BY_TIER: Record<ToastTier, number> = {
  critical: 0,        // 不限速
  important: 20_000,  // 20s 内不重复
  soft: 60_000        // 60s 内不重复
};
const RECENT_TITLE_TTL = RECENT_TITLE_TTL_NEW; // F1: 用 30min 替代旧的 1h

function classifyTier(s: AgentSuggestion): ToastTier {
  // critical：标题里含风险词，或 priority>=95
  const t = (s.title ?? "").toLowerCase();
  if (
    s.priority >= 95 ||
    /(critical|风险|警告|⚠️|chỉ|誤|危险|高危|预警|拦截|合同|payment|password)/.test(s.title ?? "") ||
    /(critical|alert|warn)/.test(t) ||
    s.type === "risk"
  ) return "critical";
  if (s.priority >= 70 || s.type === "offer" || s.type === "alert") return "important";
  return "soft";
}

// action type → 人话动词，用于动作 toast 标题（"Ovo 想 发送邮件"）
const ACTION_VERB: Record<string, string> = {
  send_email: "发送邮件",
  send_imessage: "发送 iMessage",
  open_url: "打开网页",
  open_app: "打开应用",
  search_web: "网页搜索",
  set_reminder: "创建提醒",
  add_calendar: "添加到日历",
  copy_to_clipboard: "复制到剪贴板",
  index_path: "索引文件",
  create_todo: "创建待办",
  log_note: "记一条笔记"
};

function encodeActionToastPayload(action: AgentAction, pipelineId: string) {
  const verb = ACTION_VERB[action.type ?? "other"] ?? "执行一个动作";
  const payload = {
    kind: "action" as const,
    id: action.id,
    actionId: action.id,
    pipelineId,
    type: action.type ?? "other",
    title: `Ovo 想${verb}`,
    content: action.description || verb,
    priority: 95
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

class SuggestionToastManager {
  private readonly queue: AgentSuggestion[] = [];
  private readonly active: ActiveToast[] = [];
  // P1: 默认 "all" 让用户看见 ovo 在工作；想静默用 toast.setVerbosity("silent")
  private verbosity: ToastVerbosity = "all";
  // R2: 智能限流相关
  private lastToastByTier: Record<ToastTier, number> = { critical: 0, important: 0, soft: 0 };
  private recentTitles = new Map<string, number>(); // titleHash → lastShownAt
  private recentActionKeys = new Map<string, number>(); // R5-1: 动作 toast 去重 (type:desc) → lastShownAt
  private rejectedTypes = new Map<string, number>(); // type → 最近拒绝时间
  private dndUntil = 0;          // do-not-disturb（用户主动设的勿扰直到时间戳）
  // F1: defer 次数计数；同一 toast 最多延后 N 次后强弹
  private deferAttempts = new Map<string, number>();

  setVerbosity(v: ToastVerbosity) {
    this.verbosity = v;
  }

  setDoNotDisturb(minutes: number) {
    this.dndUntil = Date.now() + minutes * 60_000;
  }

  /** 用户拒绝某 type 的反馈进来时调，让 toast manager 短期屏蔽这类内容 */
  noteRejection(type: string) {
    if (!type) return;
    this.rejectedTypes.set(type, Date.now());
  }

  enqueueMany(suggestions: AgentSuggestion[]) {
    if (!suggestions.length) return;
    if (this.verbosity === "silent") return;
    if (Date.now() < this.dndUntil) return; // 勿扰中
    const filtered = this.verbosity === "all"
      ? suggestions
      : suggestions.filter((s) => (s.priority ?? 0) >= TOAST_PRIORITY_THRESHOLD || /risk|warning|⚠️|预警/i.test(s.title));
    if (!filtered.length) return;
    this.queue.push(...filtered);
    this.flush();
  }

  enqueueReceipts(receipts: AgentSuggestion[]) {
    if (!receipts.length) return;
    if (this.verbosity === "silent") return;
    if (Date.now() < this.dndUntil) return;
    this.queue.push(...receipts);
    this.flush();
  }

  /**
   * 可执行动作 toast：待确认的 action 直接弹浮窗，带"执行 / 忽略"按钮。
   * 不走 suggestion 队列的 dedup/cooldown（这是需要用户决策的事，必须可见），
   * 但尊重 silent / 勿扰。每条 action 一张 toast，超时更长（需要决策时间）。
   */
  enqueueActions(actions: AgentAction[], pipelineId: string) {
    if (!actions.length) return;
    if (this.verbosity === "silent") return;
    if (Date.now() < this.dndUntil) return;
    const now = Date.now();
    // R5-1 去重：清理过老的 key，避免无界增长
    if (this.recentActionKeys.size > 100) {
      for (const [k, t] of this.recentActionKeys) {
        if (now - t > ACTION_DEDUP_TTL) this.recentActionKeys.delete(k);
      }
    }
    let opened = 0;
    for (const action of actions) {
      if (opened >= 3) break; // 单次最多 3 张，避免一次 pipeline 铺满屏幕
      // R5-1 去重：同一动作（类型+描述）近 ACTION_DEDUP_TTL 内已弹过 → 跳过，
      // 否则 pipeline 每周期重生成同一 pending 会刷屏。
      const key = `${action.type ?? "other"}:${(action.description ?? "").trim().slice(0, 60)}`;
      const last = this.recentActionKeys.get(key);
      if (last && now - last < ACTION_DEDUP_TTL) continue;
      // 该动作已有一张 toast 在显示 → 不重复弹
      if (this.active.some((t) => t.id === action.id)) continue;
      this.recentActionKeys.set(key, now);
      this.openActionToast(action, pipelineId);
      opened++;
    }
  }

  destroyAll() {
    for (const item of [...this.active]) {
      clearTimeout(item.timer);
      if (!item.window.isDestroyed()) {
        item.window.close();
      }
    }
    this.active.length = 0;
    this.queue.length = 0;
  }

  private flushTimer: NodeJS.Timeout | null = null;

  /**
   * R2: 智能 flush。每次只考虑队列首元素：
   *   - 检查 tier 与活动状态：active_typing 时除 critical 外延后
   *   - cooldown：同 tier 间隔 ≥ N s
   *   - 同标题 1h 内已弹过 → 跳过
   *   - 用户拒绝过相似 type → 跳过
   * 弹一张后，等 TOAST_STAGGER_MS 再弹下一张（避免一拥而上）
   */
  private flush() {
    if (this.flushTimer) return; // 已经在排
    this.flushOne();
  }

  private flushOne() {
    this.flushTimer = null;
    if (this.active.length >= TOAST_MAX_ACTIVE) return;
    if (this.queue.length === 0) return;

    const suggestion = this.queue[0];
    const tier = classifyTier(suggestion);
    const now = Date.now();
    // R2 强化 dedup：归一化 title + content 前 60 字 + type，去标点空白
    // 这样 "每天 BTC 简报" 和 "BTC 每日推送" 即使 title 不一样，content 接近也会被合并
    const norm = (s: string) =>
      (s ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s\p{P}]/gu, "")
        .slice(0, 80);
    // 特殊 dedup：「有 X 个动作等你确认」无论内容怎么变，1 分钟内只弹一次。
    // 否则连续多个 pipeline 各自带 pendingActions 会重复弹同一类提示。
    const isPendingActionAlert = /等你确认/.test(suggestion.title ?? "");
    const titleKey = isPendingActionAlert
      ? "pending-action-alert"
      : `${suggestion.type ?? ""}:${norm(suggestion.title ?? "")}:${norm((suggestion.content ?? "").slice(0, 60))}`;
    const dedupTtl = isPendingActionAlert ? 60_000 : RECENT_TITLE_TTL;

    // 1) 同标题/同类提示在 TTL 内已弹过 → 丢弃
    const lastSameTitle = this.recentTitles.get(titleKey);
    if (lastSameTitle && now - lastSameTitle < dedupTtl) {
      this.queue.shift();
      this.scheduleFlush(50);
      return;
    }

    // 2) F1: 用户最近拒绝过这类 type → 仅 5 分钟内屏蔽（之前 30min 太长）
    const lastRejected = this.rejectedTypes.get(suggestion.type ?? "");
    if (lastRejected && now - lastRejected < 5 * 60_000 && tier !== "critical") {
      this.queue.shift();
      this.scheduleFlush(50);
      return;
    }

    // 3) F1: active_typing 最多延后 MAX_DEFER_ATTEMPTS 次，避免用户一直敲永远看不到
    let activityOk = true;
    try {
      const act = inferActivityState();
      if (tier !== "critical" && act.state === "active_typing") activityOk = false;
      if (tier === "soft" && act.state === "reading") activityOk = false;
    } catch { /* if inference fails, allow */ }

    if (!activityOk) {
      const deferKey = `${tier}:${titleKey}`;
      const attempts = this.deferAttempts.get(deferKey) ?? 0;
      if (attempts < MAX_DEFER_ATTEMPTS) {
        this.deferAttempts.set(deferKey, attempts + 1);
        const item = this.queue.shift()!;
        this.queue.push(item);
        this.scheduleFlush(45_000); // 45s 重试
        return;
      }
      // 已经延后够多次了，强弹
      this.deferAttempts.delete(deferKey);
    }

    // 4) cooldown：同 tier 上次弹时间太近 → 等
    const cooldown = COOLDOWN_BY_TIER[tier];
    const elapsed = now - this.lastToastByTier[tier];
    if (cooldown > 0 && elapsed < cooldown) {
      this.scheduleFlush(cooldown - elapsed);
      return;
    }

    // 通过所有门 → 弹
    this.queue.shift();
    this.lastToastByTier[tier] = now;
    this.recentTitles.set(titleKey, now);
    // A: toast 历史留底——写 system_logs，用户可在主控台「通知历史」查到
    safeExecute(
      () => {
        logger?.info("toast.shown", suggestion.title ?? suggestion.type ?? "提醒", {
          suggestionId: suggestion.id,
          type: suggestion.type,
          priority: suggestion.priority,
          tier,
          content: (suggestion.content ?? "").slice(0, 500),
          detail: suggestion.detail
        });
      },
      "toast.history-log",
      undefined,
      "info"
    );
    // 清理过老的 recentTitles 防内存膨胀
    if (this.recentTitles.size > 200) {
      for (const [k, t] of this.recentTitles) {
        if (now - t > RECENT_TITLE_TTL) this.recentTitles.delete(k);
      }
    }
    this.openToast(suggestion);

    // 错峰：等 STAGGER_MS 再处理下一条
    if (this.queue.length > 0 && this.active.length < TOAST_MAX_ACTIVE) {
      this.scheduleFlush(TOAST_STAGGER_MS);
    }
  }

  private scheduleFlush(delayMs: number) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushOne(), delayMs);
  }

  private openToast(suggestion: AgentSuggestion) {
    const slot = this.getNextFreeSlot();
    const position = this.computeToastPosition(slot);
    const payload = encodeToastPayload(suggestion);
    const hash = `#toast?payload=${encodeURIComponent(payload)}`;
    // R2: focusable=false + showInactive → toast 弹出时绝对不抢焦点；
    // R3: backgroundColor=00000000 让背景真的透明（renderer 端再强制 body 透明）
    const win = createWindow(hash, {
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      minWidth: TOAST_WIDTH,
      minHeight: TOAST_HEIGHT,
      maxWidth: TOAST_WIDTH,
      maxHeight: TOAST_HEIGHT,
      x: position.x,
      y: position.y,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      focusable: false,
      backgroundColor: "#00000000",
      title: "ovo 建议浮窗",
      // macOS NSPanel：点击 toast 区域不会激活 ovo app，也不会把已 hide 的
      // console 弹回前台——彻底解决"点 toast 打开主窗口"问题
      ...(process.platform === "darwin" ? { type: "panel" as const } : {})
    }, { inactive: true });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    const timer = setTimeout(() => {
      if (!win.isDestroyed()) win.close();
    }, TOAST_AUTO_CLOSE_MS);

    const activeToast: ActiveToast = { id: suggestion.id, slot, window: win, timer };
    this.active.push(activeToast);

    win.on("closed", () => {
      clearTimeout(timer);
      const idx = this.active.findIndex((item) => item.window === win);
      if (idx >= 0) this.active.splice(idx, 1);
      this.flush();
    });
  }

  /**
   * 打开一张「可执行动作」toast（执行 / 忽略）。
   * 与 openToast 的区别：① 携带 action payload；② 超时更长（90s，给用户决策时间）；
   * ③ 不写 toast.shown 历史（动作的执行/取消会另有 business_log）。
   */
  private openActionToast(action: AgentAction, pipelineId: string) {
    const slot = this.getNextActionSlot();
    const position = this.computeToastPosition(slot);
    const payload = encodeActionToastPayload(action, pipelineId);
    const hash = `#toast?payload=${encodeURIComponent(payload)}`;
    const win = createWindow(hash, {
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      minWidth: TOAST_WIDTH,
      minHeight: TOAST_HEIGHT,
      maxWidth: TOAST_WIDTH,
      maxHeight: TOAST_HEIGHT,
      x: position.x,
      y: position.y,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      focusable: false,
      backgroundColor: "#00000000",
      title: "ovo 待执行动作",
      ...(process.platform === "darwin" ? { type: "panel" as const } : {})
    }, { inactive: true });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 动作 toast 超时更长：90s 内没决策才自动收起（action 仍在 registry，可去面板处理）
    const timer = setTimeout(() => {
      if (!win.isDestroyed()) win.close();
    }, 90_000);

    const activeToast: ActiveToast = { id: action.id, slot, window: win, timer };
    this.active.push(activeToast);

    win.on("closed", () => {
      clearTimeout(timer);
      const idx = this.active.findIndex((item) => item.window === win);
      if (idx >= 0) this.active.splice(idx, 1);
      this.flush();
    });
  }

  // 屏幕左侧单列纵向堆叠：slot 0 在最上，slot N 在下方，互不覆盖。
  // 用户原话：「卡片之间别画像覆盖」「同时最多 5 个出现」「从左侧看不见然后滑出来」。
  // 滑入动画在渲染端 CSS 完成（card 从 translateX(-100%) → 0）。
  private computeToastPosition(slot: number) {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const x = area.x + TOAST_MARGIN;
    const y = area.y + TOAST_MARGIN + slot * (TOAST_HEIGHT + TOAST_GAP);
    return { x, y };
  }

  private getNextFreeSlot() {
    const used = new Set(this.active.map((item) => item.slot));
    for (let i = 0; i < TOAST_MAX_ACTIVE; i++) {
      if (!used.has(i)) return i;
    }
    return TOAST_MAX_ACTIVE - 1;
  }

  // R5-1: 动作 toast 的 slot 在更大范围里找空位，使多张纵向堆叠而不是全叠在 slot 0。
  private getNextActionSlot() {
    const used = new Set(this.active.map((item) => item.slot));
    for (let i = 0; i < MAX_ACTION_TOAST_ROWS; i++) {
      if (!used.has(i)) return i;
    }
    return MAX_ACTION_TOAST_ROWS - 1;
  }
}

function createConsoleWindow() {
  // 启动时显示但不抢焦点——用户能看到 ovo 控制台已就绪，但当前应用焦点不会被打断
  consoleWindow = createWindow("#console", {
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "ovo 控制台界面",
    frame: true,
    backgroundColor: "#0a0a14"
  }, { inactive: true });
  // R4: 用户点关闭按钮时不要 destroy 窗口，否则后面悬浮球点击 toggle 找不到。
  // 改成 hide → 下次 toggle 时直接 show()。Cmd-Q 退出 app 走的是 before-quit 路径，不受此影响
  consoleWindow.on("close", (event) => {
    const isQuitting = (app as unknown as { isQuitting?: boolean }).isQuitting === true;
    if (!isQuitting && consoleWindow && !consoleWindow.isDestroyed()) {
      event.preventDefault();
      consoleWindow.hide();
    }
  });
}

function createFloatingWindow() {
  // 默认 96×96：仅球本体，无幽灵空间。sticky 展开时通过 IPC 临时撑到 300×288。
  // 这样平时占位极小，不影响用户看屏幕；只在用户主动点开时才扩展窗口。
  const FLOAT_W = 96;
  const FLOAT_H = 96;
  // 读 saved 位置 + 边界保护
  const saved = preferencesStore.get().floatingPosition;
  const primary = screen.getPrimaryDisplay().workArea;
  let x = primary.x + primary.width - FLOAT_W - 16;
  let y = primary.y + 80;
  if (saved) {
    // 用最大可能尺寸 300×288（sticky 展开）做边界判断，避免展开时溢出屏幕
    const FLOAT_MAX_W = 300;
    const FLOAT_MAX_H = 288;
    const allDisplays = screen.getAllDisplays();
    const onScreen = allDisplays.some((d) =>
      saved.x >= d.workArea.x &&
      saved.x + FLOAT_MAX_W <= d.workArea.x + d.workArea.width &&
      saved.y >= d.workArea.y &&
      saved.y + FLOAT_MAX_H <= d.workArea.y + d.workArea.height
    );
    if (onScreen) {
      x = saved.x;
      y = saved.y;
    }
  }
  // 注意：悬浮球**不要**走 inactive。toast 是 30s 即关的瞬时通知不抢焦点没事；
  // 但悬浮球是常驻交互元素，要支持拖动 + 点击 toggle。
  // 拖动现在走 JS pointer events + IPC setPosition，不再依赖 webkit-app-region。
  // resizable:true 是为了支持 sticky 展开时 setSize 动态调整高度
  floatingWindow = createWindow("#float", {
    width: FLOAT_W,
    height: FLOAT_H,
    x,
    y,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    title: ""
  });

  // 监听位置变化，节流写回 preferences.json
  let saveTimer: NodeJS.Timeout | null = null;
  floatingWindow.on("move", () => {
    if (!floatingWindow || floatingWindow.isDestroyed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!floatingWindow || floatingWindow.isDestroyed()) return;
      const [nx, ny] = floatingWindow.getPosition();
      safeExecute(
        () => preferencesStore.setFloatingPosition({ x: nx, y: ny }),
        "floating.save-position",
        undefined,
        "info"
      );
    }, 500);
  });
}

function createAllWindows() {
  createConsoleWindow();
  createFloatingWindow();
}

// 进程级未捕获异常兜底：无论 logger 是否就绪都先落到 errorLogger。
// errorLogger.alert 自身可能炸（比如 BrowserWindow.getAllWindows 越界）——
// 此时再走 safeExecute 会回环到 errorLogger 自己，所以直接写 stderr。
process.on("uncaughtException", (error) => {
  try {
    errorLogger.alert("critical", "uncaughtException", error.message ?? String(error), {
      stack: error.stack
    });
  } catch (alertErr) {
    try {
      const reason = alertErr instanceof Error ? alertErr.message : String(alertErr);
      process.stderr.write(`[main.uncaught-alert-failed] ${reason} :: original=${error.message}\n`);
    } catch { /* */ }
  }
});
process.on("unhandledRejection", (reason) => {
  try {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorLogger.alert("error", "unhandledRejection", message, {
      stack: reason instanceof Error ? reason.stack : undefined
    });
  } catch (alertErr) {
    try {
      const aReason = alertErr instanceof Error ? alertErr.message : String(alertErr);
      process.stderr.write(`[main.unhandled-alert-failed] ${aReason}\n`);
    } catch { /* */ }
  }
});

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    try {
      errorLogger.alert("critical", "boot", `应用启动失败: ${msg}`, { stack });
    } catch (alertErr) {
      // 启动失败 + errorLogger 也炸了——stderr 是最后的求救信号
      try {
        const aReason = alertErr instanceof Error ? alertErr.message : String(alertErr);
        process.stderr.write(`[main.boot-alert-failed] ${aReason} :: original=${msg}\n`);
      } catch { /* */ }
    }
    // 仍然尝试通过 console.error 让 stderr 抓到
    console.error("[ovo:boot] 启动失败", error);
  }
});

async function bootstrap() {
  sharedKG = new KnowledgeGraphEngine();
  logger = new Logger({ kg: sharedKG });
  sharedKG.recordMetric("app_launch"); // 北极星 TTFV 起点
  errorLogger.init();
  preferencesStore.load();
  // P0.11: 把脱敏强度同步到 sensitive-filter 模块级状态
  setActiveRedactionLevel(preferencesStore.getRedactionLevel());
  // T13 / C5 / M8 / M9 / A5: 初始化系统事件 hub
  systemEvents.init();
  // C7: 自动更新检查（仅生产构建）— 启动 30s 后异步查 GitHub Releases 比对版本
  startUpdateChecker();
  errorLogger.alert("info", "boot", "ovo 主进程启动", {
    version: app.getVersion(),
    pid: process.pid,
    isDev
  });
  logger.info("electron:main", "应用启动", { isDev });

  // 检查上次运行的错误日志（用归档的上一会话计数，不再把历史旧错反复重数）
  const errorCount = errorLogger.getPreviousSessionErrorCount();
  if (errorCount > 0) {
    logger.warning("electron:main", "检测到上次运行的错误日志", { errorCount });
  }

  // 兼容旧的 systemLogger 接口
  const systemLogger = {
    info: (source: string, message: string, context?: Record<string, unknown>) => logger?.info(source, message, context),
    warn: (source: string, message: string, context?: Record<string, unknown>) => logger?.warning(source, message, context),
    error: (source: string, message: string, context?: Record<string, unknown>) => logger?.error(source, message, context)
  };

  // CODE-7: 删除原 bootstrap() 内重复的 uncaughtException / unhandledRejection 注册
  //   - error-logger.ts:70 已注册一对（init() 时）
  //   - main.ts:547 / 559 已注册一对（module-level）
  //   - 这里再注册第三对会让同一错误触发 3 次告警 + 触发 MaxListenersExceededWarning
  //   现在仅依赖前两处，bootstrap 内只做模块初始化，不再注册全局 handler

  // 先注册 IPC，避免窗口初始渲染阶段 invoke 发生竞态
  suggestionToastManager = new SuggestionToastManager();
  const { autoCaptureService } = registerIpcHandlers({
    getConsoleWindow: () => consoleWindow,
    getFloatingWindow: () => floatingWindow,
    getSuggestionWindow: () => null,
    sharedKG,
    logger,
    systemLogger,
    onSuggestions: (suggestions) => suggestionToastManager?.enqueueMany(suggestions),
    onReceipts: (receipts) => suggestionToastManager?.enqueueReceipts(receipts),
    toastManager: {
      setVerbosity: (v) => suggestionToastManager?.setVerbosity(v),
      noteRejection: (type) => suggestionToastManager?.noteRejection(type),
      setDoNotDisturb: (minutes) => suggestionToastManager?.setDoNotDisturb(minutes),
      enqueueReceipts: (receipts) => suggestionToastManager?.enqueueReceipts(receipts),
      enqueueActions: (actions, pipelineId) => suggestionToastManager?.enqueueActions(actions, pipelineId)
    }
  });

  // C8 / M14: verify-real-logs 仅 dev 模式（!isPackaged）+ env=1 双重守卫
  // 生产 build 即便用户设了 OVO_RUN_REAL30=1 也不会触发测试逻辑污染真实数据
  if (!app.isPackaged && process.env.OVO_RUN_REAL30 === "1") {
    void import("./verify-real-logs.js")
      .then(({ runVerifyRealLogs }) => runVerifyRealLogs())
      .then(() => {
        logger?.info("verify-real-logs", "真实场景验证完成");
        app.quit();
      })
      .catch((error) => {
        logger?.error("verify-real-logs", "真实场景验证失败", {
          error: error instanceof Error ? error.message : "unknown"
        });
        console.error(error);
        app.exit(1);
      });
    return;
  }

  // i18n P3：主进程语言初始化（托盘菜单 + 回执 toast 据此翻译）
  setMainLanguage(preferencesStore.getUiLanguage());
  // renderer 切换语言时同步过来：更新偏好 + 主进程语言 + 重建托盘菜单
  ipcMain.handle("prefs:set-ui-language", (_e, lang: "zh" | "en" | "system") => {
    preferencesStore.setUiLanguage(lang);
    setMainLanguage(lang);
    refreshTrayMenu();
    return { ok: true };
  });

  setupDockIcon();
  createAllWindows();
  createTray();

  startAutoCaptureWhenAllowed(autoCaptureService);
}

/**
 * macOS dock 图标：用 icon-renderer 程序化绘制 OVO 视觉。
 * 优先用打包好的 build/icon.png（高质量、零启动开销），fallback 到运行时绘制。
 */
function setupDockIcon() {
  if (process.platform !== "darwin" || !app.dock) return;
  try {
    const candidates = [
      path.join(app.getAppPath(), "build", "icon.png"),
      path.join(app.getAppPath(), "..", "build", "icon.png"),
      path.join(process.cwd(), "build", "icon.png")
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      app.dock.setIcon(found);
      logger?.info("electron:dock", "使用打包图标", { path: found });
      return;
    }
    // fallback：运行时绘制 512 (200ms 启动开销)
    const img = renderAppIcon(512);
    app.dock.setIcon(img);
    logger?.info("electron:dock", "运行时绘制 dock 图标");
  } catch (err) {
    logger?.error("electron:dock", "dock 图标设置失败", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

function isScreenRecordingGranted(): boolean {
  if (process.platform !== "darwin") return true;
  return systemPreferences.getMediaAccessStatus("screen") === "granted";
}

function broadcastPermissionsStatus() {
  const payload = {
    screen: process.platform === "darwin"
      ? systemPreferences.getMediaAccessStatus("screen")
      : "not-available",
    timestamp: Date.now()
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    safeExecute(
      () => win.webContents.send("permissions:status", payload),
      "main.broadcast-permissions",
      undefined,
      "info"
    );
  }
}

/**
 * 仅当屏幕录制已授权时启动自动捕获；否则每 3 秒轮询一次，
 * 授权后立即启动，并通过 permissions:status 事件通知渲染进程。
 */
function startAutoCaptureWhenAllowed(autoCaptureService: AutoCaptureService) {
  // T13: 接入系统事件 — 休眠/锁屏自动停，恢复/解锁后回来
  let pausedBySystem = false;
  const pauseForSystem = (reason: string) => {
    if (!autoCaptureService.isStarted()) return;
    pausedBySystem = true;
    autoCaptureService.stop();
    logger?.info("electron:main", `因系统事件暂停截屏采集: ${reason}`);
  };
  const resumeIfSystemPaused = (reason: string) => {
    if (!pausedBySystem) return;
    pausedBySystem = false;
    if (isScreenRecordingGranted()) {
      autoCaptureService.start();
      logger?.info("electron:main", `因系统事件恢复截屏采集: ${reason}`);
    }
  };
  systemEvents.on("power:suspend", () => pauseForSystem("系统休眠"));
  systemEvents.on("power:resume", () => resumeIfSystemPaused("系统恢复"));
  systemEvents.on("power:lock-screen", () => pauseForSystem("屏幕锁定（隐私保护）"));
  systemEvents.on("power:unlock-screen", () => resumeIfSystemPaused("屏幕解锁"));

  if (isScreenRecordingGranted()) {
    logger?.info("electron:main", "屏幕录制权限已授权，启动截屏采集");
    autoCaptureService.start();
    broadcastPermissionsStatus();
    return;
  }
  logger?.warning("electron:main", "屏幕录制权限未授权，延迟启动自动捕获", {
    status: process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "n/a"
  });
  broadcastPermissionsStatus();
  scheduler.register({
    id: "permissions-watch",
    intervalMs: 3_000,
    task: () => {
      if (!isScreenRecordingGranted()) return;
      logger?.info("electron:main", "检测到屏幕录制授权，启动自动捕获");
      autoCaptureService.start();
      broadcastPermissionsStatus();
      scheduler.unregister("permissions-watch");
    }
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createAllWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // R4: 标记真退出，让 console close handler 不再 preventDefault
  (app as unknown as { isQuitting: boolean }).isQuitting = true;
  if (logger) {
    logger.info("electron:main", "应用退出", { isDev });
  }
  suggestionToastManager?.destroyAll();
  suggestionToastManager = null;
  sharedKG?.close();
});
