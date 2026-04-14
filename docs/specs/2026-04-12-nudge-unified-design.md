# Nudge 主动式 AI 桌面助手 - 统一设计文档

> **版本**: v3.0 (统一版)
> **日期**: 2026-04-12
> **状态**: 设计完成

---

## 1. 产品概述

### 1.1 产品愿景

**Nudge** 是一个具有**强主动性**的 AI 桌面助手，核心特点：

- 🎯 **主动感知** - 不打断用户，但时刻观察屏幕内容
- 🧠 **理解意图** - 通过 OCR + LLM 理解用户正在做什么
- 🎭 **多性格** - 不同场景切换不同"灵魂"（Soul）
- ⚡ **自动执行** - 检测到可执行的 Action 时主动提议并执行
- 📈 **自我进化** - 越用越聪明，根据反馈迭代

### 1.2 核心理念

- **旁路不打扰**: 不阻塞用户主流程，建议在侧边自然浮现
- **透明可控**: 用户随时看到系统状态，可配置和切换
- **多重人格**: 工作正式、聊天随意、谈判警觉，智能切换
- **隐私优先**: 数据本地存储，用户完全控制

### 1.3 使用场景

| 场景 | 示例 |
|------|------|
| 写邮件 | 识别收件人，从记忆中找到相关背景，建议邮件措辞 |
| 团队沟通 | 识别讨论内容，提醒潜在风险，自动记录待办 |
| 朋友聊天 | 识别聊天对象，推荐有趣话题，活跃气氛 |
| 阅读文档 | 自动记忆关键内容，推荐相关历史资料 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Nudge Electron App                       │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │   Screen     │──▶│ OCR Pipeline │──▶│ Event Processor │  │
│  │   Capture    │   │  Tesseract   │   │  去重 + 变化检测  │  │
│  │  5s/次(可配) │   │  (中英文)     │   │  应用上下文标记   │  │
│  └─────────────┘   └──────────────┘   └────────┬────────┘  │
│                                                  │          │
│  ┌───────────────────────────────────────────────▼────────┐ │
│  │                   Memory Engine                         │ │
│  │                                                         │ │
│  │  语义提取 ──▶ 事件生成 ──▶ 重要性评分 ──▶ 分层存储       │ │
│  │                                                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │ │
│  │  │短期记忆   │  │中期记忆   │  │长期记忆               │  │ │
│  │  │24h缓存   │  │周压缩    │  │结构化知识图谱          │  │ │
│  │  │SQLite    │  │SQLite    │  │SQLite + 关联表         │  │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘  │ │
│  └───────────────────────────┬─────────────────────────────┘ │
│                               │                              │
│  ┌────────────────────────────▼─────────────────────────────┐│
│  │               Claude Code Bridge                         ││
│  │                                                          ││
│  │  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐  ││
│  │  │  性格路由     │  │  建议生成   │  │  自我迭代引擎    │  ││
│  │  │  智能判断     │  │  上下文感知 │  │  反馈学习        │  ││
│  │  │  + 按应用配置 │  │  + 记忆关联 │  │  + 行为调优      │  ││
│  │  └──────────────┘  └────────────┘  └─────────────────┘  ││
│  └────────────────────────────┬─────────────────────────────┘│
│                               │                              │
│  ┌────────────────────────────▼─────────────────────────────┐│
│  │                    UI Layer                               ││
│  │                                                           ││
│  │  ┌────────────┐  ┌────────────────┐  ┌────────────────┐ ││
│  │  │  悬浮图标   │  │  歌词式面板     │  │  控制台         │ ││
│  │  │  状态指示   │  │  透明左侧       │  │  设置/状态/记忆 │ ││
│  │  │  一键唤醒   │  │  卡片式建议     │  │  多Tab管理      │ ││
│  │  └────────────┘  └────────────────┘  └────────────────┘ ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │   Web Speech API  │  │    Edge TTS      │                 │
│  │   语音输入(零开销) │  │   语音输出(免费)  │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 桌面框架 | Electron 34+ | 跨平台，成熟生态 |
| 屏幕捕获 | macOS CGWindowList API via Electron | 精确获取激活窗口截图 |
| OCR引擎 | Tesseract.js | 本地推理，中英文识别 |
| 记忆存储 | better-sqlite3 | 纯本地，高性能，结构化查询 |
| AI推理 | Claude API（通过Claude Code桥接） | 建议生成、性格路由、记忆压缩 |
| 悬浮UI | Electron BrowserWindow（透明+置顶） | 歌词式左侧面板 |
| 语音输入 | Web Speech API | 浏览器原生，零资源开销 |
| 语音输出 | Edge TTS | 微软免费API，中英文自然 |
| 前端框架 | React + TailwindCSS | UI开发效率 |
| 状态管理 | Zustand | 轻量级状态管理 |

### 2.3 窗口架构

只保留 3 个核心窗口：

1. **Console 控制台** (主窗口)
   - 启动时默认打开
   - 显示系统状态、事件日志、设置
   - 包含：状态面板、设置面板、记忆浏览、OCR、Claude测试、关于

2. **Floating Icon 悬浮球** (可选)
   - 右上角状态指示器
   - 点击打开/关闭建议面板
   - 显示工作状态（监听/思考/有建议/错误）

3. **Suggestion Panel 建议面板** (可选)
   - 左侧透明面板
   - 显示 AI 建议卡片
   - 用户可点赞/踩/忽略

---

## 3. 核心模块设计

### 3.1 屏幕捕获 + OCR

**职责**: 定时捕获活动窗口，OCR 识别文本

```typescript
// electron/ocr.ts
interface OCRResult {
  ok: boolean
  text: string
  windowInfo: { appName: string; title: string }
  timestamp: number
  confidence: number
  blocks: Array<{
    text: string
    bbox: { x: number; y: number; width: number; height: number }
    confidence: number
  }>
  error?: string
}

// 核心函数
async function captureAndRecognize(): Promise<OCRResult>
```

**配置**:
- 捕获间隔: 5-60 秒可配置
- 目标窗口: 当前激活窗口
- 引擎: Tesseract.js (eng+chi_sim)

### 3.2 事件处理器

**职责**: 对OCR结果进行去重、变化检测和语义提取

```typescript
interface ScreenEvent {
  id: string
  timestamp: number
  appContext: AppContext
  changedText: string
  fullText: string
  eventType: EventType
}

interface AppContext {
  appName: string
  windowTitle: string
  category: AppCategory
}

enum AppCategory {
  EMAIL = 'email',
  CHAT = 'chat',
  BROWSER = 'browser',
  CODE = 'code',
  DOCUMENT = 'document',
  DESIGN = 'design',
  OTHER = 'other'
}

enum EventType {
  TEXT_CHANGE = 'text_change',
  WINDOW_SWITCH = 'window_switch',
  NEW_CONTENT = 'new_content'
}
```

**去重算法**:
- 使用 Levenshtein 距离计算文本相似度
- 相似度 > 90%: 视为无变化，跳过
- 相似度 50%-90%: 部分变化，提取差异部分
- 相似度 < 50%: 大幅变化，视为新内容

### 3.3 记忆引擎

**职责**: 存储和检索用户行为记忆

```typescript
// electron/memory.ts
interface MemoryEvent {
  id: string
  timestamp: number
  appName: string
  windowTitle: string
  content: string
  summary?: string
  importance: number  // 1-10
  tags: string[]
  entities?: string[]
}

class MemoryEngine {
  async addEvent(event: MemoryEvent): Promise<void>
  async searchRelevant(context: string, limit: number): Promise<MemoryEvent[]>
  async getStats(): Promise<{ total: number; byApp: Record<string, number> }>
  async getContextForPrompt(maxTokens: number): Promise<string>
  async clearMemories(type?: string): Promise<void>
}
```

**存储结构**:

```sql
CREATE TABLE memory_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  app_name TEXT NOT NULL,
  window_title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  importance INTEGER DEFAULT 5,
  tags TEXT,
  entities TEXT,
  created_at INTEGER
);

CREATE INDEX idx_timestamp ON memory_events(timestamp);
CREATE INDEX idx_app_name ON memory_events(app_name);
```

**压缩策略**（未来实现）:
- 每日凌晨压缩 24h 前的事件
- 低重要性事件自动删除
- 高重要性事件生成摘要

### 3.4 Claude 桥接

**职责**: 调用 Claude CLI 生成建议和执行任务

```typescript
// electron/mcp-bridge.ts
interface ClaudeRequest {
  prompt: string
  context?: string
  personality?: string
}

interface ClaudeResponse {
  ok: boolean
  content?: string
  error?: string
}

async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse>
function checkClaudeCLI(): boolean
```

**人格系统**:

```typescript
const PERSONALITIES = {
  work: {
    name: '工作模式',
    prompt: '你是专业的工作助手，简洁、正式、高效',
    formality: 0.8,
    humor: 0.1,
    verbosity: 0.5
  },
  casual: {
    name: '随意模式',
    prompt: '你是轻松的朋友，幽默、亲切、随意',
    formality: 0.2,
    humor: 0.8,
    verbosity: 0.6
  },
  learning: {
    name: '学习模式',
    prompt: '你是耐心的导师，详细、引导、鼓励',
    formality: 0.4,
    humor: 0.2,
    verbosity: 0.9
  },
  negotiation: {
    name: '谈判模式',
    prompt: '你是敏锐的顾问，警觉、分析、提醒风险',
    formality: 0.9,
    humor: 0.0,
    verbosity: 0.7
  }
}
```

### 3.5 建议引擎

**职责**: 整合 OCR、记忆、Claude，生成建议

```typescript
interface Suggestion {
  id: string
  type: SuggestionType
  content: string
  detail?: string
  priority: 1 | 2 | 3 | 4 | 5
  actionable: boolean
  actions?: SuggestionAction[]
  relatedMemories?: string[]
  personality: string
  timestamp: number
}

enum SuggestionType {
  CONTENT_HELP = 'content_help',
  RISK_ALERT = 'risk_alert',
  TODO_RECORD = 'todo_record',
  MEMORY_RECALL = 'memory_recall',
  TOPIC_SUGGEST = 'topic_suggest',
  DOCUMENT_SUMMARY = 'doc_summary',
  EMOTION_ADJUST = 'emotion_adjust'
}

interface SuggestionAction {
  type: string
  description: string
  params: object
  executeAfterConfirm: boolean
}
```

**建议生成流程**:
```
1. 接收 ScreenEvent + 上下文
2. 检索相关记忆（MemoryEngine.searchRelevantMemories）
3. 构建提示词：
   - 当前屏幕内容
   - 相关记忆摘要
   - 当前性格的系统提示词
   - 建议生成指令
4. 调用 Claude API
5. 解析返回的建议
6. 过滤低质量建议（基于历史反馈学习的阈值）
7. 推送到 UI 层
```

### 3.6 自我迭代引擎

**反馈循环**:
```
用户行为（点赞/踩/忽略）
  │
  ├─▶ 记录反馈到 user_feedback 表
  │
  ├─▶ [实时] 调整建议过滤阈值
  │     - 被踩的建议类型 → 提高触发阈值
  │     - 被赞的建议类型 → 降低触发阈值
  │
  ├─▶ [每日] 分析反馈模式
  │     - 哪些场景下建议最有用？
  │     - 哪些性格更受欢迎？
  │     - 哪些时间段建议被忽略最多？
  │
  └─▶ [每周] 生成迭代报告
        - 性格调优建议
        - 建议策略调整
        - 记忆结构优化
```

---

## 4. UI 设计

### 4.1 Console 控制台（主窗口）

**布局**:

```
┌────────────────────────────────────────────────────────────┐
│  Nudge 控制台                                     [_][□][×] │
├────────────┬───────────────────────────────────────────────┤
│            │                                               │
│  📊 状态   │                                               │
│            │            [当前选中导航的内容]                │
│  ⚙️ 设置   │                                               │
│            │                                               │
│  🧠 记忆   │                                               │
│            │                                               │
│  📷 OCR   │                                               │
│            │                                               │
│  🤖 Claude │                                               │
│            │                                               │
│  ℹ️ 关于   │                                               │
│            │                                               │
└────────────┴───────────────────────────────────────────────┘
```

**布局说明**:
- **左侧导航栏**: 固定宽度 180px，深色背景
- **右侧内容区**: 自适应宽度，白色/浅色背景
- **窗口控制**: 标准 macOS 标题栏（使用 frame: true）

### 4.2 状态面板

```
┌────────────────────────────────────────────────────────────┐
│                        状态                                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 🤖 Claude MCP                                        │ │
│  │ ─────────────────────────────────────────────────── │ │
│  │ 状态:        ✅ 已连接                               │ │
│  │ 版本:        v1.0.12                                 │ │
│  │ 最后调用:    21:40:50                                │ │
│  │ 调用次数:   42                                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 📷 OCR 引擎                                          │ │
│  │ ─────────────────────────────────────────────────── │ │
│  │ 状态:        🟢 运行中                               │ │
│  │ 引擎:        tesseract.js v5.1.0                    │ │
│  │ 识别次数:   156                                      │ │
│  │ 平均耗时:   2.3s                                    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 🔊 语音输出 (Edge TTS)                              │ │
│  │ ─────────────────────────────────────────────────── │ │
│  │ 状态:        ✅ 可用                                 │ │
│  │ 可用声音:   4 种                                    │ │
│  │ 播放次数:   28                                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 📝 实时日志                                          │ │
│  │ ─────────────────────────────────────────────────── │ │
│  │ [21:40:50] OCR 初始化完成                            │ │
│  │ [21:40:51] 窗口列表已刷新，共 12 个窗口             │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 4.3 设置面板

```
┌────────────────────────────────────────────────────────────┐
│                        设置                                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ▼ OCR 设置                                                 │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ 监控间隔    [5秒 ▼]                                  │ │
│    │ 监控目标    [活动窗口 ▼]                             │ │
│    │ 指定窗口    [Chrome ] [VS Code ] [+添加]            │ │
│    └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ▼ Claude / MCP 设置                                        │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ CLI 状态    ✅ 已安装 (v1.0.12)                     │ │
│    │ 超时时间    [30秒 ▼]                                │ │
│    │ 模型        [sonnet ▼]                              │ │
│    │ 日志级别    [info ▼]                               │ │
│    └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ▼ 语音设置                                                 │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ 语音输入    [●] 启用    唤醒键 [Cmd+Shift+Space]   │ │
│    │ 语音输出    [●] 启用    默认声音 [晓晓 ▼]          │ │
│    └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ▼ Personality 设置                                         │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ 自动路由    [●] 启用                                │ │
│    │ 默认人格    [auto ▼]                               │ │
│    │ 应用规则:                                          │ │
│    │   Gmail  → work                                   │ │
│    │   WeChat → casual                                 │ │
│    │   [+] 添加规则                                     │ │
│    └─────────────────────────────────────────────────────┘ │
│                                                             │
│  ▼ 高级设置                                                 │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ 自我迭代    [ ] 禁用                               │ │
│    │ 数据路径    ~/Library/Application Support/Nudge    │ │
│    └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 4.4 记忆面板

- 记忆事件列表
- 按应用筛选
- 搜索功能
- 清除记忆

### 4.5 OCR 面板

```
┌────────────────────────────────────────────────────────────┐
│                        OCR                                   │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐   ┌─────────────────────────────┐ │
│  │ 📺 窗口列表         │   │ ⚙️ OCR 配置                  │ │
│  │                     │   │                              │ │
│  │ [ ] Chrome          │   │ 间隔: [5秒 ▼]               │ │
│  │   └ Chrome - Title  │   │ 目标: [活动窗口 ▼]          │ │
│  │ [✓] VS Code         │   │                              │ │
│  │   └ Nudge - main.ts │   │ [▶ 开始监控] [⏹ 停止]        │ │
│  │ [ ] WeChat          │   │                              │ │
│  │   └ 消息            │   │ ┌─────────────────────────┐  │ │
│  │                     │   │ │ 识别结果               │  │ │
│  │ 当前活动窗口:       │   │ │ ───────────────────────│  │ │
│  │ VS Code            │   │ │ 文本内容...             │  │ │
│  │                     │   │ │                        │  │ │
│  │ [🔄 刷新窗口列表]   │   │ │ 置信度: 85% | 耗时: 2s │  │ │
│  └─────────────────────┘   │ └─────────────────────────┘  │ │
│                            └─────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📝 捕获历史                                           │   │
│  │ [21:40:50] Chrome - 邮件内容...             [查看]  │   │
│  │ [21:40:45] VS Code - 代码编写...             [查看]  │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### 4.6 Claude 测试面板

```
┌────────────────────────────────────────────────────────────┐
│                     Claude 测试                              │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐   ┌─────────────────────────────┐ │
│  │ 📋 场景选择          │   │ 🤖 Claude 响应                │ │
│  │                     │   │                              │ │
│  │ [选择场景 ▼]        │   │ 类型: suggestion             │ │
│  │   - 编码辅助        │   │ 置信度: 0.92                 │ │
│  │   - 学习场景        │   │                              │ │
│  │   - 调试场景        │   │ 建议内容:                     │ │
│  │   - 创意场景        │   │ 根据代码分析，建议添加...    │ │
│  │   - OCR 上下文      │   │                              │ │
│  │                     │   │ 可执行操作:                   │ │
│  │ 自定义提示:         │   │ • copy_to_clipboard          │ │
│  │ [                 ] │   │ • add_comment               │ │
│  │                     │   │                              │ │
│  │ [▶ 运行测试]        │   │ 推理过程:                    │ │
│  │ [⏩ 批量测试]        │   │ 1. 检测到编码场景...         │ │
│  └─────────────────────┘   └─────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📝 测试历史                                           │   │
│  │ [21:40:50] 编码辅助 - 成功                 [查看]   │   │
│  │ [21:40:30] 调试场景 - 成功                 [查看]   │   │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 4.7 关于面板

```
┌────────────────────────────────────────────────────────────┐
│                        关于                                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│                      🎯 Nudge                               │
│                   主动式 AI 桌面助手                         │
│                                                             │
│                      版本 0.1.0                             │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  更新日志:                                                  │
│  ─────────────────────────────────────────────────────────│
│  v0.1.0 (2026-04-12)                                       │
│  • 初始版本发布                                             │
│  • OCR 识别功能                                            │
│  • Claude MCP 集成                                         │
│  • Edge TTS 语音输出                                        │
│  • 悬浮球 + 建议面板                                        │
│  • 控制台多Tab                                             │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  权限要求:                                                  │
│  • 屏幕录制 (必须)                                         │
│  • 辅助功能 (必须)                                         │
│  • 麦克风 (可选)                                           │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 4.8 Floating Icon 悬浮球

**状态设计**:

| 状态 | 视觉表现 | 含义 |
|------|----------|------|
| idle | 蓝色圆环，缓慢呼吸动画 | 正常工作中 |
| listen | 青色圆环，声纳扩散动画 | 正在监听屏幕内容 |
| think | 紫色圆环，旋转弧线动画 | 正在分析屏幕内容 |
| gen | 琥珀色圆环，扫描线动画 | 正在生成建议 |
| error | 红色闪烁，叉号动画 | OCR或API出错 |
| voice | 蓝色，均衡器动画 | 语音识别开启 |

**交互**:
- 单击: 展开/收起建议面板
- 右键: 快捷菜单（暂停、静音、设置、退出）
- 拖拽: 调整位置

### 4.9 Suggestion Panel 建议面板

**视觉风格**: 科技感

- **背景**: 深色半透明（`rgba(15, 15, 25, 0.85)`），毛玻璃效果（`backdrop-filter: blur(20px)`）
- **边框**: 1px 渐变边框（蓝紫色渐变），微发光效果
- **字体**: SF Pro / Inter，白色文字
- **卡片**: 圆角卡片，悬浮时微发光

**布局**:

```
┌─────────────────────────────┐
│  Nudge          [设置][—]  │
├─────────────────────────────┤
│                             │
│  ┌───────────────────────┐ │
│  │ 💡 回复建议           │ │
│  │                       │ │
│  │ 根据对话内容...       │ │
│  │                       │ │
│  │ [👍] [👎] [忽略]     │ │
│  └───────────────────────┘ │
│                             │
│  ┌───────────────────────┐ │
│  │ ⚠️ 风险提醒           │ │
│  │                       │ │
│  │ 当前讨论的方案存在... │ │
│  │                       │ │
│  │ [展开详情] [👍] [👎] │ │
│  └───────────────────────┘ │
│                             │
│  ┌───────────────────────┐ │
│  │ 📝 TODO 记录          │ │
│  │                       │ │
│  │ 检测到待办事项...     │ │
│  │                       │ │
│  │ [添加] [忽略]         │ │
│  └───────────────────────┘ │
│                             │
├─────────────────────────────┤
│  🎤 语音输入          3条建议 │
└─────────────────────────────┘
```

**动画效果**:
- 卡片入场: 从左侧滑入 + 淡入
- 卡片退场: 淡出 + 向上位移
- 新建议: 顶部卡片微弹跳

---

## 5. 数据流

### 5.1 主数据流

```
[每5秒]
Screen Capture
  │ 获取激活窗口截图
  ▼
OCR Pipeline
  │ Tesseract识别 → 结构化文本
  ▼
Event Processor
  │ 去重 + 变化检测 + 应用标记
  │ （无变化则终止流程）
  ▼
Memory Engine
  │ 语义提取 → 重要性评分 → 关联检测
  │ 存储到SQLite
  ▼
Claude Code Bridge
  │ 检索相关记忆
  │ 性格路由
  │ 生成建议
  ▼
UI Layer
  │ 推送建议卡片到左侧面板
  ▼
[用户交互]
  │ 点赞/踩/忽略
  ▼
Self-Iteration Engine
  │ 记录反馈 → 调整策略
```

### 5.2 IPC 通信接口

| IPC | 方向 | 参数 | 返回 |
|-----|------|------|------|
| `ocr:initialize` | renderer→main | - | void |
| `ocr:capture-and-recognize` | renderer→main | - | OCRResult |
| `ocr:terminate` | renderer→main | - | void |
| `ocr:get-all-windows` | renderer→main | - | WindowInfo[] |
| `ocr:get-active-window` | renderer→main | - | WindowInfo |
| `ocr:start-auto-capture` | renderer→main | config | void |
| `ocr:stop-auto-capture` | renderer→main | - | void |
| `ocr:get-recent-captures` | renderer→main | - | CaptureData[] |
| `mcp:generate` | renderer→main | request | ClaudeResponse |
| `mcp:status` | renderer→main | - | { available: boolean, version: string } |
| `claude-test:run-scenario` | renderer→main | scenario | TestResult |
| `claude-test:get-preset-scenarios` | renderer→main | - | Scenario[] |
| `memory:add` | renderer→main | event | string |
| `memory:search` | renderer→main | query | MemoryEvent[] |
| `memory:stats` | renderer→main | - | Stats |
| `memory:clear` | renderer→main | type? | void |
| `tts:speak` | renderer→main | text, voice | void |
| `tts:get-voices` | renderer→main | - | Voice[] |
| `window:list` | main→renderer | - | WindowInfo[] |
| `window:active` | main→renderer | - | WindowInfo |
| `monitor:start` | renderer→main | interval, target | void |
| `monitor:stop` | renderer→main | - | void |
| `monitor:result` | main→renderer | OCRResult | void |

---

## 6. 文件结构

```
nudge/
├── electron/
│   ├── main.ts                    # Electron主进程
│   ├── preload.ts                 # 预加载脚本
│   ├── ocr.ts                     # 遗留OCR（已弃用）
│   ├── ocr-engine.ts              # 新OCR引擎
│   ├── window-manager.ts          # 窗口管理
│   ├── screenshot.ts              # 截图捕获
│   ├── auto-capture.ts            # 自动捕获服务
│   ├── mcp-bridge.ts              # Claude桥接
│   ├── memory-engine.ts           # 记忆引擎
│   ├── tts.ts                     # Edge TTS
│   ├── claude-code-tester.ts      # Claude测试
│   └── personalities.ts           # 人格定义
│
├── src/                           # React前端
│   ├── App.tsx                    # 路由入口
│   ├── main.tsx                   # React入口
│   ├── index.css                  # 全局样式
│   ├── style                      # 样式目录
│   ├── components/
│   │   ├── FloatingIcon.tsx       # 悬浮球
│   │   ├── SuggestionPanel.tsx    # 建议面板
│   │   ├── SuggestionCard.tsx     # 建议卡片
│   │   ├── StatusBar.tsx          # 状态栏
│   │   └── Console/
│   │       ├── ConsoleLayout.tsx  # 控制台布局
│   │       ├── ConsoleNav.tsx     # 导航栏
│   │       ├── StatusPanel.tsx    # 状态面板
│   │       ├── SettingsPanel.tsx  # 设置面板
│   │       ├── MemoryPanel.tsx     # 记忆面板
│   │       ├── OCRPanel.tsx       # OCR面板
│   │       ├── ClaudeTestPanel.tsx # Claude测试面板
│   │       └── AboutPanel.tsx     # 关于面板
│   ├── hooks/
│   │   ├── useSuggestionEngine.ts # 建议引擎
│   │   ├── useClaudeBridge.ts     # Claude桥接
│   │   └── ...
│   ├── stores/
│   │   ├── suggestionStore.ts     # 建议状态
│   │   ├── settingsStore.ts       # 设置状态
│   │   └── runtimeStore.ts        # 运行时状态
│   └── types/
│       └── nudge-api.d.ts         # 类型定义
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-12-nudge-unified-design.md  # 本文档
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
└── README.md
```

---

## 7. 性能与资源

### 7.1 资源预估

| 组件 | CPU占用 | 内存占用 | 说明 |
|------|---------|----------|------|
| Electron主进程 | 低 | ~80MB | 框架基础开销 |
| Screen Capture | 极低 | ~20MB | 5秒一次截图 |
| Tesseract.js | 中（推理时） | ~300MB | 模型加载后常驻 |
| SQLite | 极低 | ~10MB | 轻量级 |
| React UI | 低 | ~50MB | 渲染层 |
| Claude API调用 | 无（云端） | ~5MB | 网络IO |
| **总计** | **中低** | **~465MB** | 对现代Mac轻松可承受 |

### 7.2 性能优化策略

1. **OCR降频**: 当窗口无变化时，自动延长OCR间隔（5s → 15s → 30s）
2. **增量处理**: 只处理变化的文本段，不重复处理不变内容
3. **懒加载**: Tesseract模型在应用启动后异步加载
4. **内存管理**: 截图Buffer用完即释放，不持久化
5. **API节流**: Claude API调用合并（1秒内的多次变化合并为一次调用）

### 7.3 最低系统要求

- macOS 12.0+
- 8GB RAM（推荐16GB）
- Apple Silicon 或 Intel i5+
- 500MB 可用磁盘空间

---

## 8. 安全与隐私

### 8.1 隐私原则

- **纯本地存储**: 所有记忆数据存储在本地SQLite，不上云
- **截图不落盘**: 截图仅在内存中处理，不保存到磁盘
- **API数据最小化**: 发送给Claude API的仅是文本内容，不含截图
- **用户控制**: 用户可随时查看、删除、导出所有记忆数据

### 8.2 权限需求

| 权限 | 用途 | 必要性 |
|------|------|--------|
| 屏幕录制 | 截取屏幕内容 | 必须 |
| 辅助功能 | 获取激活窗口信息 | 必须 |
| 麦克风 | 语音输入 | 可选 |
| 网络 | Claude API / Edge TTS | 必须 |

---

## 9. 开发里程碑

| 阶段 | 内容 | 预估时间 |
|------|------|----------|
| **M1: 基础框架** | Electron + React + 基本UI | 1周 |
| **M2: 屏幕捕获+OCR** | 截图 + Tesseract + 基本事件处理 | 1周 |
| **M3: 记忆系统** | SQLite + 短期记忆 + 基本压缩 | 1周 |
| **M4: Claude集成** | API桥接 + 建议生成 + 性格路由 | 1周 |
| **M5: 悬浮UI** | 歌词式面板 + 悬浮球 + 科技感主题 | 1周 |
| **M6: 自我迭代** | 反馈系统 + 策略调优 | 1周 |
| **M7: 语音交互** | Web Speech + Edge TTS | 0.5周 |
| **M8: 打磨发布** | 性能优化 + Bug修复 + 打包 | 1周 |

**总计预估: ~7.5周**

---

## 10. 附录

### 10.1 性格系统提示词模板

```
你是 Nudge，一个智能桌面助手。

当前模式：{personality_name}

性格特征：
- 正式度：{formality}/10
- 幽默度：{humor}/10
- 详细度：{verbosity}/10

你的任务是根据用户的屏幕内容，提供有用的建议。
要求：
1. 简洁明了，不超过3句话
2. 符合当前性格特征
3. 如果有相关记忆，请引用
4. 以自然的方式表达，像一个真正的助手

当前屏幕内容：
{screen_content}

相关记忆：
{relevant_memories}

请生成建议：
```

### 10.2 重要性评分标准

| 分数 | 含义 | 示例 |
|------|------|------|
| 1-3 | 临时信息 | 浏览网页、无意义内容 |
| 4-5 | 一般信息 | 普通对话、日常浏览 |
| 6-7 | 重要信息 | 工作沟通、项目相关 |
| 8-9 | 关键信息 | 重要决策、关键人物交互 |
| 10 | 核心知识 | 你的核心项目、重要关系 |

### 10.3 预设测试场景

| 场景 | 描述 | 适用场景 |
|------|------|----------|
| 编码辅助 | 代码编写、调试、重构建议 | VS Code、Terminal |
| 学习场景 | 知识理解、总结、扩展阅读 | 浏览器、PDF阅读器 |
| 调试场景 | 错误分析、问题定位 | 调试器、日志 |
| 创意场景 | 头脑风暴、灵感激发 | 白板、设计工具 |
| OCR上下文 | 基于屏幕内容的建议 | 任何应用 |

---

*文档结束 - 统一设计文档 v3.0*