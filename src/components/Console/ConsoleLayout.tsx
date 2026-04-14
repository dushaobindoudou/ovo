import { useMemo, useState } from "react";
import { ConsoleSidebar, type ConsolePage } from "./ConsoleSidebar";
import { StatusPanel } from "./StatusPanel";
import { WindowPanel } from "./WindowPanel";
import { MemoryPanel } from "./MemoryPanel";
import { PipelinePanel } from "./PipelinePanel";
import { SettingsPanel } from "./SettingsPanel";
import { AgentTestPanel } from "./AgentTestPanel";
import { AboutPanel } from "./AboutPanel";

export function ConsoleLayout() {
  const [page, setPage] = useState<ConsolePage>("status");
  const content = useMemo(() => {
    if (page === "status") return <StatusPanel />;
    if (page === "window") return <WindowPanel />;
    if (page === "memory") return <MemoryPanel />;
    if (page === "pipeline") return <PipelinePanel />;
    if (page === "settings") return <SettingsPanel />;
    if (page === "agent") return <AgentTestPanel />;
    return <AboutPanel />;
  }, [page]);

  return (
    <div className="flex h-full w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      <ConsoleSidebar page={page} onChange={setPage} />
      <main className="flex-1 overflow-auto bg-[var(--bg-content)] p-6">{content}</main>
    </div>
  );
}
