# Nudge 主动式 AI 桌面助手 - 完整设计

> 日期：2026-04-11
> 版本：v1.0
> 状态：设计阶段

---

## 1. 产品愿景

**Nudge** 是一个具有**强主动性**的 AI 桌面助手，核心特点：

- 🎯 **主动感知** - 不打断用户，但时刻观察屏幕内容
- 🧠 **理解意图** - 通过 OCR + LLM 理解用户正在做什么
- 🎭 **多性格** - 不同场景切换不同"灵魂"（Soul）
- ⚡ **自动执行** - 检测到可执行的 Action 时主动提议并执行
- 📈 **自我进化** - 越用越聪明，根据反馈迭代

---

## 2. 核心数据流

```
┌─────────────────────────┐
│    定时截屏 (可配置间隔)  │  ◀── 默认 5 秒，可配置
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│     OCR 识别内容          │  ◀── tesseract.js
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│     App 检测             │  ◀── desktopCapturer 获取窗口信息
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│   场景判断 (LLM)         │  ◀── 工作 / 生活 / 学习
│   + 加载 Memory 上下文   │
│   + 切换 Soul           │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│   实体关系理解 (LLM)     │  ◀── 谁？在聊什么？上下文？
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│   生成建议 + Action (LLM)│  ◀── LLM 自由判断应该做什么
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│   展示 + 执行 Action    │  ◀── 悬浮球提醒，用户确认后执行
└─────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 截屏与 OCR 模块

**功能**：定时截取屏幕内容，提取文字

**现有实现**：
- `electron/ocr.ts` - tesseract.js OCR
- `electron/main.ts` - capture:get-frame IPC

**扩展**：
- 可配置截屏间隔（1s/3s/5s/10s/30s）
- 可配置截屏质量（低分辨率预览 / 高分辨率分析）

### 3.2 App 检测模块

**功能**：检测当前活跃的窗口和应用

**实现**：
```typescript
interface WindowInfo {
  appName: string      // "WeChat", "Mail", "VS Code"
  windowTitle: string  // 窗口标题
  bundleId: string     // macOS bundle identifier
}
```

**场景映射**：
| App 类型 | 示例 App | 默认 Soul |
|---------|---------|----------|
| 通讯 | WeChat, DingTalk, Slack, Mail | 根据内容判断 |
| 浏览器 | Chrome, Safari, Edge | 根据内容判断 |
| 文档 | Notes, Word, Notion | 学习模式 |
| 代码 | VS Code, Terminal | 开发模式 |
| 其他 | - | 默认模式 |

### 3.3 场景判断 + Soul 切换模块

**功能**：判断当前场景，加载上下文，切换响应风格

**Soul 定义**：
```typescript
interface Soul {
  name: string           // "工作助手", "生活伙伴", "学习导师", "开发搭档"
  greeting: string      // 打招呼风格
  responseStyle: string  // 响应风格描述
  examplePhrases: string[]  // 典型话术示例
}
```

**预设 Soul**：
| Soul | 场景 | 响应风格 |
|------|------|---------|
| 工作模式 | 邮件、钉钉、Slack、文档编辑 | 专业、简洁、目标导向 |
| 朋友模式 | 微信生活聊天、朋友圈 | 轻松、幽默、有趣 |
| 学习模式 | 浏览器看文章、阅读 App | 好奇、探索、归纳总结 |
| 开发模式 | VS Code、Terminal | 理性、高效、技术导向 |

**LLM Prompt 示例**：
```
你是一个场景判断专家。根据以下信息判断用户当前场景：

当前活跃窗口：{appName} - {windowTitle}
屏幕 OCR 内容：{ocrText}
最近 Memory：{recentMemories}

请返回 JSON 格式：
{
  "scene": "工作/生活/学习/开发/其他",
  "confidence": 0.95,
  "reason": "判断理由",
  "suggestedSoul": "工作助手/生活伙伴/学习导师/开发搭档/默认",
  "context": "当前对话的上下文摘要"
}
```

### 3.4 实体关系理解模块

**功能**：理解对话中的实体和关系

**LLM Prompt**：
```
分析以下对话内容，提取实体和关系：

对话内容：{ocrText}
场景：{scene}

返回 JSON：
{
  "entities": [
    {"type": "person", "name": "张三", "role": "同事/朋友/客户"}
  ],
  "relationships": [
    {"type": "工作协作", "participants": ["张三", "我"], "description": "一起做项目"}
  ],
  "topics": ["项目进度", "会议安排"],
  "intent": "询问/确认/求助/闲聊",
  "keyInfo": "对方问明天要不要一起吃饭"
}
```

### 3.5 建议 + Action 生成模块（核心）

**功能**：LLM 根据所有上下文生成建议和可执行 Action

**这是最核心的模块，完全由 LLM 判断**：

```
你是一个主动式 AI 助手。根据以下信息生成建议和可执行 Action：

【场景信息】
- 场景：{scene}
- Soul：{currentSoul}
- 时间：{timestamp}

【屏幕内容】
- 应用：{appName}
- OCR文本：{ocrText}

【上下文】
- 实体关系：{entities}
- 对话历史：{recentConversations}
- 用户记忆：{userMemories}

请返回 JSON 格式的建议：
{
  "suggestion": "给用户的建议内容（简洁）",
  "suggestionDetail": "建议的详细解释",
  "confidence": 0.9,
  
  "action": {
    "type": "LLM 自由判断 action 类型",
    "description": "action 描述",
    "params": {
      // LLM 认为需要的参数
    },
    "executeAfterConfirm": true/false
  },
  
  "replyContent": "如果需要回复，生成的具体回复内容（用户可直接复制）",
  "reminderContent": "如果需要提醒，提醒内容"
}
```

**Action 示例（LLM 自由判断）**：
```json
{
  "action": {
    "type": "create_alarm",
    "description": "订明天中午12点吃饭闹钟",
    "params": {
      "time": "明天 12:00",
      "message": "和某人吃饭"
    }
  }
}
```

```json
{
  "action": {
    "type": "copy_to_clipboard",
    "description": "复制生成的回复内容",
    "params": {
      "content": "好的，明天见！的具体内容"
    }
  }
}
```

```json
{
  "action": {
    "type": "add_todo",
    "description": "添加到待办事项",
    "params": {
      "task": "完成项目报告",
      "due": "明天"
    }
  }
}
```

```json
{
  "action": {
    "type": "save_memory",
    "description": "记录重要信息到记忆",
    "params": {
      "content": "张三的微信号是..."
    }
  }
}
```

### 3.6 展示与执行模块

**功能**：展示建议到悬浮球，点击后展示详情，执行 Action

**UI 流程**：
1. 检测到建议 → 悬浮球变色 + 动画提示
2. 用户点击悬浮球 → 打开建议面板
3. 展示：建议内容 + 可复制的回复 + 可执行的 Action
4. 用户点击 Action → 确认 → 执行

**执行机制**：
```typescript
interface Action {
  type: string           // LLM 定义
  description: string    // 人类可读描述
  params: object         // 执行参数
  executeAfterConfirm: boolean  // 是否需要确认
}

// 执行器注册表
const actionExecutors: Record<string, (params: object) => Promise<void>> = {
  // 内置执行器
  create_alarm: async (params) => { /* 调用系统闹钟 */ },
  copy_to_clipboard: async (params) => { /* 复制到剪贴板 */ },
  add_todo: async (params) => { /* 添加到待办 */ },
  save_memory: async (params) => { /* 保存到 Memory */ },
  // LLM 可以生成新的 action type，但需要用户扩展执行器
}
```

---

## 4. Memory 上下文

**功能**：存储和检索用户记忆，为 LLM 提供上下文

**现有实现**：Markdown 文件存储

**扩展**：
```typescript
interface MemoryEntry {
  id: number
  content: string
  timestamp: number
  type: 'context' | 'summary' | 'action' | 'preference'
  importance: number      // 1-5，影响上下文选择
  tags: string[]         // 用于快速检索
  relatedEntities: string[]  // 关联的实体
}

// 检索时加载相关 Memory
async function getRelevantMemories(ocrText: string, limit: number): Promise<MemoryEntry[]>
```

---

## 5. 自我进化

**功能**：根据用户反馈迭代改进

**反馈机制**：
```typescript
interface Feedback {
  suggestionId: string
  action: 'accepted' | 'rejected' | 'modified' | 'ignored'
  modifiedContent?: string  // 如果用户修改了
  timestamp: number
}

// LLM 分析反馈，改进建议
async function analyzeFeedback(feedback: Feedback[]): Promise<{
  improvements: string[],
  newPatterns: string[],
  adjustedSoulBehavior: Record<string, string>
}>
```

---

## 6. 技术架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Screen    │  │   OCR       │  │  Memory    │  │  Action    │  │
│  │  Capture   │  │  (tesseract)│  │  System    │  │  Executor  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│         │               │               │               │            │
│         └───────────────┴───────────────┴───────────────┘            │
│                                   │                                  │
│                           ┌───────┴───────┐                         │
│                           │   LLM Bridge  │  ← MCP 调用 Claude     │
│                           └───────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                              IPC (contextBridge)
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Scene     │  │  Entity    │  │  Suggestion│  │   UI       │  │
│  │  Detector  │  │  Analyzer   │  │  Generator │  │  (React)   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. 文件结构

```
nudge/
├── electron/
│   ├── main.ts              # 主进程入口
│   ├── preload.ts          # IPC 桥接
│   ├── ocr.ts              # OCR 模块
│   ├── memory.ts           # Memory 存储
│   ├── mcp-bridge.ts       # Claude MCP 调用
│   ├── tts.ts              # 语音输出
│   └── action-executor.ts  # Action 执行器 ⭐ 新增
│
├── src/
│   ├── components/          # React 组件
│   ├── hooks/
│   │   ├── useSceneDetector.ts     # 场景检测 ⭐ 新增
│   │   ├── useEntityAnalyzer.ts    # 实体分析 ⭐ 新增
│   │   ├── useSuggestionEngine.ts  # 建议生成 ⭐ 重写
│   │   └── useActionExecutor.ts    # Action 执行 ⭐ 新增
│   ├── stores/
│   │   ├── suggestionStore.ts
│   │   ├── settingsStore.ts
│   │   └── runtimeStore.ts
│   ├── lib/
│   │   └── ocrPipeline.ts
│   └── types/
│       └── index.ts        # 类型定义
│
└── docs/
    └── specs/
        └── 2026-04-11-nudge-complete-design.md  # 本文档
```

---

## 8. 关键设计决策

### 8.1 Action 的灵活性
- **不预定义 Action 类型**，完全由 LLM 判断
- 内置基础执行器（闹钟、剪贴板、待办、记忆）
- 用户可以扩展执行器支持新类型

### 8.2 主动推送模式
- 检测到有效建议时，**立即**在悬浮球上展示
- 用户点击查看详情，点击 Action 执行
- 不打扰但及时

### 8.3 Soul 切换逻辑
- 先根据 App 判断基础场景
- 再用 LLM 分析 OCR 内容精调
- 结合用户偏好和历史 Memory

### 8.4 上下文记忆
- 每次分析加载相关 Memory
- 用户反馈存入 Memory
- LLM 建议存入 Memory

---

## 9. 待实现功能清单

| # | 功能 | 描述 | 依赖 |
|---|------|------|------|
| 1 | App 检测 | 获取活跃窗口信息 | existing |
| 2 | 场景判断 LLM | 判断场景 + 切换 Soul + 加载 Memory | new |
| 3 | 实体理解 LLM | 提取实体、关系、意图 | new |
| 4 | 建议生成 LLM | 生成建议 + Action | new |
| 5 | Action 执行器 | 执行 LLM 生成的 Action | new |
| 6 | UI 增强 | 展示建议 + Action 按钮 | new |
| 7 | 反馈机制 | 收集用户反馈 | new |
| 8 | 自我进化 | 根据反馈改进 | new |

---

## 10. 下一步

设计文档已就绪，请确认后我将：
1. 创建详细的实现计划
2. 按步骤实现各个模块

**有什么需要调整或补充的吗？**