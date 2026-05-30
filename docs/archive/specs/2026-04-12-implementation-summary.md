# OCR 和 Claude 测试模块实现总结

## 完成时间
2026-04-12

## 实现内容

### 1. 样式修复
- 修复了 Tailwind CSS v4 配置冲突
- 移除了旧的 `tailwind.config.ts`，使用 CSS 原生 `@theme` 配置
- 添加 `"type": "module"` 到 package.json

### 2. OCR 模块

#### 后端实现
- **WindowManager** (`electron/window-manager.ts`)
  - 使用 AppleScript 获取 macOS 窗口列表
  - 获取活动窗口信息
  - 返回窗口标题、应用名、Bundle ID、位置和大小

- **ScreenshotManager** (`electron/screenshot.ts`)
  - 使用 `screenshot-desktop` 捕获屏幕
  - 支持 Buffer 和 base64 转换
  - 保存截图到用户数据目录

- **OCREngine** (`electron/ocr-engine.ts`)
  - 使用 `tesseract.js` 进行 OCR 识别
  - 支持中英文识别 (eng+chi_sim)
  - 返回文本、置信度和文本块信息

- **AutoCaptureService** (`electron/auto-capture.ts`)
  - 自动定时捕获活动窗口
  - 默认间隔 5 秒
  - 自动执行 OCR 识别
  - 保存历史记录（最多 100 条）
  - 实时推送到前端

#### 前端实现
- **OCRPanel** (`src/components/Console/OCRPanel.tsx`)
  - 三栏布局：窗口列表 | 截图预览 + OCR 结果 | 历史记录
  - 支持启动/停止自动捕获
  - 可调整捕获间隔（1-60 秒）
  - 立即捕获功能
  - 显示 OCR 置信度和文本长度
  - 点击历史记录查看详情

### 3. Claude 测试模块

#### 后端实现
- **ClaudeCodeTester** (`electron/claude-code-tester.ts`)
  - 调用 Claude MCP 进行场景测试
  - 支持自定义测试场景
  - 预设 5 种场景：编码辅助、学习、调试、创意、专注
  - 解析 Claude 响应类型（suggestion/action/reply）
  - 提取可执行操作和推理过程
  - 保存测试历史（最多 50 条）

- **MCPBridge** (`electron/mcp-bridge.ts`)
  - 封装 Claude CLI 调用
  - 支持人格系统集成
  - 单例模式管理

#### 前端实现
- **ClaudeTestPanel** (`src/components/Console/ClaudeTestPanel.tsx`)
  - 三栏布局：场景配置 | Claude 响应 | 测试历史
  - 场景选择器
  - 自定义提示输入
  - 显示响应类型、置信度
  - 显示可执行操作
  - 显示推理过程
  - 批量测试功能

### 4. IPC 通信接口

新增 IPC handlers：
- `ocr:get-all-windows` - 获取所有窗口
- `ocr:get-active-window` - 获取活动窗口
- `ocr:capture-screen` - 截图
- `ocr:recognize-buffer` - OCR 识别
- `ocr:start-auto-capture` - 启动自动捕获
- `ocr:stop-auto-capture` - 停止自动捕获
- `ocr:get-recent-captures` - 获取历史记录
- `ocr:clear-history` - 清除历史
- `ocr:get-config` - 获取配置
- `claude-test:run-scenario` - 运行测试场景
- `claude-test:run-batch` - 批量测试
- `claude-test:get-preset-scenarios` - 获取预设场景
- `claude-test:get-history` - 获取测试历史
- `claude-test:clear-history` - 清除历史

### 5. Console UI 更新

- 添加 "OCR" 和 "Claude 测试" 导航项
- 更新 `ConsolePage` 类型定义
- 集成新的面板组件
- 更新路由处理

### 6. TypeScript 类型定义

创建 `src/types/nudge-api.d.ts`：
- WindowInfo
- OCRResult
- CaptureConfig
- CaptureData
- TestScenario
- ClaudeResponse
- NudgeAPI 接口扩展

### 7. 依赖安装

```json
{
  "tesseract.js": "^5.0.0",
  "screenshot-desktop": "^1.15.0",
  "@nut-tree/nut-js": "latest"
}
```

### 8. 构建配置

更新 `vite.config.ts`：
- 添加 external 依赖：tesseract.js, screenshot-desktop, @nut-tree/nut-js
- 修复 ES module 兼容性

## 技术亮点

1. **模块化设计**
   - 每个功能独立封装为类
   - 清晰的职责分离
   - 易于测试和维护

2. **实时通信**
   - 使用 IPC 事件推送新的捕获数据
   - 前端实时更新 UI

3. **历史管理**
   - 自动限制历史数量
   - 支持清除历史
   - 点击历史查看详情

4. **错误处理**
   - 完善的 try-catch
   - 错误日志输出
   - 友好的错误提示

5. **性能优化**
   - 截图和 OCR 在后台线程执行
   - 历史记录限制避免内存溢出
   - 按需加载和渲染

## 使用方法

### OCR 模块

1. 打开 Nudge 控制台
2. 点击 "OCR" 导航项
3. 点击 "开始捕获" 启动自动捕获
4. 调整捕获间隔（可选）
5. 查看窗口列表、截图和 OCR 结果
6. 点击历史记录查看过往捕获

### Claude 测试模块

1. 打开 Nudge 控制台
2. 点击 "Claude 测试" 导航项
3. 选择一个预设场景
4. 修改自定义提示（可选）
5. 点击 "运行测试" 执行测试
6. 查看 Claude 响应和可执行操作
7. 点击历史记录查看过往测试

## 权限要求

### macOS
- **屏幕录制权限**：系统偏好设置 > 安全性与隐私 > 屏幕录制
- **辅助功能权限**：系统偏好设置 > 安全性与隐私 > 辅助功能

首次运行时系统会自动提示授权。

## 已知限制

1. **窗口管理**
   - 目前仅支持 macOS
   - 使用 AppleScript，性能有限

2. **截图**
   - 只能截取整个屏幕
   - 不支持指定窗口截图（需要额外实现）

3. **OCR**
   - 首次加载需要下载语言包（约 10MB）
   - 识别速度取决于图片大小和复杂度
   - 中文识别准确度有待提高

4. **Claude 测试**
   - 需要安装 Claude CLI
   - 响应时间取决于网络和 Claude API

## 后续优化方向

1. **OCR 优化**
   - 支持指定窗口截图
   - 添加图像预处理提高识别率
   - 支持更多语言
   - 添加 OCR 结果缓存

2. **Claude 集成优化**
   - 支持流式响应
   - 添加更多预设场景
   - 支持场景模板导入导出
   - 集成 OCR 结果自动发送到 Claude

3. **UI 优化**
   - 添加截图标注功能
   - 支持 OCR 结果编辑
   - 添加数据导出功能
   - 优化大量历史记录的性能

4. **跨平台支持**
   - 支持 Windows 窗口管理
   - 支持 Linux 窗口管理

## 测试建议

1. 测试自动捕获功能，确保定时器正常工作
2. 测试不同应用的窗口识别
3. 测试 OCR 对不同语言和字体的识别
4. 测试 Claude 不同场景的响应
5. 测试历史记录的存储和加载
6. 测试权限缺失时的错误处理

## 文档

- 设计文档：`docs/superpowers/specs/2026-04-12-ocr-claude-integration.md`
- 实现总结：本文档
