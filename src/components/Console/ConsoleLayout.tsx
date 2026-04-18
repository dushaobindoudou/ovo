import { useCallback, useMemo, useState } from "react";
import { ConsoleSidebar, type ConsolePage } from "./ConsoleSidebar";
import { ConsoleListPanel } from "./ConsoleListPanel";
import { StatusPanel } from "./StatusPanel";
import { WindowPanel } from "./WindowPanel";
import { MemoryPanel } from "./MemoryPanel";
import { PipelinePanel } from "./PipelinePanel";
import { SettingsPanel } from "./SettingsPanel";
import { AgentTestPanel } from "./AgentTestPanel";
import { ScreenshotTestPanel } from "./ScreenshotTestPanel";
import { AboutPanel } from "./AboutPanel";

const pageDefaultSelection: Record<ConsolePage, string | null> = {
  status: "health",
  window: null,
  memory: null,
  pipeline: null,
  settings: "appearance",
  agent: "coding",
  screenshot: null,
  about: "info",
};

export function ConsoleLayout() {
  const [page, setPage] = useState<ConsolePage>("status");
  const [selectedId, setSelectedId] = useState<string | null>("health");
  const [searchQuery, setSearchQuery] = useState("");

  const handlePageChange = useCallback((newPage: ConsolePage) => {
    setPage(newPage);
    setSelectedId(pageDefaultSelection[newPage]);
    setSearchQuery("");
  }, []);

  const content = useMemo(() => {
    const ctx = { page, selectedId, searchQuery };
    if (page === "status") return <StatusPanel ctx={ctx} />;
    if (page === "window") return <WindowPanel ctx={ctx} />;
    if (page === "memory") return <MemoryPanel ctx={ctx} />;
    if (page === "pipeline") return <PipelinePanel ctx={ctx} />;
    if (page === "settings") return <SettingsPanel ctx={ctx} />;
    if (page === "agent") return <AgentTestPanel ctx={ctx} />;
    if (page === "screenshot") return <ScreenshotTestPanel />;
    return <AboutPanel />;
  }, [page, selectedId, searchQuery]);

  return (
    <div className="flex h-full w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      <ConsoleSidebar page={page} onChange={handlePageChange} />
      <ConsoleListPanel
        page={page}
        onSelect={setSelectedId}
        selectedId={selectedId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <main className="flex-1 overflow-auto bg-[var(--bg-content)] p-6">
        <div className="mx-auto max-w-5xl">{content}</div>
      </main>
    </div>
  );
}
