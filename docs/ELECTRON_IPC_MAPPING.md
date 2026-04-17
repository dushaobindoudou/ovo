# Electron IPC 功能映射（前后端一一对应）

更新时间：2026-04-16

本文件作为 Electron 前后端对齐的单一事实源，覆盖：
- 前端功能入口（`src/` 组件与 hooks）
- 预加载桥接（`electron/preload.cjs`）
- 主进程处理器（`electron/ipc-handlers.ts`）
- 下游服务（`electron/*` 模块）

## 1) 用户功能链路映射

| 功能域 | 前端入口 | IPC Channel | Main Handler | 下游服务 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 窗口列表/活动窗口 | `useWindows.refresh` -> `WindowPanel` | `windows:get-all` / `windows:get-active` | `ipcMain.handle(...)` | `WindowManager` | used |
| 监控窗口设置 | `useWindows.setMonitored` -> `WindowPanel` | `windows:set-monitored` | `ipcMain.handle(...)` | `AutoCaptureService` | used |
| 窗口捕获统计 | `useWindows.getCaptureStats` -> `WindowPanel` | `windows:get-capture-stats` | `ipcMain.handle(...)` | `AutoCaptureService` | used |
| 自动捕获开始/停止 | `useOCR.startCapture/stopCapture` -> `WindowPanel` | `capture:start` / `capture:stop` | `ipcMain.handle(...)` | `AutoCaptureService` | used |
| 捕获缓冲区查看 | `useCapture.getBuffers` -> `WindowPanel` | `capture:get-buffers` | `ipcMain.handle(...)` | `EventProcessor` | used |
| 手动截图测试 | `useCapture.takeScreenshot` -> `ScreenshotTestPanel` | `capture:take-screenshot` | `ipcMain.handle(...)` | `ScreenshotManager` | used |
| 健康配置 | `useHealth.getConfig/setConfig` -> `SettingsPanel` | `health:get-config` / `health:set-config` | `ipcMain.handle(...)` | `AutoCaptureService` + health timer | used |
| 健康状态展示 | `useHealth.getLatest` + `health:update` 订阅 -> `StatusPanel` | `health:get-latest` / `health:update` | `ipcMain.handle(...)` + `webContents.send(...)` | `AutoCaptureService.runHealthCheck` | used |
| OCR 快速调用 | `useOCR.initialize/recognize`（目前少量 UI） | `ocr:initialize` / `ocr:recognize` | `ipcMain.handle(...)` | `OCREngine` | used |
| Agent 后端检测/切换 | `useAgentBridge.detectBackends/setBackend` -> `StatusPanel`/`SettingsPanel` | `agent:detect-backends` / `agent:set-backend` | `ipcMain.handle(...)` | `AgentBridge` | used |
| Agent API 配置 | `useAgentBridge.setApiConfig` -> `SettingsPanel` | `agent:set-api-config` | `ipcMain.handle(...)` | `AgentBridge` | used |
| Agent 场景测试 | `useAgentBridge.testScenario` -> `AgentTestPanel` | `agent:test-scenario` | `ipcMain.handle(...)` | `ClaudeCodeTester` + `AgentBridge` | used |
| KG 统计/实体检索 | `useKnowledgeGraph` -> `StatusPanel`/`MemoryPanel` | `kg:get-stats` / `kg:search-entities` / `kg:get-entity` | `ipcMain.handle(...)` | `KnowledgeGraphEngine` | used |
| 人格分析 | `useKnowledgeGraph.analyzePersonality` -> `MemoryPanel` | `kg:analyze-personality` | `ipcMain.handle(...)` | `PersonalityAnalyzer` | used |
| 建议流更新 | `useSuggestions` -> `SuggestionPanel` | `suggestion:new` | `webContents.send(...)` | `SuggestionEngine` | used |
| 建议反馈 | `useFeedback` -> `SuggestionCard` | `suggestion:feedback` | `ipcMain.handle(...)` | `FeedbackEngine` | used |
| 待确认 Action | `usePendingActions` -> `PendingActionsSection` | `action:pending` / `action:result` / `action:confirm` / `action:cancel` | `ipcMain.handle(...)` + `webContents.send(...)` | `ActionExecutor` + `PipelineLogger` | used |
| Pipeline 列表/评分 | `usePipeline` + `useFeedback` -> `PipelinePanel`/`PipelineDetail` | `pipeline:get-recent` / `pipeline:rate-stage` / `pipeline:rate-overall` / `pipeline:new` / `pipeline:update` | `ipcMain.handle(...)` + `webContents.send(...)` | `PipelineLogger` | used |
| 应用版本 | `AboutPanel` | `app:get-version` | `ipcMain.handle(...)` | `app.getVersion()` | used |

## 2) Channel 盘点（治理状态）

### used
`windows:get-all`, `windows:get-active`, `windows:set-monitored`, `windows:get-capture-stats`,  
`capture:start`, `capture:stop`, `capture:get-buffers`, `capture:take-screenshot`,  
`health:get-latest`, `health:get-config`, `health:set-config`, `health:update`,  
`ocr:initialize`, `ocr:recognize`,  
`agent:detect-backends`, `agent:set-backend`, `agent:set-api-config`, `agent:test-scenario`,  
`kg:search-entities`, `kg:get-entity`, `kg:get-stats`, `kg:analyze-personality`,  
`suggestion:new`, `suggestion:feedback`,  
`action:pending`, `action:result`, `action:confirm`, `action:cancel`,  
`pipeline:get-recent`, `pipeline:rate-stage`, `pipeline:rate-overall`, `pipeline:clear`, `pipeline:new`, `pipeline:update`,  
`app:get-version`

### unused（当前代码未消费）
`windows:get-monitored`, `capture:set-interval`, `agent:status`, `kg:get-events`, `kg:clear`, `kg:export`, `pipeline:get-detail`, `system-log:list`, `business-log:list`, `business-log:create`, `business-log:update`, `tts:speak`, `app:open-console`

## 3) 已完成对齐项

- `agent:set-api-config`：补齐 typed API，移除 UI 字符串直调。
- `on(channel)`：新增事件白名单，和 `invoke(channel)` 同级治理。
- `kg:search-entities`：修复 query 参数语义，改为真实检索。
- 高频面板（状态/设置/窗口/待确认 action）完成 hooks 收敛，降低组件内 IPC 细节暴露。
- 移除捕获/窗口枚举的模拟回退：权限不足时失败可见，而不是静默假数据。
