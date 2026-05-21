/**
 * i18n 基建（P0）—— react-i18next 初始化。
 *
 * 语言来源：settingsStore.language（"zh" | "en" | "system"）。
 *   - "system" → 读 navigator.language，zh* → 中文，其余 → 英文。
 * App.tsx 在 settings 变化时调 applyLanguage() 同步到 i18next。
 *
 * 资源按面板/域分 key（nav / navTip / settings / ...）。后续 P1-P3 逐步往 zh/en.json 补。
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

export type AppLanguage = "zh" | "en" | "system";

/** 把 "system" 解析成实际语言码（zh / en）。 */
export function resolveLanguage(lang: AppLanguage): "zh" | "en" {
  if (lang === "system") {
    const sys = (typeof navigator !== "undefined" ? navigator.language : "zh") || "zh";
    return sys.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return lang;
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en }
  },
  lng: "zh", // 启动占位；App.tsx 立即用 settings 的语言覆盖
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
  returnNull: false
});

/** 切换到指定（或 system 解析后的）语言。 */
export function applyLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(resolveLanguage(lang));
}

export default i18n;
