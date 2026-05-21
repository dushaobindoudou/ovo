/**
 * ipc/privacy.ts —— privacy:* + prefs:* IPC handler
 *
 * 拆自原 ipc-handlers.ts（BUG_REPORT A1 / REVIEW CODE-11）。
 * 覆盖：
 *   prefs:get/set/reset-* （personality / bootstrap / trust / retention / redaction）
 *   privacy:get/set-blacklist / pause / resume / get-pause-state
 *   privacy:get/reset-redaction-stats
 */
import { preferencesStore } from "../preferences-store.js";
import { setActiveRedactionLevel, getRedactionStats, resetRedactionStats } from "../sensitive-filter.js";
import { safeExecute } from "../safe-execute.js";
import {
  PrefsSaveBootstrapSchema,
  PrefsSetPersonalityOverridesSchema,
  PrefsSetRedactionLevelSchema,
  PrefsSetRetentionDaysSchema,
  PrefsSetTrustLevelSchema,
  PrivacyPauseSchema,
  PrivacySetBlacklistSchema
} from "../ipc-schema.js";
import type { IpcHandlerDeps } from "./_shared.js";

export function registerPrivacyHandlers(deps: IpcHandlerDeps) {
  const { ipcMain, safeHandle, kg, logSystem } = deps;

  ipcMain.handle("prefs:get-personality-overrides", () => preferencesStore.get().personalityOverrides ?? {});
  // SEC-16: zod 校验——拒绝非数字 / 越界 / 超长键 / prototype 污染
  safeHandle("prefs:set-personality-overrides", PrefsSetPersonalityOverridesSchema, (overrides) => {
    preferencesStore.setPersonalityOverrides(overrides);
    return { ok: true };
  });

  // P5: Bootstrap wizard
  ipcMain.handle("prefs:get-bootstrap-status", () => ({
    done: preferencesStore.get().bootstrapDone ?? false,
    interests: preferencesStore.get().bootstrapInterests ?? [],
    currentProject: preferencesStore.get().bootstrapCurrentProject ?? "",
    roles: preferencesStore.get().bootstrapRoles ?? []
  }));
  // SEC-16: zod 校验——拒绝超长 interests / roles 数组；防 KG 投毒
  safeHandle("prefs:save-bootstrap", PrefsSaveBootstrapSchema, (payload) => {
    preferencesStore.setBootstrap(payload);
    // 把兴趣 + 角色写进 KG 作为高质量 interest_profile
    try {
      for (const role of payload.roles) {
        kg.recordRoleHypothesis(role, 0.75); // 用户主动声明的角色给较高初始置信
      }
      for (const interest of payload.interests) {
        const id = kg.upsertEntity({
          name: interest,
          type: "concept",
          description: `用户在 bootstrap wizard 主动声明的关注主题`,
          attributes: { fromBootstrap: true }
        });
        // 钉住 + 设高质量分
        safeExecute(() => kg.setPinned(id, true), "kg.bootstrap-pin", undefined, "warn");
      }
      if (payload.currentProject) {
        const id = kg.upsertEntity({
          name: payload.currentProject,
          type: "project",
          description: `用户在 bootstrap wizard 声明的当前主项目`,
          attributes: { fromBootstrap: true }
        });
        safeExecute(() => kg.setPinned(id, true), "kg.bootstrap-pin", undefined, "warn");
      }
      kg.recomputeAllQualityScores();
    } catch (e) {
      logSystem("warning", "bootstrap", "写入 KG 失败", { error: e instanceof Error ? e.message : String(e) });
    }
    return { ok: true };
  });

  // P0.3 / P0.10 / 哲学机制 1：信任分级
  ipcMain.handle("prefs:get-trust-levels", () => preferencesStore.getAllTrustLevels());
  // SEC-16: zod 校验——type 必须是合法 ActionType（不再 as never 兜底），level 必须 0..4
  safeHandle("prefs:set-trust-level", PrefsSetTrustLevelSchema, (payload) => {
    preferencesStore.setTrustLevel(payload.type, payload.level);
    return { ok: true };
  });
  ipcMain.handle("prefs:reset-trust-levels", () => {
    preferencesStore.resetTrustLevels();
    return { ok: true };
  });

  // P0.11: 隐私核心 — 数据保留期
  ipcMain.handle("prefs:get-retention-days", () => preferencesStore.getRetentionDays());
  // SEC-16: zod 枚举校验——只接受 -1/0/7/30/90
  safeHandle("prefs:set-retention-days", PrefsSetRetentionDaysSchema, (days) => {
    preferencesStore.setRetentionDays(days);
    return { ok: true };
  });

  // P0.11: 隐私核心 — 脱敏强度
  ipcMain.handle("prefs:get-redaction-level", () => preferencesStore.getRedactionLevel());
  // SEC-16: zod 枚举校验——只接受三档
  safeHandle("prefs:set-redaction-level", PrefsSetRedactionLevelSchema, (level) => {
    preferencesStore.setRedactionLevel(level);
    // 同步到 sensitive-filter 模块级状态，下一次 redactSensitive 即生效
    setActiveRedactionLevel(level);
    return { ok: true };
  });

  // DATA-12: 累计脱敏统计 — PrivacyView 显示 "Ovo 保护了你 N 次"
  ipcMain.handle("privacy:get-redaction-stats", () => getRedactionStats());
  ipcMain.handle("privacy:reset-redaction-stats", () => {
    resetRedactionStats();
    return { ok: true };
  });

  // T2: 应用黑名单
  ipcMain.handle("privacy:get-blacklist", () => preferencesStore.get().blacklistedApps ?? []);
  // SEC-16: zod 校验——数组上限 200、字符串上限 200、禁控制字符
  safeHandle("privacy:set-blacklist", PrivacySetBlacklistSchema, (apps) => {
    const cleaned = apps.map((a) => a.trim()).filter((a) => a.length > 0);
    preferencesStore.setBlacklistedApps(cleaned);
    return { ok: true };
  });

  // T3: 暂停 / 恢复
  // SEC-16: zod 校验——必须 1..1440 整数分钟
  safeHandle("privacy:pause", PrivacyPauseSchema, (minutes) => {
    const until = Date.now() + minutes * 60_000;
    preferencesStore.setPausedUntil(until);
    return { ok: true, pausedUntil: until };
  });
  ipcMain.handle("privacy:resume", () => {
    preferencesStore.setPausedUntil(0);
    return { ok: true };
  });
  ipcMain.handle("privacy:get-pause-state", () => ({
    pausedUntil: preferencesStore.get().pausedUntil ?? 0,
    isPaused: (preferencesStore.get().pausedUntil ?? 0) > Date.now()
  }));
}
