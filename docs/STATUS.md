# ovo 当前实现状态

更新时间：2026-04-15

## 总览

项目已完成从 0 到 1 的基础实现，包含三窗口架构、捕获/OCR/Agent 调度、知识图谱记忆、Pipeline 日志、节点评价、自检机制与基础 UI。

## 已完成模块

### 1) 应用架构

- Electron 三窗口：
  - 控制台界面（主窗口）
  - 悬浮球
  - 建议面板
- 安全桥接：`electron/preload.cjs`
- 路由分流：`#console` / `#float` / `#panel`

### 2) 屏幕捕获与 OCR

- 活动窗口识别：`electron/window-manager.ts`（macOS AppleScript）
- 截图：`electron/screenshot.ts`
- OCR：`electron/ocr-engine.ts`（tesseract.js）
- 自动捕获：`electron/auto-capture.ts`
  - 默认 5s
  - 支持间隔配置
  - 支持模拟模式
  - 权限失败时自动降级到模拟模式

### 3) Agent 调度层

- `electron/agent-bridge.ts`
  - 支持 `claude-code` / `openclaw` / `hermes` / `api`
  - 自动探测可用后端
  - 支持手动切换优先后端
- `electron/prompt-engine.ts`
  - 意图识别 Prompt
  - Action 执行 Prompt

### 4) 记忆与知识图谱

- `electron/knowledge-graph.ts`（SQLite）
  - `entities`
  - `relationships`
  - `memory_events`
  - `user_feedback`
  - `pipeline_logs`
- `electron/personality-analyzer.ts`
  - 基于记忆统计的人格画像

### 5) 建议与 Action

- `electron/suggestion-engine.ts`
- `electron/action-executor.ts`
  - 支持 Action 批处理
  - 需要确认的 Action 进入 pending

### 6) 全链路日志与反馈

- `electron/pipeline-logger.ts`
- 控制台日志面板（Pipeline 列表 + 详情 + 节点评价）
- 反馈写入：`electron/feedback-engine.ts`

### 7) 定期正确性自检

- 新增 `health` 通道：
  - `health:get-latest`
  - `health:get-config`
  - `health:set-config`
- 自检内容：
  - 是否能获取活动窗口
  - 是否能截图/OCR
  - 置信度、文本长度、距上次捕获时间
- 状态面板展示健康卡片并推送日志

### 8) 前端界面

- 控制台 7 个面板：
  - 状态
  - 窗口
  - 记忆
  - 日志（Pipeline）
  - 设置
  - Agent 测试
  - 关于
- 科技风深色主题变量已建立：`src/index.css`
- 通用组件已抽离：`src/components/shared/*`

## 已知限制（当前版本）

1. 运行 `pnpm dev` 前，若出现 Electron 或原生依赖错误，需要先执行 `pnpm approve-builds`。
2. `openclaw` 与 `api` 后端能否实跑取决于本机安装与环境变量配置。
3. 当前 Action 执行仍是通用执行框架，尚未做细粒度权限策略与幂等保障。
4. 捕获当前以活动窗口为主，后台窗口监听仍可继续增强（精确窗口截图、多源并行）。

## 关键入口文件

- 主进程入口：`electron/main.ts`
- IPC 注册：`electron/ipc-handlers.ts`
- 前端入口：`src/App.tsx`
- 控制台布局：`src/components/Console/ConsoleLayout.tsx`
