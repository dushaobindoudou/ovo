import { useCallback, useMemo, useState } from "react";
import { ConsoleSidebar, type ConsolePage } from "./ConsoleSidebar";
import { OverviewPanel } from "./OverviewPanel";
import { MemoryPanel } from "./MemoryPanel";
import { ProcessPanel } from "./ProcessPanel";
import { OutputsPanel } from "./OutputsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { PermissionGate } from "../shared/PermissionGate";
import { BootstrapWizardGate } from "../Onboarding/BootstrapWizard";
import { LiveStatusBar } from "./LiveStatusBar";

// UI-S1: 终态 4 tab，全部砍中间列。
// 内部 selectedId 仅用作 tab 内组件交互（如 KG 点击实体），不再走外层 list panel
export function ConsoleLayout() {
  const [page, setPage] = useState<ConsolePage>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A: OverviewPanel 完成态点"查看详情"跨 tab 打开 ActionDetailDrawer
  const [pendingOpenActionId, setPendingOpenActionId] = useState<string | null>(null);

  const handlePageChange = useCallback((newPage: ConsolePage) => {
    setPage(newPage);
    setSelectedId(null);
  }, []);

  const requestOpenAction = useCallback((actionId: string) => {
    setPendingOpenActionId(actionId);
    setPage("process");
  }, []);

  const content = useMemo(() => {
    const ctx = {
      page,
      selectedId,
      searchQuery: "",
      requestOpenAction,
      pendingOpenActionId,
      consumeOpenAction: () => setPendingOpenActionId(null)
    };
    if (page === "overview") return <OverviewPanel ctx={ctx} />;
    if (page === "outputs") return <OutputsPanel ctx={ctx} />;
    if (page === "process") return <ProcessPanel ctx={ctx} />;
    if (page === "knowledge") return <MemoryPanel ctx={ctx} />;
    return <SettingsPanel ctx={ctx} />;
  }, [page, selectedId, pendingOpenActionId, requestOpenAction]);

  // 知识库需要全宽（图谱大）；其他 tab 用 max-w-5xl 居中
  const isFullWidth = page === "knowledge";

  return (
    <div className="flex h-full w-full flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <PermissionGate />
      <BootstrapWizardGate />
      <LiveStatusBar />
      <div className="flex min-h-0 flex-1">
        <ConsoleSidebar page={page} onChange={handlePageChange} />
        <main className={`flex-1 overflow-auto bg-[var(--bg-content)] ${isFullWidth ? "p-4" : "p-6"}`}>
          <div className={isFullWidth ? "h-full" : "mx-auto max-w-5xl"}>{content}</div>
        </main>
      </div>
    </div>
  );
}
