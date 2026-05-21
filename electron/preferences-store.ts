import path from "node:path";
import fs from "node:fs";
import { getUserDataPath } from "./electron-loader.js";
import type { ActionType } from "./types.js";
import { safeExecute } from "./safe-execute.js";

/**
 * 信任分级（PRODUCT_PHILOSOPHY 第五章 / 机制 1）
 *
 *   Lv.0  仅展示    建议出现在面板，Ovo 不动手
 *   Lv.1  草拟      替我准备好草稿，等我点发（默认）
 *   Lv.2  一键确认  弹窗"要做吗？"+ 大按钮
 *   Lv.3  默认执行  执行 + 5 秒撤销（Gmail 风格）
 *   Lv.4  完全托管  立即执行，不打扰
 *
 * needsConfirm = action.requireConfirm || trustLevel < 3
 */
export type TrustLevel = 0 | 1 | 2 | 3 | 4;

/**
 * 每种 action type 的默认信任级别（参考哲学：默认克制）。
 * 无害本地操作 = 3（执行 + 撤销窗口）；外发/系统集成 = 2（必须确认）。
 */
// 用户产品反馈（2026-05-21）：默认几乎所有动作都"等确认"，Ovo 显得被动。
// 重新平衡为「可逆动作自动执行（Lv.3 + 5 秒撤销窗口），仅不可逆的发送类保留确认」。
// 注意：trust 闸门在 evidence-grounding 闸门之后——只有 grounded 的推断动作才会
// 走到这里被自动执行，speculative / unverified 仍然被拦截或落草稿台，仍有安全网。
export const DEFAULT_TRUST_LEVELS: Record<ActionType, TrustLevel> = {
  log_note: 3,
  create_todo: 3,
  // 可逆 / 屏幕内 / 不抢焦点 —— 自动执行。剪贴板被覆盖、提醒/日历误建都可撤销/还原，
  // 且不会突然抢走用户当前窗口，自动跑收益 > 打扰。
  copy_to_clipboard: 3,
  search: 3,
  summarize: 3,
  set_reminder: 3,
  add_calendar: 3,
  // R4-1 回退：open_url/open_app/search_web 会"抢屏"（突然打开浏览器/切换前台 app）。
  // 基于推断静默自动执行太突兀且无撤销。现在有了可执行 action toast，确认不再麻烦
  // ——它们弹一张带"执行"按钮的浮窗，用户一键就开。保留 Lv.2 确认。
  open_url: 2,
  open_app: 2,
  search_web: 2,
  // index_path：文件系统遍历，涉及隐私 + 可能耗时，保留确认（用户未列入自动清单）。
  index_path: 2,
  // 不可逆 / 发给他人 —— 必须确认。误发邮件 / iMessage 无法撤回。
  send_email: 2,
  send_imessage: 2,
  // 未分类动作默认保守，需确认。
  other: 2
};

export interface UserPreferences {
  /** 用户手动覆盖的人格维度评分，键为 trait name，值 0..1 */
  personalityOverrides: Record<string, number>;
  /** O3: 悬浮球上次的位置；null 表示用默认（右上贴边） */
  floatingPosition: { x: number; y: number } | null;
  /** P5: 首启 wizard 是否完成（用户填了基础画像就标 true） */
  bootstrapDone?: boolean;
  /** P5: wizard 收集到的兴趣主题，会作为 interest_profile entity 写入 KG */
  bootstrapInterests?: string[];
  /** P5: wizard 收集到的当前主项目（自由文本） */
  bootstrapCurrentProject?: string;
  /** P5: wizard 收集到的角色 */
  bootstrapRoles?: string[];
  /** T2: 应用黑名单——这些 app 永不被观察 */
  blacklistedApps?: string[];
  /** T3: 暂停截屏直到这个时间戳；0 表示未暂停 */
  pausedUntil?: number;
  /** 信任分级（P0.3 / P0.10）：每种 action 独立 5 级。未设值时回退 DEFAULT_TRUST_LEVELS */
  trustLevels?: Partial<Record<ActionType, TrustLevel>>;
  /** 数据保留期天数（P0.11）— 7/30/90/0=永久/-1=不保留 */
  retentionDays?: number;
  /** 脱敏强度（P0.11）— basic / strict / paranoid */
  redactionLevel?: "basic" | "strict" | "paranoid";
  /** TTS 是否启用（SEC-12 默认 false — 用户必须显式开启才会把 LLM 输出发给 Edge TTS） */
  ttsEnabled?: boolean;
  /** 界面语言（i18n P3）：zh / en / system。主进程托盘菜单 + 回执 toast 据此翻译 */
  uiLanguage?: "zh" | "en" | "system";
}

// T2: 默认黑名单——开箱即保护敏感场景
const DEFAULT_BLACKLISTED_APPS = [
  "1Password", "1Password 7", "Bitwarden", "KeePassXC", "LastPass", "Dashlane",
  "Keychain Access", "钥匙串访问",
  // 隐身浏览
  // (浏览器隐身模式无法直接识别 app，但用户至少可以加单条规则)
];

const DEFAULT_PREFS: UserPreferences = {
  personalityOverrides: {},
  floatingPosition: null,
  bootstrapDone: false,
  blacklistedApps: DEFAULT_BLACKLISTED_APPS,
  pausedUntil: 0,
  trustLevels: {},
  retentionDays: 30,
  redactionLevel: "basic"
};

/**
 * 简单的 JSON 持久化。被 main 进程多个模块共享，避免无限制广播。
 * 单例。
 */
class PreferencesStore {
  private cache: UserPreferences = { ...DEFAULT_PREFS };
  private filePath: string | null = null;

  private resolvePath(): string {
    if (this.filePath) return this.filePath;
    this.filePath = path.join(getUserDataPath(), "preferences.json");
    return this.filePath;
  }

  load() {
    try {
      const file = this.resolvePath();
      if (!fs.existsSync(file)) return this.cache;
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      this.cache = {
        ...DEFAULT_PREFS,
        ...parsed,
        personalityOverrides: { ...DEFAULT_PREFS.personalityOverrides, ...(parsed.personalityOverrides ?? {}) }
      };
    } catch {
      /* keep defaults on error */
    }
    return this.cache;
  }

  get(): UserPreferences {
    return this.cache;
  }

  setPersonalityOverrides(overrides: Record<string, number>) {
    this.cache = { ...this.cache, personalityOverrides: { ...overrides } };
    this.persist();
  }

  setFloatingPosition(pos: { x: number; y: number } | null) {
    this.cache = { ...this.cache, floatingPosition: pos };
    this.persist();
  }

  /** P5: 标记首启 wizard 完成 + 保存填写内容 */
  setBootstrap(payload: { interests: string[]; currentProject: string; roles: string[] }) {
    this.cache = {
      ...this.cache,
      bootstrapDone: true,
      bootstrapInterests: payload.interests,
      bootstrapCurrentProject: payload.currentProject,
      bootstrapRoles: payload.roles
    };
    this.persist();
  }

  /** T2: 设置应用黑名单 */
  setBlacklistedApps(apps: string[]) {
    this.cache = { ...this.cache, blacklistedApps: apps };
    this.persist();
  }

  /** T3: 暂停截屏直到时间戳；传 0 = 取消暂停 */
  setPausedUntil(ts: number) {
    this.cache = { ...this.cache, pausedUntil: Math.max(0, ts) };
    this.persist();
  }

  /** 信任分级（P0.3）：读单个 action 的级别；未配置返回默认 */
  getTrustLevel(type: ActionType): TrustLevel {
    return this.cache.trustLevels?.[type] ?? DEFAULT_TRUST_LEVELS[type] ?? 2;
  }

  /** 信任分级：读全表（默认 + 用户覆盖） */
  getAllTrustLevels(): Record<ActionType, TrustLevel> {
    const out = { ...DEFAULT_TRUST_LEVELS };
    const overrides = this.cache.trustLevels ?? {};
    for (const k of Object.keys(overrides) as ActionType[]) {
      const v = overrides[k];
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  /** 信任分级：设单个 action 的级别 */
  setTrustLevel(type: ActionType, level: TrustLevel) {
    const next = { ...(this.cache.trustLevels ?? {}), [type]: level };
    this.cache = { ...this.cache, trustLevels: next };
    this.persist();
  }

  /** 信任分级：批量重置为默认 */
  resetTrustLevels() {
    this.cache = { ...this.cache, trustLevels: {} };
    this.persist();
  }

  /** 数据保留期（P0.11） */
  setRetentionDays(days: number) {
    this.cache = { ...this.cache, retentionDays: days };
    this.persist();
  }
  getRetentionDays(): number {
    const v = this.cache.retentionDays;
    return typeof v === "number" ? v : 30;
  }

  /** 脱敏强度（P0.11） */
  setRedactionLevel(level: "basic" | "strict" | "paranoid") {
    this.cache = { ...this.cache, redactionLevel: level };
    this.persist();
  }
  getRedactionLevel(): "basic" | "strict" | "paranoid" {
    return this.cache.redactionLevel ?? "basic";
  }

  /** TTS enabled（SEC-12 默认 false） — 主进程持久化，主进程 init 就能正确初始 ttsEngine */
  setTtsEnabled(enabled: boolean) {
    this.cache = { ...this.cache, ttsEnabled: !!enabled };
    this.persist();
  }
  getTtsEnabled(): boolean {
    return !!this.cache.ttsEnabled;
  }
  getUiLanguage(): "zh" | "en" | "system" {
    return this.cache.uiLanguage ?? "system";
  }
  setUiLanguage(lang: "zh" | "en" | "system") {
    this.cache = { ...this.cache, uiLanguage: lang };
    this.persist();
  }

  private persist() {
    // 偏好持久化失败 → warn 级，因为用户下次启动会回到旧设置（数据丢失）
    safeExecute(
      () => fs.writeFileSync(this.resolvePath(), JSON.stringify(this.cache, null, 2), "utf8"),
      "preferences.persist",
      undefined,
      "warn"
    );
  }
}

export const preferencesStore = new PreferencesStore();
