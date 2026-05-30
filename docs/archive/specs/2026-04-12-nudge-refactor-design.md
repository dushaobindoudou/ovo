# Nudge 重构设计文档

> **版本**: v2.0  
> **日期**: 2026-04-12  
> **状态**: 重构设计

---

## 1. 核心理念重申

Nudge 是一个**旁路式、主动式、自进化**的 AI 桌面助手。

### 三大核心能力

1. **自动进化的记忆系统** - 越用越懂你
   - 实时记录屏幕内容和用户行为
   - 自动压缩和结构化知识
   - 根据反馈持续优化

2. **智能屏幕理解** - 看懂你在做什么
   - OCR 识别活动窗口内容
   - 理解应用上下文（邮件、聊天、文档、代码）
   - 检测内容变化和用户意图

3. **主动智能协助** - 自动帮你干活
   - 通过 Claude MCP/Skill 执行任务
   - 聊天时给出回复建议
   - 工作时记录 TODO 和关键信息
   - 学习时自动整理知识
   - 根据场景提供相关资料

### 设计原则

- **旁路不打扰**: 不阻塞用户主流程，建议在侧边自然浮现
- **透明可控**: 用户随时看到系统状态，可配置和切换
- **多重人格**: 工作正式、聊天随意、谈判警觉，智能切换
- **隐私优先**: 数据本地存储，用户完全控制

---

## 2. 简化架构

### 2.1 核心数据流

```
[每 N 秒]
屏幕捕获 → OCR 识别 → 内容变化检测
                              ↓
                         记忆引擎 ← 用户反馈
                              ↓
                    Claude MCP/Skill 调用
                              ↓
                         建议生成
                              ↓
                         UI 展示
```

### 2.2 窗口架构（简化）

只保留 3 个核心窗口：

1. **Console 控制台** (主窗口)
   - 启动时默认打开
   - 显示系统状态、事件日志、设置
   - 包含：状态面板、设置面板、记忆浏览、关于

2. **Floating Icon 悬浮球** (可选)
   - 右上角状态指示器
   - 点击打开/关闭建议面板
   - 显示工作状态（监听/思考/有建议/错误）

3. **Suggestion Panel 建议面板** (可选)
   - 左侧透明面板
   - 显示 AI 建议卡片
   - 用户可点赞/踩/忽略

**移除**: Debug 窗口（合并到 Console）、独立 Settings 窗口（合并到 Console）

### 2.3 技术栈（精简）

| 层级 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Electron 34+ | 跨平台 |
| OCR | Tesseract.js | 本地推理，中英文 |
| 记忆存储 | better-sqlite3 | 本地 SQLite |
| AI | Claude CLI (MCP) | 通过 `claude` 命令调用 |
| UI | React + Tailwind | 简洁高效 |
| 状态 | Zustand | 轻量级 |
| 语音输出 | Edge TTS | 免费 API |

**移除**: Web Speech API（语音输入暂不实现）、PaddleOCR（只用 Tesseract）

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
  error?: string
}

// 核心函数
async function captureAndRecognize(): Promise<OCRResult>
```

**配置**:
- 捕获间隔: 5-60 秒可配置
- 目标窗口: 当前激活窗口（未来可扩展指定应用）

### 3.2 记忆引擎

**职责**: 存储和检索用户行为记忆

```typescript
// electron/memory.ts
interface MemoryEvent {
  id: string
  timestamp: number
  appName: string
  windowTitle: string
  content: string              // OCR 文本
  summary?: string             // AI 生成的摘要
  importance: number           // 1-10
  tags: string[]               // 自动提取的标签
}

class MemoryEngine {
  // 添加记忆
  async addEvent(event: MemoryEvent): Promise<void>
  
  // 搜索相关记忆
  async searchRelevant(context: string, limit: number): Promise<MemoryEvent[]>
  
  // 获取统计
  async getStats(): Promise<{ total: number; byApp: Record<string, number> }>
}
```

**存储结构**:

```sql
-- 简化为单表
CREATE TABLE memory_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  app_name TEXT NOT NULL,
  window_title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  importance INTEGER DEFAULT 5,
  tags TEXT,                    -- JSON array
  created_at INTEGER
);

CREATE INDEX idx_timestamp ON memory_events(timestamp);
CREATE INDEX idx_app_name ON memory_events(app_name);
```

**压缩策略**（未来实现）:
- 每日凌晨压缩 24h 前的事件
- 低重要性事件自动删除
- 高重要性事件生成摘要

### 3.3 Claude 桥接

**职责**: 调用 Claude CLI 生成建议和执行任务

```typescript
// electron/mcp-bridge.ts
interface ClaudeRequest {
  prompt: string
  context?: string              // 相关记忆
  personality?: string          // 人格模式
}

interface ClaudeResponse {
  ok: boolean
  content?: string
  error?: string
}

// 核心函数
async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse>

// 检查 Claude CLI 可用性
function checkClaudeCLI(): boolean
```

**人格系统**:

```typescript
// 预设人格
const PERSONALITIES = {
  work: {
    name: '工作模式',
    prompt: '你是专业的工作助手，简洁、正式、高效',
  },
  casual: {
    name: '随意模式',
    prompt: '你是轻松的朋友，幽默、亲切、随意',
  },
  learning: {
    name: '学习模式',
    prompt: '你是耐心的导师，详细、引导、鼓励',
  },
  negotiation: {
    name: '谈判模式',
    prompt: '你是敏锐的顾问，警觉、分析、提醒风险',
  },
}
```

### 3.4 建议引擎

**职责**: 整合 OCR、记忆、Claude，生成建议

```typescript
// src/hooks/useSuggestionEngine.ts
interface Suggestion {
  id: string
  type: 'help' | 'alert' | 'todo' | 'recall' | 'summary'
  content: string
  priority: 1 | 2 | 3 | 4 | 5
  timestamp: number
}

// 核心流程
async function generateSuggestion(ocrResult: OCRResult): Promise<Suggestion> {
  // 1. 检索相关记忆
  const memories = await searchRelevant(ocrResult.text)
  
  // 2. 构建 Claude 提示
  const prompt = buildPrompt(ocrResult, memories, currentPersonality)
  
  // 3. 调用 Claude
  const response = await callClaude({ prompt, context: memories })
  
  // 4. 解析建议
  return parseSuggestion(response)
}
```

---

## 4. UI 设计（简化）

### 4.1 Console 控制台（主窗口）

**布局**:

```
┌─────────────────────────────────────────┐
│  Nudge 控制台                    [—][×] │
├─────────────────────────────────────────┤
│  [状态] [设置] [记忆] [关于]            │  ← Tab 导航
├─────────────────────────────────────────┤
│                                         │
│  [当前 Tab 内容区域]                     │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Tab 1: 状态面板**
- 当前状态: 监听中/思考中/静音
- 实时事件日志（最近 50 条）
- 捕获统计: 成功/失败次数
- 快速操作: 暂停/恢复、打开建议面板

**Tab 2: 设置面板**
- OCR 间隔配置
- 人格模式选择
- Claude CLI 状态检查
- 语音输出开关

**Tab 3: 记忆浏览**
- 记忆事件列表
- 按应用筛选
- 搜索功能
- 清除记忆

**Tab 4: 关于**
- 版本信息
- 使用说明
- 隐私声明

### 4.2 Floating Icon 悬浮球

**状态指示**:
- 蓝色呼吸: 监听中
- 蓝色脉冲: 思考中
- 发光弹跳: 有新建议
- 灰色: 静音
- 红色闪烁: 错误

**交互**:
- 单击: 切换建议面板显示/隐藏
- 右键: 快捷菜单（暂停、打开控制台、退出）

### 4.3 Suggestion Panel 建议面板

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
│  │ 📝 TODO 记录          │ │
│  │                       │ │
│  │ 检测到待办事项...     │ │
│  │                       │ │
│  │ [添加] [忽略]         │ │
│  └───────────────────────┘ │
│                             │
└─────────────────────────────┘
```

---

## 5. 实现优先级

### Phase 1: 核心功能（1 周）
- [x] Electron 基础框架
- [x] Console 控制台窗口
- [x] OCR 基础实现
- [ ] 记忆引擎（SQLite）
- [ ] Claude 桥接（基础调用）
- [ ] 建议生成（简单流程）

### Phase 2: UI 完善（1 周）
- [ ] Console 四个 Tab 完整实现
- [ ] Floating Icon 状态指示
- [ ] Suggestion Panel 卡片交互
- [ ] 人格模式切换

### Phase 3: 智能化（1 周）
- [ ] 记忆检索优化
- [ ] 建议质量提升
- [ ] 用户反馈学习
- [ ] 自动人格切换

### Phase 4: 打磨（1 周）
- [ ] 性能优化
- [ ] 错误处理
- [ ] 用户文档
- [ ] 打包发布

---

## 6. 当前问题诊断

### 问题 1: 代码膨胀失控
- **原因**: 功能过度设计，很多未完成的模块
- **解决**: 移除未使用的代码，聚焦核心流程

### 问题 2: 窗口混乱
- **原因**: 窗口过多（5 个），职责不清
- **解决**: 合并为 3 个窗口，明确职责

### 问题 3: 文档与代码不一致
- **原因**: 设计文档过于理想化，实现未跟上
- **解决**: 重写设计文档，匹配当前实现能力

---

## 7. 重构计划

### Step 1: 清理代码
- 移除未使用的组件和 hooks
- 删除 Debug 窗口相关代码
- 合并 Settings 窗口到 Console

### Step 2: 完善记忆引擎
- 实现 SQLite 存储
- 添加基础检索功能
- 集成到建议生成流程

### Step 3: 优化 Claude 集成
- 完善人格系统
- 优化提示词构建
- 添加错误处理和降级

### Step 4: UI 统一
- Console 实现完整 Tab 导航
- 统一设计风格
- 优化交互体验

---

## 8. 成功标准

一个可用的 Nudge 应该能够：

1. ✅ 自动监控屏幕内容（OCR）
2. ✅ 记录用户行为到本地数据库
3. ✅ 调用 Claude 生成智能建议
4. ✅ 在侧边面板展示建议
5. ✅ 用户可以反馈（点赞/踩）
6. ✅ 根据场景切换人格模式
7. ✅ 控制台显示系统状态
8. ✅ 用户可以浏览和管理记忆

---

*文档结束*
