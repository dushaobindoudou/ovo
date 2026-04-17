import { useMemo, useEffect, useState } from "react";
import { FloatingIcon } from "./components/FloatingIcon/FloatingIcon";
import { SuggestionPanel } from "./components/SuggestionPanel/SuggestionPanel";
import { ConsoleLayout } from "./components/Console/ConsoleLayout";
import { useSettingsStore, getResolvedTheme } from "./stores/settingsStore";

function App() {
  const hash = useMemo(() => window.location.hash || "#console", []);
  const theme = useSettingsStore((s) => s.theme);
  const [mounted, setMounted] = useState(false);

  // 应用主题
  useEffect(() => {
    const resolved = getResolvedTheme(theme);
    document.documentElement.dataset.theme = resolved;
    setMounted(true);
  }, [theme]);

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
  if (hash.startsWith("#panel")) return <SuggestionPanel />;
  return <ConsoleLayout />;
}

export default App;
