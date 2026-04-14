import { useMemo } from "react";
import { FloatingIcon } from "./components/FloatingIcon/FloatingIcon";
import { SuggestionPanel } from "./components/SuggestionPanel/SuggestionPanel";
import { ConsoleLayout } from "./components/Console/ConsoleLayout";

function App() {
  const hash = useMemo(() => window.location.hash || "#console", []);
  if (hash.startsWith("#float")) return <FloatingIcon />;
  if (hash.startsWith("#panel")) return <SuggestionPanel />;
  return <ConsoleLayout />;
}

export default App;
