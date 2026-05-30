# Nudge 功能完善设计

> 日期：2026-04-10
> 目标：完善 OCR、Memory、语音、Claude Bridge 等核心功能

---

## 1. Memory 系统（Markdown 文件存储）

### 目标
替换有问题的 `better-sqlite3`，使用 Markdown 文件存储记忆。

### 实现

**目录结构**
```
~/Library/Application Support/nudge/
└── memories/
    ├── 2026-04-10.md
    ├── 2026-04-11.md
    └── index.json  # 索引文件
```

**文件格式 (2026-04-10.md)**
```markdown
# Memory Entry
timestamp: 1711234567890
type: context
importance: 3

用户正在编写 Nudge 应用的 OCR 模块

---
# Memory Entry
timestamp: 1711234567900
type: action
importance: 5

添加了屏幕捕获功能的快捷键 Cmd+Shift+V
```

**索引格式 (index.json)**
```json
{
  "entries": [
    { "file": "2026-04-10.md", "timestamp": 1711234567890, "type": "context", "importance": 3 },
    { "file": "2026-04-11.md", "timestamp": 1711320967890, "type": "summary", "importance": 2 }
  ]
}
```

### API
- `addMemory(content, type, importance)` → 返回 entry ID
- `getRecentMemories(limit, type?)` → MemoryEntry[]
- `searchMemories(query, limit)` → SearchResult[]
- `getContextForPrompt(maxTokens)` → string
- `clearMemories(type?)` → void

---

## 2. OCR 集成

### 目标
将已实现的 `electron/ocr.ts` (tesseract.js) 真正集成到建议引擎中。

### 当前问题
- `electron/ocr.ts` 已实现但未被调用
- `src/lib/ocrPipeline.ts` 使用 mock 数据

### 修改
1. 修改 `src/lib/ocrPipeline.ts`
   - 调用 `window.nudgeAPI.ocrCaptureAndRecognize()` 获取真实 OCR 结果
   - 如果失败，降级到 mock

2. 确保 OCR 引擎在应用启动时初始化

---

## 3. Edge TTS 语音输出

### 目标
使用 edge-tts 提供更自然的语音输出。

### 实现

**主进程 (electron/main.ts)**
```typescript
ipcMain.handle('tts:speak', async (_event, text: string, voice?: string) => {
  // 生成临时文件路径
  const tempFile = path.join(app.getPath('temp'), `nudge-tts-${Date.now()}.mp3`)
  
  // 调用 edge-tts CLI
  const result = await spawn('edge-tts', [
    '-t', text,
    '-f', tempFile,
    '--voice', voice || 'zh-CN-XiaoxiaoNeural'
  ])
  
  if (result.success) {
    // 读取文件并返回 base64
    const audioData = fs.readFileSync(tempFile)
    fs.unlinkSync(tempFile) // 清理临时文件
    return { ok: true, audio: audioData.toString('base64') }
  }
  return { ok: false, error: result.error }
})
```

**渲染进程 (useVoiceOutput.ts)**
- 新增 `speakWithEdgeTTS` 方法
- 通过 IPC 调用主进程
- 播放返回的音频数据

---

## 4. Claude Bridge（MCP）

### 目标
实现真正的 Claude CLI 集成，不使用 mock 回退。

### 实现

**检测 Claude CLI**
```typescript
function checkClaudeCLI(): boolean {
  try {
    execSync('which claude', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
```

**MCP 调用流程**
```typescript
async function callClaudeMCP(prompt: string): Promise<string> {
  // 检查 CLI 是否可用
  if (!checkClaudeCLI()) {
    throw new Error('Claude CLI 未安装或不在 PATH 中')
  }
  
  // 调用 claude mcp 命令
  const result = execSync('claude mcp run prompt --text "' + prompt + '"', {
    encoding: 'utf-8',
    timeout: 30000
  })
  
  return result
}
```

**错误处理**
- 如果 Claude CLI 不可用，返回明确错误信息
- 不使用任何 mock 数据作为回退
- 在 UI 中显示 "Claude 不可用" 状态

---

## 5. Debug 窗口改进

### 目标
Debug 窗口不自动打开，可在设置中手动打开。

### 实现

**修改 electron/main.ts**
- 注释掉 `createDebugWindow()` 的自动调用
- 添加 IPC handler：`debug:open`

**设置窗口**
- 在设置面板中添加 "打开调试窗口" 按钮
- 点击后调用 `window.nudgeAPI.openDebug()`

---

## 6. 设置窗口样式

### 目标
使用标准 Electron 窗口，macOS 原生风格。

### 实现

**electron/main.ts - createSettingsWindow()**
```typescript
function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    frame: true,  // 使用系统原生标题栏
    title: 'Nudge 设置',
    backgroundColor: '#ffffff',  // 白色背景，macOS 风格
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // ... 其他代码
}
```

**样式调整**
- 移除透明背景 (`transparent: false`)
- 使用原生标题栏 (`frame: true`)
- 白色或浅灰色背景
- 简洁的设置项布局

---

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `electron/memory.ts` | 重写为 Markdown 文件存储 |
| `electron/main.ts` | 添加 TTS IPC, Debug IPC, 修改设置窗口样式 |
| `electron/preload.ts` | 暴露新 API |
| `src/lib/ocrPipeline.ts` | 调用真实 OCR API |
| `src/hooks/useVoiceOutput.ts` | 添加 edge-tts 调用 |
| `src/hooks/useClaudeBridge.ts` | MCP 调用实现 |
| `src/components/SettingsPanelFull.tsx` | 添加 Debug 按钮 |
| `src/vite-env.d.ts` | 添加新类型定义 |

---

## 依赖

```bash
pnpm add edge-tts  # 或使用系统 edge-tts 命令
```