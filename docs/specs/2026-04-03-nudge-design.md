# Nudge — 主动式AI桌面助手 设计文档

> **版本**：v1.0  
> **日期**：2026-04-03  
> **状态**：设计阶段

---

## 1. 产品概述

**Nudge** 是一个高度主动的AI桌面助手，通过实时OCR识别屏幕内容，结合记忆系统和多性格配置，通过悬浮窗为用户提供上下文感知的智能建议。

### 核心理念

- **主动但不打扰**：透明歌词式左侧面板，建议自然浮现
- **越用越懂你**：实时记忆压缩 + 自我迭代，持续进化
- **一个助手，多重人格**：工作、朋友、学习、创意，智能切换

### 使用场景

| 场景 | 示例 |
|---|---|
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
│  │   Capture    │   │  PaddleOCR   │   │  去重 + 变化检测  │  │
│  │  5s/次(可配) │   │  可插拔架构   │   │  应用上下文标记   │  │
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
│  │  │  悬浮图标   │  │  歌词式面板     │  │  设置面板       │ ││
│  │  │  状态指示   │  │  透明左侧       │  │  性格/频率配置  │ ││
│  │  │  一键唤醒   │  │  卡片式建议     │  │  记忆管理       │ ││
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
|---|---|---|
| 桌面框架 | Electron 34+ | 跨平台，成熟生态 |
| 屏幕捕获 | macOS CGWindowList API via Electron | 精确获取激活窗口截图 |
| OCR引擎 | PaddleOCR（主）+ Tesseract.js（备） | 可插拔，本地推理，中英文 |
| 记忆存储 | better-sqlite3 | 纯本地，高性能，结构化查询 |
| AI推理 | Claude API（通过Claude Code桥接） | 建议生成、性格路由、记忆压缩 |
| 悬浮UI | Electron BrowserWindow（透明+置顶） | 歌词式左侧面板 |
| 语音输入 | Web Speech API | 浏览器原生，零资源开销 |
| 语音输出 | Edge TTS | 微软免费API，中英文自然 |
| 前端框架 | React + TailwindCSS | UI开发效率 |
| 状态管理 | Zustand | 轻量级状态管理 |

---

## 3. 模块详细设计

### 3.1 Screen Capture（屏幕捕获模块）

**职责**：定时截取当前激活窗口的截图，传递给OCR模块。

**核心设计**：

```
ScreenCapture
├── captureActiveWindow()    // 获取当前激活窗口截图
├── captureSpecifiedApps()   // 获取指定应用窗口截图（可选）
├── getActiveWindowInfo()    // 获取窗口信息（应用名、标题）
└── config
    ├── interval: 5000       // 捕获间隔（ms），默认5s
    ├── target: 'active'     // 'active' | 'specified'
    └── specifiedApps: []    // 指定应用列表
```

**实现要点**：
- 使用 Electron `desktopCapturer.getSources()` 获取屏幕源
- 通过 macOS API `CGWindowListCopyWindowInfo` 获取激活窗口信息
- 截图格式：PNG，分辨率与屏幕一致
- 每次截图后立即释放内存，不持久化截图文件
- 支持暂停/恢复捕获（用户全屏演示时）

**性能优化**：
- 仅截取激活窗口区域，非全屏
- 截图后立即转为 Buffer，不落盘
- 捕获间隔可配置（1s-60s），默认5s

---

### 3.2 OCR Pipeline（OCR识别流水线）

**职责**：将截图转化为结构化文本。

**可插拔架构**：

```
OCRProvider (interface)
├── name: string
├── initialize(): Promise<void>
├── recognize(image: Buffer): Promise<OCRResult>
└── destroy(): void

// 主引擎
PaddleOCRProvider implements OCRProvider
  - name: 'paddleocr'
  - 中英文识别精度高
  - 本地推理，模型大小 ~50MB

// 备引擎
TesseractProvider implements OCRProvider
  - name: 'tesseract'
  - 降级方案，当PaddleOCR失败时使用

// 未来扩展
CloudOCRProvider implements OCRProvider
  - 百度/腾讯云OCR API
  - 更高精度，依赖网络
```

**输出结构**：

```typescript
interface OCRResult {
  text: string;                    // 完整文本
  blocks: OCRBlock[];              // 分块文本（含位置信息）
  timestamp: number;               // 识别时间戳
  windowInfo: WindowInfo;          // 窗口信息
}

interface OCRBlock {
  text: string;
  confidence: number;              // 置信度 0-1
  bbox: { x: number; y: number; w: number; h: number };  // 位置
}
```

**引擎管理**：

```typescript
class OCRPipeline {
  private providers: Map<string, OCRProvider>;
  private activeProvider: OCRProvider;

  setProvider(name: string): void;      // 切换引擎
  registerProvider(provider: OCRProvider): void;  // 注册新引擎
  async recognize(image: Buffer): Promise<OCRResult> {
    try {
      return await this.activeProvider.recognize(image);
    } catch (error) {
      // 降级到备选引擎
      return await this.fallbackProvider.recognize(image);
    }
  }
}
```

---

### 3.3 Event Processor（事件处理器）

**职责**：对OCR结果进行去重、变化检测和语义提取。

**处理流水线**：

```
OCRResult
  │
  ├─▶ [1] 文本去重：与上次结果对比，相似度 > 90% 则跳过
  │
  ├─▶ [2] 变化检测：提取新增/修改的文本段
  │
  ├─▶ [3] 应用上下文：标记当前应用（Gmail、微信、VS Code...）
  │
  └─▶ [4] 事件生成：转化为结构化事件
```

**输出结构**：

```typescript
interface ScreenEvent {
  id: string;                      // 唯一ID
  timestamp: number;               // 时间戳
  appContext: AppContext;           // 应用上下文
  changedText: string;             // 变化的文本
  fullText: string;                // 完整文本（快照）
  eventType: EventType;            // 事件类型
}

interface AppContext {
  appName: string;                 // 应用名称
  windowTitle: string;             // 窗口标题
  category: AppCategory;           // 应用分类
}

enum AppCategory {
  EMAIL = 'email',                 // 邮件（Gmail、Outlook）
  CHAT = 'chat',                   // 聊天（微信、Slack、钉钉）
  BROWSER = 'browser',             // 浏览器
  CODE = 'code',                   // 代码编辑器
  DOCUMENT = 'document',           // 文档（Word、PDF）
  DESIGN = 'design',               // 设计工具
  OTHER = 'other',                 // 其他
}

enum EventType {
  TEXT_CHANGE = 'text_change',     // 文本变化
  WINDOW_SWITCH = 'window_switch', // 窗口切换
  NEW_CONTENT = 'new_content',     // 新内容出现
}
```

**去重算法**：
- 使用 Levenshtein 距离计算文本相似度
- 相似度 > 90%：视为无变化，跳过
- 相似度 50%-90%：部分变化，提取差异部分
- 相似度 < 50%：大幅变化，视为新内容

---

### 3.4 Memory Engine（记忆引擎）— 核心模块

**职责**：实时压缩屏幕事件为结构化记忆，分层存储，建立知识关联。

#### 3.4.1 实时压缩流水线

```
ScreenEvent
  │
  ├─▶ [1] 语义提取（Claude API）
  │     将原始文本转化为结构化语义事件
  │     例："你正在给张三写关于Q2预算的邮件"
  │
  ├─▶ [2] 事件聚合
  │     相同语义事件合并，附时间范围
  │     例：连续5分钟写同一封邮件 → 一条事件
  │
  ├─▶ [3] 重要性评分（Claude API）
  │     1-3分：临时信息，短期缓存
  │     4-6分：有价值，中期记忆
  │     7-10分：关键信息，长期记忆
  │
  ├─▶ [4] 关联检测
  │     新事件与已有记忆建立关联
  │     关联类型：涉及人物、涉及项目、涉及话题
  │
  └─▶ [5] 分层存储
        短期 → 中期 → 长期，逐级压缩
```

#### 3.4.2 存储结构

```sql
-- 短期记忆（原始事件，24h自动清理）
CREATE TABLE short_term_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,            -- 语义化内容
  raw_text TEXT,                    -- 原始OCR文本（可选）
  app_context TEXT,                 -- JSON: 应用上下文
  importance_score INTEGER,         -- 1-10
  entities TEXT,                    -- JSON: 提取的实体 [人名, 项目名...]
  compressed_to TEXT,               -- 压缩后的中期记忆ID
  created_at INTEGER
);

-- 中期记忆（周维度压缩）
CREATE TABLE mid_term_memories (
  id TEXT PRIMARY KEY,
  week_label TEXT NOT NULL,         -- "2026-W14"
  summary TEXT NOT NULL,            -- 周摘要
  key_events TEXT,                  -- JSON: 关键事件列表
  key_entities TEXT,                -- JSON: 关键实体
  importance_score INTEGER,
  source_events TEXT,               -- JSON: 来源短期事件ID列表
  compressed_to TEXT,               -- 压缩后的长期记忆ID
  created_at INTEGER
);

-- 长期记忆（结构化知识）
CREATE TABLE long_term_knowledge (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'person' | 'project' | 'topic'
  name TEXT NOT NULL,               -- 实体名称
  summary TEXT NOT NULL,            -- 结构化摘要
  detail TEXT,                      -- 详细信息
  related_memories TEXT,            -- JSON: 关联记忆ID列表
  interaction_count INTEGER DEFAULT 0,  -- 交互频次
  last_seen INTEGER,                -- 最后出现时间
  last_updated INTEGER
);

-- 关联图
CREATE TABLE memory_relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,            -- 源记忆ID
  to_id TEXT NOT NULL,              -- 目标记忆ID
  relation_type TEXT NOT NULL,      -- 'mentions' | 'related_to' | 'part_of'
  strength REAL DEFAULT 0.5,        -- 关联强度 0-1
  created_at INTEGER
);

-- 用户反馈（用于自我迭代）
CREATE TABLE user_feedback (
  id TEXT PRIMARY KEY,
  suggestion_id TEXT NOT NULL,      -- 建议ID
  feedback_type TEXT NOT NULL,      -- 'like' | 'dislike' | 'ignore'
  context TEXT,                     -- JSON: 反馈时的上下文
  created_at INTEGER
);
```

#### 3.4.3 压缩策略

**短期 → 中期（每日凌晨自动执行）**：

```
1. 查询过去24h的短期事件
2. 按语义聚类（Claude API）
3. 每个聚类生成一条周摘要
4. 标记已压缩的短期事件
5. 保留7天短期事件，超期自动清理
```

**中期 → 长期（每周自动执行）**：

```
1. 查询本周中期记忆
2. 识别反复出现的实体（人物、项目、话题）
3. 为每个实体生成结构化知识条目
4. 建立实体间的关联关系
5. 更新已有长期记忆的摘要和关联
```

#### 3.4.4 记忆检索

```typescript
class MemoryEngine {
  // 根据当前上下文检索相关记忆
  async searchRelevantMemories(context: {
    appContext: AppContext;
    currentText: string;
    entities: string[];
  }): Promise<MemorySearchResult[]> {
    // 1. 实体匹配（精确查找人物/项目）
    // 2. 语义搜索（Claude embedding 相似度）
    // 3. 时间加权（近期记忆权重更高）
    // 4. 关联传播（通过关联图扩展搜索）
  }

  // 获取特定实体的完整画像
  async getEntityProfile(entityName: string): Promise<EntityProfile> {
    // 汇总该实体的所有记忆、关联、交互历史
  }
}
```

---

### 3.5 Claude Code Bridge（AI大脑）

**职责**：性格路由、建议生成、自我迭代。

#### 3.5.1 性格路由

```typescript
interface Personality {
  id: string;
  name: string;                    // "工作模式" | "朋友模式" | ...
  systemPrompt: string;            // 性格系统提示词
  tone: ToneConfig;
  rules: PersonalityRule[];        // 路由规则
}

interface ToneConfig {
  formality: number;               // 正式度 0-1
  humor: number;                   // 幽默度 0-1
  verbosity: number;               // 详细度 0-1
  emoji: boolean;                  // 是否使用emoji
}

interface PersonalityRule {
  condition: RuleCondition;        // 触发条件
  personalityId: string;           // 对应性格
  priority: number;                // 优先级
}

// 路由逻辑
class PersonalityRouter {
  async route(event: ScreenEvent): Promise<Personality> {
    // 1. 检查用户配置的固定规则（按应用绑定）
    // 2. AI智能判断（基于应用+内容+历史）
    // 3. 返回最合适的性格
  }
}
```

**预设性格**：

| 性格 | 适用场景 | 特征 |
|---|---|---|
| 工作模式 | 邮件、Slack、文档 | 专业、简洁、正式 |
| 朋友模式 | 微信、社交应用 | 轻松、幽默、亲切 |
| 学习模式 | 浏览器、PDF、笔记 | 耐心、详细、引导式 |
| 创意模式 | 设计工具、白板 | 发散、灵感、开放 |
| 专注模式 | IDE、写作工具 | 极简、只在被问及时回应 |

#### 3.5.2 建议生成

```typescript
interface Suggestion {
  id: string;
  type: SuggestionType;
  content: string;                 // 建议文本
  priority: number;                // 优先级 1-5
  actionable: boolean;             // 是否可执行
  actions?: SuggestionAction[];    // 可执行操作
  relatedMemories?: string[];      // 关联记忆ID
  personality: string;             // 使用的性格
  timestamp: number;
}

enum SuggestionType {
  CONTENT_HELP = 'content_help',   // 内容建议（邮件措辞等）
  RISK_ALERT = 'risk_alert',       // 风险提醒
  TODO_RECORD = 'todo_record',     // 待办记录
  MEMORY_RECALL = 'memory_recall', // 记忆回溯
  TOPIC_SUGGEST = 'topic_suggest', // 话题建议
  DOCUMENT_SUMMARY = 'doc_summary', // 文档摘要
  EMOTION_ADJUST = 'emotion_adjust', // 情感调节
}
```

**建议生成流程**：

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

#### 3.5.3 自我迭代引擎

**反馈循环**：

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

**迭代维度**：

| 维度 | 迭代方式 | 指标 |
|---|---|---|
| 建议质量 | 调整触发阈值和内容风格 | 点赞率、忽略率 |
| 性格调优 | 微调 tone 参数和 system prompt | 各性格的用户满意度 |
| 记忆结构 | 重新评估重要性评分和关联强度 | 记忆检索准确率 |
| 时机把控 | 学习最佳建议时机 | 建议被查看的响应时间 |

---

### 3.6 UI Layer（界面层）

#### 3.6.1 悬浮图标

**位置**：屏幕右上角（可拖拽）

**状态设计**：

| 状态 | 视觉表现 | 含义 |
|---|---|---|
| 监听中 | 蓝色圆环，缓慢呼吸动画 | 正常工作中 |
| 思考中 | 蓝色圆环，脉冲动画 | 正在分析屏幕内容 |
| 有新建议 | 发光效果，轻微弹跳 | 有新的建议等待查看 |
| 静音模式 | 灰色圆环 | 暂停所有活动 |
| 错误 | 红色闪烁 | OCR或API出错 |

**交互**：
- 单击：展开/收起设置面板
- 右键：快捷菜单（暂停、静音、设置）
- 拖拽：调整位置

#### 3.6.2 歌词式左侧面板

**视觉风格**：科技感

- **背景**：深色半透明（`rgba(15, 15, 25, 0.85)`），毛玻璃效果（`backdrop-filter: blur(20px)`）
- **边框**：1px 渐变边框（蓝紫色渐变），微发光效果
- **字体**：SF Pro / Inter，白色文字，适当字重层次
- **卡片**：圆角卡片，悬浮时微发光，有微妙的入场动画

**布局**：

```
┌─────────────────────────────────┐
│  ◉ Nudge              [⚙] [—] │  ← 顶栏：状态 + 按钮
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📧 邮件建议              │   │  ← 建议卡片 1
│  │                         │   │
│  │ 张三是XX项目负责人...    │   │
│  │                         │   │
│  │ [查看记忆] [忽略] [👍]  │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ ⚠️ 风险提醒              │   │  ← 建议卡片 2
│  │                         │   │
│  │ 当前讨论的方案存在...    │   │
│  │                         │   │
│  │ [展开详情] [👍] [👎]   │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📝 待办记录              │   │  ← 建议卡片 3
│  │                         │   │
│  │ 检测到你提到要...       │   │
│  │                         │   │
│  │ [添加到待办] [忽略]     │   │
│  └─────────────────────────┘   │
│                                 │
├─────────────────────────────────┤
│  🎤 语音输入          3条建议  │  ← 底栏
└─────────────────────────────────┘
```

**动画效果**：
- 卡片入场：从左侧滑入 + 淡入（`transform: translateX(-20px) → 0, opacity: 0 → 1`）
- 卡片退场：淡出 + 向上位移
- 新建议：顶部卡片微弹跳（`scale: 1 → 1.02 → 1`）
- 悬浮交互：卡片微发光（`box-shadow` 蓝色光晕）

**科技感设计细节**：
- 渐变背景：`linear-gradient(135deg, rgba(20, 20, 40, 0.9), rgba(10, 15, 35, 0.95))`
- 边框发光：`border: 1px solid rgba(100, 120, 255, 0.3)`
- 卡片悬停：`box-shadow: 0 0 20px rgba(100, 120, 255, 0.2)`
- 状态指示器：霓虹蓝 `#6C8EFF` 为主色调
- 字体：`font-family: 'SF Pro Display', 'Inter', -apple-system, sans-serif`

#### 3.6.3 设置面板

**入口**：点击悬浮图标展开

**功能分区**：

```
┌─────────────────────────────────┐
│  Nudge 设置              [×]   │
├─────────────────────────────────┤
│                                 │
│  📡 捕获设置                     │
│  ├─ OCR频率    [5s ▼]          │
│  ├─ 目标窗口   [当前激活 ▼]    │
│  └─ 指定应用   [配置...]       │
│                                 │
│  🎭 性格配置                     │
│  ├─ 智能路由   [✓]             │
│  ├─ Gmail      [工作模式 ▼]    │
│  ├─ 微信       [朋友模式 ▼]    │
│  └─ 自定义...  [添加规则]      │
│                                 │
│  🧠 记忆管理                     │
│  ├─ 查看记忆   [浏览...]       │
│  ├─ 搜索记忆   [搜索...]       │
│  ├─ 导出记忆   [导出JSON]      │
│  └─ 清除记忆   [清除...]       │
│                                 │
│  🎤 语音设置                     │
│  ├─ 语音输入   [✓]             │
│  ├─ 语音输出   [✓]             │
│  ├─ 唤醒快捷键 [⌘⇧Space]      │
│  └─ TTS语音    [中文女声 ▼]    │
│                                 │
│  ⚙️ 高级设置                     │
│  ├─ OCR引擎    [PaddleOCR ▼]  │
│  ├─ Claude API [已配置 ✓]     │
│  ├─ 日志级别   [Info ▼]       │
│  └─ 自我迭代   [✓]            │
│                                 │
└─────────────────────────────────┘
```

---

### 3.7 语音交互

**语音输入**：
- 使用 Web Speech API（浏览器原生）
- 快捷键唤醒：`Cmd+Shift+Space`
- 实时语音转文字，显示在输入框
- 支持中英文自动检测

**语音输出**：
- 使用 Edge TTS（微软免费API）
- 支持多种语音（中文男声/女声、英文男声/女声）
- 可配置语速和音量
- 建议内容可选择性地语音播报

**唤醒方式**：
- 快捷键唤醒（默认 `Cmd+Shift+Space`）
- 可选：唤醒词（需额外资源，暂不实现）

---

## 4. 数据流

### 4.1 主数据流

```
[每5秒]
Screen Capture
  │ 获取激活窗口截图
  ▼
OCR Pipeline
  │ PaddleOCR识别 → 结构化文本
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

### 4.2 记忆压缩流

```
[每日凌晨 02:00]
Memory Engine (Compression Job)
  │ 查询过去24h短期事件
  ▼
Claude API
  │ 语义聚类 + 生成周摘要
  ▼
Memory Engine
  │ 写入中期记忆表
  │ 标记已压缩的短期事件
  ▼
[7天前的短期事件自动清理]

[每周日 03:00]
Memory Engine (Weekly Compression)
  │ 查询本周中期记忆
  ▼
Claude API
  │ 识别反复出现的实体
  │ 生成结构化知识条目
  ▼
Memory Engine
  │ 写入长期记忆表
  │ 建立/更新关联关系
```

---

## 5. 性能与资源

### 5.1 资源预估

| 组件 | CPU占用 | 内存占用 | 说明 |
|---|---|---|---|
| Electron主进程 | 低 | ~80MB | 框架基础开销 |
| Screen Capture | 极低 | ~20MB | 5秒一次截图 |
| PaddleOCR | 中（推理时） | ~300MB | 模型加载后常驻 |
| SQLite | 极低 | ~10MB | 轻量级 |
| React UI | 低 | ~50MB | 渲染层 |
| Claude API调用 | 无（云端） | ~5MB | 网络IO |
| **总计** | **中低** | **~465MB** | 对现代Mac轻松可承受 |

### 5.2 性能优化策略

1. **OCR降频**：当窗口无变化时，自动延长OCR间隔（5s → 15s → 30s）
2. **增量处理**：只处理变化的文本段，不重复处理不变内容
3. **懒加载**：PaddleOCR模型在应用启动后异步加载
4. **内存管理**：截图Buffer用完即释放，不持久化
5. **API节流**：Claude API调用合并（1秒内的多次变化合并为一次调用）

### 5.3 最低系统要求

- macOS 12.0+
- 8GB RAM（推荐16GB）
- Apple Silicon 或 Intel i5+
- 500MB 可用磁盘空间

---

## 6. 安全与隐私

### 6.1 隐私原则

- **纯本地存储**：所有记忆数据存储在本地SQLite，不上云
- **截图不落盘**：截图仅在内存中处理，不保存到磁盘
- **API数据最小化**：发送给Claude API的仅是文本内容，不含截图
- **用户控制**：用户可随时查看、删除、导出所有记忆数据

### 6.2 权限需求

| 权限 | 用途 | 必要性 |
|---|---|---|
| 屏幕录制 | 截取屏幕内容 | 必须 |
| 辅助功能 | 获取激活窗口信息 | 必须 |
| 麦克风 | 语音输入 | 可选 |
| 网络 | Claude API / Edge TTS | 必须 |

---

## 7. 项目结构

```
nudge/
├── electron/
│   ├── main.ts                    # Electron主进程
│   ├── preload.ts                 # 预加载脚本
│   └── ipc/                       # IPC通信
│       ├── screenCapture.ts
│       ├── ocr.ts
│       ├── memory.ts
│       └── claude.ts
├── src/                           # React前端
│   ├── App.tsx
│   ├── components/
│   │   ├── FloatingIcon.tsx       # 悬浮图标
│   │   ├── SuggestionPanel.tsx    # 歌词式面板
│   │   ├── SuggestionCard.tsx     # 建议卡片
│   │   ├── SettingsPanel.tsx      # 设置面板
│   │   └── VoiceInput.tsx         # 语音输入
│   ├── hooks/
│   │   ├── useScreenCapture.ts
│   │   ├── useOCR.ts
│   │   ├── useMemory.ts
│   │   └── useVoice.ts
│   ├── stores/
│   │   ├── suggestionStore.ts     # Zustand
│   │   ├── settingsStore.ts
│   │   └── memoryStore.ts
│   └── styles/
│       └── tech-theme.css         # 科技感主题
├── core/                          # 核心逻辑（Node.js）
│   ├── ocr/
│   │   ├── OCRPipeline.ts
│   │   ├── providers/
│   │   │   ├── PaddleOCRProvider.ts
│   │   │   └── TesseractProvider.ts
│   │   └── types.ts
│   ├── event/
│   │   ├── EventProcessor.ts
│   │   ├── deduplicator.ts
│   │   └── types.ts
│   ├── memory/
│   │   ├── MemoryEngine.ts
│   │   ├── compressor.ts
│   │   ├── searcher.ts
│   │   ├── schema.sql
│   │   └── types.ts
│   ├── claude/
│   │   ├── ClaudeBridge.ts
│   │   ├── PersonalityRouter.ts
│   │   ├── SuggestionGenerator.ts
│   │   ├── SelfIterator.ts
│   │   └── personalities/
│   │       ├── work.ts
│   │       ├── friend.ts
│   │       ├── learning.ts
│   │       ├── creative.ts
│   │       └── focus.ts
│   └── voice/
│       ├── SpeechInput.ts
│       └── EdgeTTS.ts
├── package.json
├── tsconfig.json
├── electron-builder.yml
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-03-nudge-design.md
```

---

## 8. 开发里程碑

| 阶段 | 内容 | 预估时间 |
|---|---|---|
| **M1: 基础框架** | Electron + React + 基本UI | 1周 |
| **M2: 屏幕捕获+OCR** | 截图 + PaddleOCR + 基本事件处理 | 1周 |
| **M3: 记忆系统** | SQLite + 短期记忆 + 基本压缩 | 1.5周 |
| **M4: Claude集成** | API桥接 + 建议生成 + 性格路由 | 1周 |
| **M5: 悬浮UI** | 歌词式面板 + 悬浮图标 + 科技感主题 | 1周 |
| **M6: 自我迭代** | 反馈系统 + 策略调优 | 1周 |
| **M7: 语音交互** | Web Speech + Edge TTS | 0.5周 |
| **M8: 打磨发布** | 性能优化 + Bug修复 + 打包 | 1周 |

**总计预估：~8周**

---

## 9. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| PaddleOCR精度不足 | 建议质量下降 | 可插拔设计，切换到云OCR |
| Claude API延迟 | 建议响应慢 | 异步处理，不阻塞UI |
| 频繁OCR导致性能问题 | 电脑卡顿 | 自适应降频机制 |
| 记忆膨胀 | 存储空间占用 | 自动压缩 + 清理策略 |
| 隐私敏感内容被发送到API | 隐私泄露 | 本地预处理，脱敏后发送 |

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
- 使用emoji：{emoji}

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
|---|---|---|
| 1-3 | 临时信息 | 浏览网页、无意义内容 |
| 4-5 | 一般信息 | 普通对话、日常浏览 |
| 6-7 | 重要信息 | 工作沟通、项目相关 |
| 8-9 | 关键信息 | 重要决策、关键人物交互 |
| 10 | 核心知识 | 你的核心项目、重要关系 |

---

*文档结束*
