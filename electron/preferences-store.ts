import path from "node:path";
import fs from "node:fs";
import { getUserDataPath } from "./electron-loader.js";

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
  pausedUntil: 0
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

  private persist() {
    try {
      fs.writeFileSync(this.resolvePath(), JSON.stringify(this.cache, null, 2), "utf8");
    } catch {
      /* ignore */
    }
  }
}

export const preferencesStore = new PreferencesStore();
