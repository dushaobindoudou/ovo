# OCR 和 Claude Code 集成设计

## 概述

为 Nudge 添加两个核心测试模块：
1. **OCR 模块**：识别系统窗口、捕获活动窗口截图
2. **Claude Code 测试模块**：调用 Claude Code 进行场景测试和建议生成

## 1. OCR 模块设计

### 1.1 功能需求

- 列出系统所有窗口及对应应用
- 识别当前活动窗口
- 每 5 秒对活动窗口进行截图
- 使用 OCR 识别截图中的文本内容
- 在 Console 中展示结果

### 1.2 技术架构

#### 窗口管理 API（macOS）
```typescript
// electron/window-manager.ts
interface WindowInfo {
  id: number
  title: string
  appName: string
  bundleId: string
  isActive: boolean
  bounds: { x: number; y: number; width: number; height: number }
}

class WindowManager {
  // 获取所有窗口列表
  async getAllWindows(): Promise<WindowInfo[]>
  
  // 获取活动窗口
  async getActiveWindow(): Promise<WindowInfo | null>
  
  // 监听窗口变化
  onWindowChange(callback: (window: WindowInfo) => void): void
}
```

**实现方案**：
- 使用 `@nut-tree/nut-js` 或 `node-window-manager` 获取窗口信息
- 使用 macOS Accessibility API（通过 AppleScript）获取详细信息

#### 截图 API
```typescript
// electron/screenshot.ts
interface ScreenshotOptions {
  windowId?: number
  bounds?: { x: number; y: number; width: number; height: number }
}

class ScreenshotManager {
  async captureWindow(windowId: number): Promise<Buffer>
  async captureArea(bounds: ScreenshotOptions['bounds']): Promise<Buffer>
  async saveScreenshot(buffer: Buffer, path: string): Promise<void>
}
```

#### OCR 识别 API
```typescript
// electron/ocr-engine.ts
interface OCRResult {
  text: string
  confidence: number
  blocks: Array<{
    text: string
    bbox: { x: number; y: number; width: number; height: number }
    confidence: number
  }>
}

class OCREngine {
  async recognize(imagePath: string): Promise<OCRResult>
  async recognizeBuffer(buffer: Buffer): Promise<OCRResult>
}
```

**实现方案**：使用 `tesseract.js`（纯 JS，跨平台）

#### 自动截图服务
```typescript
// electron/auto-capture.ts
interface CaptureConfig {
  interval: number
  enabled: boolean
  saveHistory: boolean
  maxHistory: number
}

class AutoCaptureService {
  start(config: CaptureConfig): void
  stop(): void
  getRecentCaptures(): Promise<Array<CaptureData>>
}
```

### 1.3 IPC 通信接口

```typescript
interface OCRBridge {
  getAllWindows: () => Promise<WindowInfo[]>
  getActiveWindow: () => Promise<WindowInfo | null>
  captureWindow: (windowId: number) => Promise<string>
  recognizeImage: (imagePath: string) => Promise<OCRResult>
  startAutoCapture: (config: CaptureConfig) => Promise<void>
  stopAutoCapture: () => Promise<void>
  onNewCapture: (callback: (data: CaptureData) => void) => void
}
```

## 2. Claude Code 测试模块设计

### 2.1 功能需求

- 在不同场景下调用 Claude Code
- 测试 Claude Code 的响应能力
- 展示建议、Action 和回复内容
- 支持自定义测试场景

### 2.2 技术架构

#### Claude Code 调用接口
```typescript
interface TestScenario {
  id: string
  name: string
  description: string
  context: {
    windowInfo?: WindowInfo
    screenshot?: string
    ocrText?: string
    userActivity?: string
    customPrompt?: string
  }
  personality?: string
}

interface ClaudeResponse {
  type: 'suggestion' | 'action' | 'reply'
  content: string
  actions?: Array<{
    type: string
    description: string
    command?: string
  }>
  confidence: number
  reasoning?: string
}
```

#### 预设测试场景
- 编码辅助
- 学习场景
- 调试场景
- 创意场景
- OCR 上下文

### 2.3 数据流

```
OCR 数据流:
用户启动 → 定时器(5s) → 获取窗口 → 截图 → OCR → 前端展示

Claude 测试流:
选择场景 → 收集上下文 → 调用 Claude → 解析响应 → 展示结果
```

## 3. 实现优先级

### Phase 1: 基础窗口管理
- WindowManager 实现
- 基础截图功能
- OCRPanel UI 框架

### Phase 2: OCR 集成
- tesseract.js 集成
- OCREngine 实现
- 自动捕获服务

### Phase 3: Claude 测试模块
- ClaudeCodeTester 实现
- 预设场景定义
- ClaudeTestPanel UI

### Phase 4: 集成优化
- OCR → Claude 自动流程
- 性能优化
- 错误处理

## 4. 技术依赖

```json
{
  "tesseract.js": "^5.0.0",
  "screenshot-desktop": "^1.15.0",
  "node-window-manager": "^2.2.4"
}
```

## 5. 权限要求

- macOS 屏幕录制权限
- macOS 辅助功能权限
