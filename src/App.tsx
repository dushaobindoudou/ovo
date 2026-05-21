import { useEffect, useState } from "react";
import { FloatingIcon } from "./components/FloatingIcon/FloatingIcon";
import { SuggestionPanel } from "./components/SuggestionPanel/SuggestionPanel";
import { SuggestionToastWindow } from "./components/SuggestionPanel/SuggestionToastWindow";
import { ConsoleLayout } from "./components/Console/ConsoleLayout";
import { useSettingsStore, getResolvedTheme } from "./stores/settingsStore";
import { useNetworkWatcher } from "./hooks/useNetworkWatcher";
import { applyLanguage } from "./i18n";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

function reportRendererError(message: string, context: Record<string, unknown>) {
  if (!isElectron) return;
  try {
    void window.ovoAPI.logger.error("renderer", message, context);
  } catch {
    /* swallow */
  }
}

function App() {
  const [hash, setHash] = useState(() => window.location.hash || "#console");
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const [mounted, setMounted] = useState(false);
  // T13 / M8: 监听 navigator.onLine 并上报到主进程（每个 renderer 上报一次足够）
  useNetworkWatcher();

  useEffect(() => {
    if (!isElectron) return;
    const handleError = (event: ErrorEvent) => {
      reportRendererError(event.message ?? "renderer error", {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      reportRendererError(`unhandledrejection: ${reason.message}`, {
        stack: reason.stack
      });
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  // 监听 hash 路由变化，确保不同窗口页面可切换
  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || "#console");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // 应用主题
  useEffect(() => {
    const resolved = getResolvedTheme(theme);
    document.documentElement.dataset.theme = resolved;
    setMounted(true);
  }, [theme]);

  // i18n：同步语言到 i18next（含 system 解析）+ 同步到主进程（托盘菜单/回执 toast）
  useEffect(() => {
    applyLanguage(language);
    if (isElectron) {
      try { void window.ovoAPI.prefs.setUiLanguage?.(language); } catch { /* */ }
    }
  }, [language]);

  // 监听系统语言变化（仅 language=system 时）
  useEffect(() => {
    if (language !== "system") return;
    const handler = () => applyLanguage("system");
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }, [language]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.dataset.theme = getResolvedTheme("system");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  // 避免 hydration 不匹配
  if (!mounted) {
    return null;
  }

  if (hash.startsWith("#float")) return <FloatingIcon />;
  if (hash.startsWith("#toast")) return <SuggestionToastWindow />;
  if (hash.startsWith("#panel")) return <SuggestionPanel />;
  return <ConsoleLayout />;
}

export default App;
