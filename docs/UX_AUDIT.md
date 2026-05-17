# Ovo UX/UI 审计（持续演进文档）

> 这是一份"活的"文档。每次 `/loop` 产品审计轮跑完，新发现会追加到这里。
> 配合 `docs/PRODUCT_PHILOSOPHY.md` 阅读——哲学定方向，审计定具体动作。

**最新更新**：第 4 轮（2026-05-16）· 累计 65 个具体问题（P0×13 / P1×31 / P2×15 / P3×6）· 6 个系统性反模式 · 含 KPI 度量框架

---

## 文档说明

### 如何使用
- **PM/Designer**：把"当前活跃问题"作为 backlog 输入
- **开发**：每个问题都有 `file:line` 引用，可直接定位
- **修复后**：把问题从"当前活跃"移到"已修复"，保留记录

### 评分体系

| 等级 | 含义 | 处理时机 |
|---|---|---|
| **P0** | 阻塞核心体验，新用户会因此流失 | 必须改才能称"世界级" |
| **P1** | 高频摩擦，让产品看起来"业余" | 1-2 个版本内修 |
| **P2** | 细节缺失，打磨层 | 持续优化中处理 |
| **P3** | 锦上添花，未来探索 | 排期外的灵感 |

### 哲学映射

每个问题标注它影响哪根产品轴（参考 `PRODUCT_PHILOSOPHY.md` 第三章）：

- 🎯 **命中率** — 让 Ovo 在对的时候出手
- 💎 **命中价值** — 让 Ovo 出手时给的东西够好
- 👁 **命中感知** — 让用户感知到 Ovo 救了自己

---

## 当前活跃问题清单

### 🔴 P0 — 阻塞世界级体验（13 项）

#### P0.1 首屏文案违背产品哲学
- **位置**：`src/components/Onboarding/BootstrapWizard.tsx:94`
- **现状**："5 分钟告诉 ovo 关于你"——制造"AI 会越用越懂你"的预期
- **问题**：哲学已明确入场承诺应为"看着 Ovo 思考。它每一步都会告诉你为什么。"当前文案与哲学相悖
- **轴**：👁 命中感知
- **改法**：替换为"克制承诺"——"Ovo 默认只看不做。我会主动告诉你我在想什么，再问你是否要替你做。"

#### P0.2 没有"AI 行为流"主时间线
- **位置**：当前 `PipelineDetail` 藏在 `ProcessPanel` 二级页面
- **现状**：用户无法直观看到"Ovo 此刻在想什么、看了什么、为什么这么建议"
- **问题**：透明是 Ovo 的核心差异化，但 UI 把它当成了调试视图
- **轴**：👁 命中感知（最重要的轴）
- **改法**：把 PipelineDetail 升级为主屏左侧常驻时间线（参考 Linear activity feed）

#### P0.3 信任分级 UI 完全缺失
- **位置**：`electron/action-executor.ts:118-120` 写死 3 种自动执行
- **现状**：用户无法调整"哪些事 Ovo 可以替我做"
- **轴**：🎯 命中率 + 💎 命中价值
- **改法**：SettingsPanel 新增"信任分级"模块，每个 action 类型独立 5 级滑块

#### P0.4 "玻璃管家"实时浮窗未实现
- **位置**：`src/components/SuggestionPanel/SuggestionToastWindow.tsx` 存在但缺"看见 → 想做 → 为什么 → 教育按钮"流程
- **现状**：主动行为时用户看到的是"结果"，不是"过程 + 理由 + 撤销机会"
- **轴**：👁 命中感知
- **改法**：浮窗显示「看见什么 → 想做什么 → 为什么 → [让它做] [不要做] [永远不要这么做]」

#### P0.5 PipelineDetail 暴露开发术语（新增 - 第 2 轮）
- **位置**：`src/components/Console/PipelineDetail.tsx:11-18` STAGE_ORDER 定义
- **现状**：6 个阶段直译"Agent 调用""Schema 校验"等工程术语，普通用户看了不知所云
- **问题**：哲学说"用人话解释 Ovo 的推理"，但 UI 是程序员视角
- **轴**：👁 命中感知
- **改法**：替换为用户语言 — "聚合→看到 / Agent 调用→思考 / Schema 校验→检查 / 建议生成→建议 / Action 执行→执行 / 图谱更新→记住"

#### P0.6 KnowledgeGraph 无图例 + 无叙事（新增 - 第 2 轮）
- **位置**：`src/components/Console/KnowledgeGraphCanvas.tsx:41-48` 节点 7 种颜色无图例 / `MemoryPanel.tsx:437-519` 列表模式 3 列网格
- **现状**：力导引图很酷但用户看 15 分钟也不知道"节点关系强度"代表什么；"我的画像"卡片信息无叙事
- **问题**：哲学说"展示 AI 关于你形成的世界模型"，当前更像学术可视化工具
- **轴**：💎 命中价值
- **改法**：① 图谱顶部加图例（节点类型 + 边粗度含义）；② 列表改纵向"故事卡"模式 — "你最关心的三个话题：TypeScript（提及 23 次）..."；③ 节点点击后顶部加"Ovo 认为你..."主观语句

#### P0.7 LiveLogStream 是给开发者看的（新增 - 第 2 轮）
- **位置**：`src/components/Console/LiveLogStream.tsx:1-140`
- **现状**：日志流显示 `[ovo-core]` `entity insert failed: UNIQUE constraint` 这类系统消息，对用户毫无价值
- **问题**：工程视图占据用户视图，污染产品感
- **轴**：💎 命中价值
- **改法**：LiveLogStream 隐藏到 Settings → 高级；主面板改为"当前活动"用户语言 — "🔍 正在分析 Chrome 内容..."

#### P0.8 首次启动多模态弹窗轰炸（新增 - 第 3 轮）
- **位置**：`PermissionGate.tsx:107-147`（顶部条）+ `PermissionGate.tsx:149-197`（教学弹窗）+ `BootstrapWizard.tsx:87`（4 步问卷）
- **现状**：未授权权限时，用户可能**同时**看到三层 UI — 顶部警告条 + 中央教学弹窗 + 4 步问卷模态。即使按顺序也是连续轰炸
- **问题**：首次体验是世界级产品和业余产品的分水岭，连续模态会让用户在 60 秒内放弃
- **轴**：👁 命中感知
- **改法**：定义"启动状态机" — 阶段 1 仅显示权限教学（一个对话框）→ 用户授权 → 阶段 2 软引导（右下角卡片，非模态）→ 用户点击才进入 BootstrapWizard

#### P0.9 屏幕权限授予后强制重启 = 流失高峰（新增 - 第 3 轮）
- **位置**：`PermissionGate.tsx:171` "首次授权后可能需要**退出并重新启动 ovo**才能生效"
- **现状**：用户经历 [启动 → 弹窗 → 系统设置 → 授权 → 回到 Ovo → 被告知要重启] 才能开始用，路径太长
- **问题**：每一次"用户被迫离开应用"都是流失高峰
- **轴**：👁 命中感知
- **改法**：调研 Electron 是否能在权限授予后**热重载**捕获引擎（不重启应用）；如不能，重启过程要用 splash + 进度条 + "正在为你准备 Ovo" 的安抚文案，重启后自动回到上次位置

#### P0.10 信任分级 UI 在 SettingsPanel 完全缺失（新增 - 第 3 轮，扩展 P0.3）
- **位置**：`src/components/Console/SettingsPanel.tsx:14-326` 全文搜索无"trust" / "授权级别" / "auto-execute" 配置
- **现状**：用户唯一能调的是 `toastVerbosity` 三选一（静默/仅预警/全部）—— 粒度极粗
- **问题**：哲学说每个 action 要 5 级滑块独立调档，UI 零兑现
- **轴**：🎯 命中率 + 💎 命中价值
- **改法**：在 SettingsPanel 隐私之后新增"信任与授权"Card，列出所有 9 种 action 类型，每个独立 5 级滑块；默认 Lv.1（草拟），用户点击升级

#### P0.11 三个隐私核心功能 UI 完全缺失（新增 - 第 3 轮）
- **位置**：`src/components/Console/SettingsPanel.tsx` PrivacyView (line 409-540)
- **现状**：仅有"暂停 / 黑名单 / 脱敏（只读说明）"。**缺失**：截图保留期配置、脱敏强度调节、数据导出（仅 KG 在记忆 tab）、**删除所有数据**按钮（GDPR 风格）
- **问题**：哲学承诺"截图 30 天自动清理 / 脱敏 基础/严格/偏执 / 导出我的所有数据 / 删除我的所有数据"，UI 全部未实现
- **轴**：👁 命中感知
- **改法**：PrivacyView 新增三个 Card：① 数据保留期（截图 7/30/90 天 + 永久 / 不保留）② 脱敏强度（基础 / 严格 — 严格模式连邮箱 URL 也脱）③ 数据管理（导出 ZIP / 危险区：删除所有数据）

#### P0.12 错误信息全靠"原始 error message"轰炸用户（新增 - 第 4 轮）
- **位置**：贯穿 `electron/action-executor.ts:89,151,222,295,317` + `PendingActionsSection.tsx:177` 直接渲染 `error` 字符串
- **现状**：失败时把 `error.message` 原文塞给用户看 — `ENOENT: no such file`、`AppleScript error: -1743`、`Cannot read property 'foo' of undefined` 等技术报错直接出现在用户面前
- **问题**：违反"用户能看到的 = 给用户的产品"原则，错误体验是世界级和业余的分水岭
- **轴**：👁 命中感知
- **改法**：建立 `errorTranslator` 模块 — 常见 error 映射"为什么发生 + 我能做什么"。例如 `ENOENT` → "Ovo 找不到那个文件，可能是被移动或删除了"；`-1743` → "Ovo 需要 AppleScript 权限，前往系统设置授权"

#### P0.13 关键异常场景无任何降级或引导（新增 - 第 4 轮）
- **位置**：代码层面完全没有针对以下场景的引导：API key 失效 / API 配额耗尽 / 权限被撤销 / 网络断开 / OCR 引擎崩溃 / 磁盘满
- **现状**：以上 6 种场景下 Ovo 会持续报错失败但 UI 不告诉用户"为什么"也不引导"怎么办"
- **问题**：用户唯一能感知到的是"Ovo 越来越不灵了"，结果是卸载
- **轴**：👁 命中感知
- **改法**：建立"系统健康监视器"，识别 6 类异常并显示对应卡片 — API key 失效弹"前往设置更新 key"；配额耗尽弹"切换到本地后端"；权限被撤销重新拉起 PermissionGate；网络断开切换离线模式（部分 action 仍可用）

---

### 🟠 P1 — 让产品看起来"业余"的高频问题（31 项）

#### 第 1 轮发现（11 项）

#### P1.1 BootstrapWizard 强制弹出 modal
- **位置**：`src/components/Onboarding/BootstrapWizard.tsx:31-78`
- **改法**：改为右下角软引导卡片，可关闭

#### P1.2 ColdStartHero 文案切换太慢
- **位置**：`src/components/Console/OverviewPanel.tsx:533`（2.4s/轮）
- **改法**：缩到 1.2s/段，加下滑微动效

#### P1.3 建议反馈停留太短易错过
- **位置**：`src/components/SuggestionPanel/SuggestionCard.tsx:26`（1.1s）
- **改法**：延长到 2.5 秒 + "撤销"链接（5 秒撤销，Gmail 模式）

#### P1.4 无撤销机制
- **位置**：`src/components/SuggestionPanel/SuggestionCard.tsx` 全文
- **改法**：建议在"AI 行为流"时间线持久化，可重新激活

#### P1.5 ConsoleSidebar 一级 tab 命名抽象
- **位置**：`src/components/Console/ConsoleSidebar.tsx:14-18`
- **现状**："现在 / 记忆 / 回放 / 设置"
- **改法**：改为"此刻 / Ovo 的想法 / 历史 / 设置"或加 tooltip

#### P1.6 高优先建议视觉权重不足
- **位置**：`src/components/SuggestionPanel/SuggestionCard.tsx:116-120`
- **改法**：整卡片边框变色 + 脉动呼吸

#### P1.7 pending action 缺优先级视觉差异
- **位置**：`src/components/Console/OverviewPanel.tsx:164-227`
- **改法**：pending 用红/橙色 + badge + 顶部固定

#### P1.8 暂停监控入口太隐蔽
- **位置**：`src/components/Console/OverviewPanel.tsx:248-259`
- **改法**：FloatingIcon 长按 → 直接弹"暂停 5/15/60 分钟"菜单

#### P1.9 系统动作（截图/OCR/LLM 调用）不可见
- **位置**：`src/components/Console/LiveStatusBar.tsx:94-132`
- **改法**：LiveStatusBar 增加微脉冲 + 当前正在处理的窗口名

#### P1.10 PermissionGate 多重提示警疲
- **位置**：`src/components/shared/PermissionGate.tsx:72-147`
- **改法**：合并为一个 + dismissal 持续到下次重启

#### P1.11 隐私控制三层深
- **位置**：`SettingsPanel.tsx` → PrivacyView
- **改法**：建立顶级"Privacy Dashboard"，FloatingIcon 右键直达

#### 第 2 轮新增（7 项）

#### P1.12 PipelineDetail StageBlock 直接暴露 JSON（新增）
- **位置**：`src/components/Console/PipelineDetail.tsx:70-85, 188-189`
- **现状**：「输入 (input)」「输出 (output)」section 用 `<pre>` 显示 5000+ 字 JSON，11px 字号
- **改法**：默认显示结构化摘要 — "Ovo 从屏幕识别出你在 [应用]，正在 [行为]"+ 实体列表 + 置信度；"展开原始数据"按钮折叠技术细节

#### P1.13 PipelinePanel 无时间感、无筛选、无搜索（新增）
- **位置**：`src/components/Console/PipelinePanel.tsx:10-154`
- **现状**：pipeline 列表平铺，标识用 UUID，无"今天/昨天"分组，无应用过滤
- **改法**：按时间分组（刚才/今天/昨天/更早）；每条预览 `[时间] [应用] [摘要] [状态]`；加"按应用过滤"chip + 搜索框

#### P1.14 ProcessPanel 与 PipelinePanel 概念重复（新增）
- **位置**：`src/components/Console/ProcessPanel.tsx:1-415` 与 `PipelinePanel.tsx`
- **现状**："动作清单"/"技术回放" tab 概念与 PipelinePanel 重叠，用户不知该看哪个
- **改法**：合并或明确分工 — ProcessPanel 改名"推理过程"，专注单条 pipeline 的因果链；PipelinePanel 专注列表浏览

#### P1.15 FloatingIcon 缺"有建议待处理"独立状态（新增）
- **位置**：`src/components/FloatingIcon/FloatingIcon.tsx:39-46` pickVisual
- **现状**：5 种状态（idle/thinking/generating/alert/error），但 unreadCount > 0 时浮球仍是 idle 绿色，用户错过提示
- **改法**：新增 `has_suggestion` 状态（青色 #06b6d4 + 慢呼吸），优先级高于 idle

#### P1.16 SuggestionToastWindow 固定 30 秒强制关闭（新增）
- **位置**：`src/components/SuggestionPanel/SuggestionToastWindow.tsx:7` AUTO_CLOSE_MS
- **现状**：进度条 30 秒倒计时无法延长，用户在朗读/思考时被催促
- **改法**：按内容长度动态计算（baseMs + content.length * 100ms，上限 60s）+ "锁定"按钮暂停倒计时

#### P1.17 FloatingIcon sticky 卡片缺快速操作（新增）
- **位置**：`src/components/FloatingIcon/FloatingIcon.tsx:247-280`
- **现状**：sticky 展开只有"打开 ovo"按钮，必须开主窗口才能接受/忽略建议
- **改法**：sticky 卡片加 `[接受] [忽略] [打开 ovo]` 三按钮，80% 操作在浮窗内完成

#### P1.18 MemoryPanel 列表模式 3 列网格信息密度不当（新增）
- **位置**：`src/components/Console/MemoryPanel.tsx:437-519`
- **现状**：3 列均分"角色/主题/项目"，每列 5-8 条，无质量条，无最近活跃度
- **改法**：改为单列纵向叙事卡 — 每项显示质量进度条 + 提及次数 + 最近时间 + ★ 钉住标记

#### 第 3 轮新增（6 项）

#### P1.19 BootstrapWizard 前两步强制必选无法快速跳过（新增）
- **位置**：`src/components/Onboarding/BootstrapWizard.tsx:82-84` `canNext`
- **现状**：步骤 1（兴趣）和步骤 2（角色）`interests.size > 0` / `roles.size > 0` 才能下一步；只能右上角 X 一次性 skip 全部
- **问题**：不想现在填的用户被迫"全部 skip"或"被迫填"，无中间道
- **改法**：每一步允许"跳过这一步"而非"跳过整个引导"，且步骤 1-2 改为可选（0 个也能下一步）

#### P1.20 启动时多窗口同时弹出无法识别"哪个是 Ovo"（新增）
- **位置**：`electron/main.ts:16-21`（consoleWindow + floatingWindow + tray 同时创建）
- **现状**：用户启动后看到 Console 大窗 + FloatingIcon 小球 + 系统托盘，没有"这是 Ovo 的主界面"指引
- **问题**：首次用户认知负担过重，分不清"主界面 vs 浮窗 vs 托盘"
- **改法**：启动序列改为：先显示 Console（带 spotlight 指引 — "Ovo 的大本营在这里"）→ 5 秒后 Console 缩起 → FloatingIcon 出现并有一次气泡提示"我会一直在这里"

#### P1.21 用户授权权限后无"Ovo 已在工作"的即时反馈（新增）
- **位置**：`PermissionGate.tsx:107-147` 顶部条消失后无后续
- **现状**：用户授权完，顶部条消失，但无任何"现在 Ovo 在为你工作"的庆祝/状态变化
- **问题**：缺失"完成首个任务"的成就反馈，用户不知道是否真的好了
- **改法**：授权检测到成功 → 顶部条变绿色"✓ Ovo 已经在为你工作了"3 秒 → 自动隐藏；同时 FloatingIcon 做一次 scale 弹动 + 颜色脉冲

#### P1.22 SettingsPanel 单页超长滚动无导航（新增）
- **位置**：`src/components/Console/SettingsPanel.tsx:59-323`（UI-S5 单页滚动注释）
- **现状**：所有 section 都在一个 `<div className="space-y-6">` 里，滚动距离非常长，无 tab / 锚点 / 搜索
- **改法**：左侧加锚点导航（隐私 / 外观 / 捕获 / AI / 关于 / 开发者），或顶部加搜索框 "搜索设置项"

#### P1.23 危险操作缺二次确认（新增）
- **位置**：黑名单删除 `SettingsPanel.tsx:498-503` / AI 后端切换 `SettingsPanel.tsx:207-212`
- **现状**：移除黑名单 app 直接点 ✕ 删除无确认；AI 后端 select 切换立即生效
- **问题**：用户误点会立刻生效，无恢复路径
- **改法**：删除黑名单时弹"确定要让 Ovo 重新观察 [app] 吗？"；AI 后端切换需要"应用"按钮 + 提示影响范围

#### P1.24 技术黑话散落各处（新增）
- **位置**：`SettingsPanel.tsx` 多处 — "AI 思考间隔" `自检` "Prompt 自评（GEPA 简化版）" "业务日志" "运行时自检异常"
- **现状**："GEPA" 是论文名，"自检" 是工程黑话，"业务日志" 用户不懂
- **改法**：建立"用户语言术语表" — GEPA→"Ovo 自我反思" / 自检→"健康检查" / 业务日志→"Ovo 的行动记录" / 运行时自检→"系统状态"

#### 第 4 轮新增（7 项）

#### P1.25 Action 失败时 output 为空，丢失"尝试了什么"上下文（新增）
- **位置**：`electron/action-executor.ts:87,220,249,275,294,316,341,419` 失败分支 `output: ""`
- **现状**：失败时 output 为空字符串，用户在 PipelineDetail 只看到 error 字符串，看不到"Ovo 尝试做的是什么参数 / 执行到第几步"
- **改法**：失败时也填充 output — "尝试 send_email 到 X，准备 subject Y，body 长度 N 字 → 在第 3 步失败"

#### P1.26 失败重试无退避策略（新增）
- **位置**：`src/components/SuggestionPanel/PendingActionsSection.tsx:188-194` "再试一次"按钮
- **现状**：用户连按 5 次"再试一次"会发出 5 次同样请求，遇到 rate limit / 网络问题会反复挫败
- **改法**：第一次失败立即重试 → 第二次失败延迟 2 秒 → 第三次延迟 5 秒 → 第四次禁用并提示"看起来一直失败，先放一边吧"

#### P1.27 长 action 执行无 cancel 机制（新增）
- **位置**：`PendingActionsSection.tsx:213` busy 状态只显示 spinner
- **现状**：planAndExecuteAction 走 LLM 规划路径可能耗时 10+ 秒，用户只能等
- **改法**：busy 状态加"取消"按钮 + 超过 15 秒自动显示"还在处理...想取消吗？"

#### P1.28 执行参数 key 直接显示英文（新增）
- **位置**：`PendingActionsSection.tsx:161` `<dt>{k}</dt>` 直接显示参数 key
- **现状**：用户看到 `to / body / subject / dueAt / startsAt` 等英文 key
- **改法**：建立 key 翻译表 — to→"收件人" / body→"内容" / subject→"主题" / dueAt→"到期时间" / startsAt→"开始时间"

#### P1.29 SuggestionPanel dismissed 是本地 state，刷新就丢（新增）
- **位置**：`src/components/SuggestionPanel/SuggestionPanel.tsx:9` `useState<Set<string>>(new Set())`
- **现状**：用户 dismiss 的建议刷新或重启后又会出现，且永远无法找回主动 dismiss 的内容
- **改法**：dismissed 状态持久化到 store + 建议持久化到 "AI 行为流" 时间线（与 P1.4 撤销机制连接）

#### P1.30 errorLogger 广播给所有窗口（新增）
- **位置**：`electron/error-logger.ts:109-113` 给 `BrowserWindow.getAllWindows()` 全发
- **现状**：FloatingIcon 和 Toast 窗口也会收到 alert:new，可能在浮窗里弹"console error"这类调试信息
- **改法**：alert 加 `audience: "user" | "developer"` 字段，只把 user 类广播；developer 类只到主控台

#### P1.31 "先放一边" / "不执行" / 关闭 X 三种语义混淆（新增）
- **位置**：`PendingActionsSection.tsx:218-234` 三个按钮并存
- **现状**："不执行"调 cancelAction 删除、"先放一边"调 onClose 仅关闭对话框、右上 X 也是 onClose — 视觉上看起来是三种关闭，实际语义不同
- **改法**：明确语义 — 主按钮"执行 / 不执行（永久拒绝）"；次按钮"稍后决定（暂存到 AI 行为流）"；右上 X 移除以免误用

---

### 🟡 P2 — 打磨层问题（15 项）

#### 第 1 轮发现（6 项）

#### P2.1 按钮系统超过 4 种且不一致
- GlowButton / ActionButton / 内联 icon button / 纯文字按钮 — hover/disabled 各异
- **改法**：建立 3 种按钮变体（primary/secondary/ghost）

#### P2.2 色彩 hard-code 严重
- > 50% 颜色未读 CSS 变量
- **改法**：完整 design token system，强制走 CSS 变量

#### P2.3 间距/圆角/字号无 scale
- spacing scale (4/8/12/16/24/32) + radius scale (4/8/12/16) + type scale (12/14/16/20/24)

#### P2.4 Card 组件使用不一致
- 强制所有 Panel 内容块走 Card 组件

#### P2.5 Loading/Error/Success 样式不一致
- 引入统一 LoadingIndicator + Toast 系统

#### P2.6 Error 文案技术化
- `PendingActionsSection.tsx:176` "没成功" + 暴露 `ENOENT`
- **改法**：error message translator

#### 第 2 轮新增（3 项）

#### P2.7 跨窗口色板分裂（新增）
- **位置**：`FloatingIcon.tsx:22-27` PALETTE vs `SuggestionToastWindow.tsx:97` getSuggestionSpec
- **现状**：FloatingIcon 红 alert 和 SuggestionToastWindow 红建议来自不同色板，看起来像两个产品
- **改法**：建立跨窗口 `STATE_PALETTE` — 按"状态"定义而非按"组件"定义

#### P2.8 SuggestionToastWindow 三种交互模式不统一（新增）
- **位置**：`src/components/SuggestionPanel/SuggestionToastWindow.tsx:170-239`
- **现状**：receipt（单按钮"知道了"）/ offer（"要/不要"）/ suggestion（"采纳/忽略"+ 朗读），用户要适应多种控制方式
- **改法**：统一为"确认/取消"主按钮，可选的第三动作（如"永远不要"）用菜单按钮

#### P2.9 KnowledgeGraph 节点详情缺主观表述（新增）
- **位置**：`src/components/Console/MemoryPanel.tsx:655-817` EntityDetailView
- **现状**：节点详情用客观字段（提及次数、最近时间），缺"Ovo 的视角"
- **改法**：顶部加一句"Ovo 认为你是一个 [角色]，最关心 [主题]"，让用户感受到 Ovo 在"理解你"

#### 第 3 轮新增（3 项）

#### P2.10 应用启动无 splash screen（新增）
- **位置**：`electron/main.ts` 启动流程
- **现状**：从双击图标到首屏可能黑屏 1-3 秒（Electron 启动 + React 加载）
- **改法**：加 splash screen（500ms 内显示）— Ovo logo + "正在唤醒..." 文案

#### P2.11 API Key 无显示/隐藏 + 无验证按钮（新增）
- **位置**：`SettingsPanel.tsx:225-227` API Key 输入
- **现状**：仅 `type="password"`，用户无法快速 toggle 查看，无验证 key 有效性按钮
- **改法**：加眼睛 icon toggle 显示/隐藏 + "测试连接"按钮立即调一次 API 验证

#### P2.12 设置项保存机制不一致（新增）
- **位置**：多数设置即时保存，但 `SettingsPanel.tsx:232` "保存 API 配置" 需手动点
- **现状**：用户无法预期"我改了 X 是否需要点保存"
- **改法**：统一为即时保存 + 顶部全局 toast "已保存"；或全部改为手动保存 + 底部"应用更改"按钮

#### 第 4 轮新增（3 项）

#### P2.13 SuggestionPanel EmptyHero 文案薄弱（新增）
- **位置**：`src/components/SuggestionPanel/SuggestionPanel.tsx:65-67` "ovo 正在观察 / 看到你正在做的事，会主动出现在这里"
- **现状**：缺"预期建立"（通常多久会有第一条？）和"我能先做什么"（去看 Ovo 学到了什么？）
- **改法**：分阶段文案 — 启动 5 分钟内显示"Ovo 通常需要 1-3 分钟熟悉你的工作场景..."；超过 5 分钟显示"还没有合适的建议出现 — 先去看看 Ovo 学到了什么 [跳转记忆]"

#### P2.14 error.log 导出格式是 JSONL 用户读不了（新增）
- **位置**：`electron/error-logger.ts:72` `const line = JSON.stringify(entry) + "\n"`
- **现状**：用户如需配合 debug 把日志发给开发者，看到的是一行行 JSON，自己也读不懂
- **改法**：导出时转为人话格式 — `[2026-05-16 14:32:01] [错误] [屏幕截图] 屏幕录制权限被撤销，请前往系统设置重新授权` + 保留原 JSON 作为 .raw.log 副本

#### P2.15 SuggestionPanel header "在听" 文案不清（新增）
- **位置**：`SuggestionPanel.tsx:33` `count > 0 ? \`${count} 条\` : "在听"`
- **现状**："在听"语义不清，是"听键盘"？"听屏幕"？
- **改法**：改为"Ovo 在看着..." + 微脉冲，或者"还没有建议（持续观察中）"

---

### 🟢 P3 — 锦上添花（6 项）

#### 第 1 轮发现（2 项）

#### P3.1 FloatingIcon 拖动后无位置保存反馈
- **位置**：`FloatingIcon.tsx:139-177`
- **改法**：拖动结束 scale 弹动 + toast

#### P3.2 空状态设计薄弱
- **改法**：每个空状态配插画 + 鼓励文案 + 引导操作

#### 第 2 轮新增（2 项）

#### P3.3 全局命令面板缺失（新增）
- **现状**：用户找特定 pipeline / 切换面板 / 触发暂停 都需多次点击
- **改法**：实现 Cmd+K 命令面板（参考 Raycast），支持 "暂停 30 分钟" "查看 Gmail 相关 pipeline" "打开隐私设置"

#### P3.4 文本编辑类建议缺 Diff 视图（新增）
- **现状**：邮件回复/文本修改类建议直接展示结果，用户无法快速比对前后
- **改法**：参考 Cursor 的 inline diff，让建议展示"原文 vs 修改后"，接受按钮明确

#### 第 4 轮新增（2 项）

#### P3.5 无自适应降级（低配机 / CPU 高占场景）（新增）
- **现状**：5 秒 OCR + 15 秒 LLM 调用在 M1 上轻松，但在 Intel Mac / 低配机上会拖垮系统
- **改法**：监测 CPU/内存使用率，超过阈值自动延长捕获间隔 + 关闭多 pass + 提示"已为你切换到节能模式"

#### P3.6 多场景智能差异（新增）
- **现状**：浏览器 tab 切换 / 聊天滚动 / IDE 代码 / 视频会议 — 四种场景 OCR 和触发频率应该不同，当前是统一策略
- **改法**：建立"场景识别器" — 浏览器频繁切换时聚合触发；聊天滚动时按"消息突发"批处理；IDE 时关闭主动建议（避免分散注意）；视频会议时静默（避免截图泄露屏幕共享内容）

---

## 关键 UX 反模式（系统性问题）

### 反模式 1：把"调试视图"当成"产品功能"
- PipelineDetail、KnowledgeGraph、ProcessPanel、LiveLogStream 都是这种状态
- **后果**：用户感受不到 Ovo 的独特价值
- **方向**：所有"工程视图"都需要重新设计成"用户视图"

### 反模式 2：用文字代替视觉
- LiveStatusBar 全文字、空状态全文字、错误全文字
- **方向**：每个状态都应该有 icon / animation / illustration

### 反模式 3：默认行为强势，撤销机制缺失
- 建议消失就消失，操作执行就执行
- **方向**：每个动作都要可撤销 / 可回溯

### 反模式 4：哲学层与 UI 层断层
- 哲学已经说了"透明 + 教练"，但 UI 没体现
- **方向**：每个 PR 都要回答"它体现了哲学的哪一条"

### 反模式 5：JSON 直接暴露 = 工程文档心智（新增 - 第 2 轮）
- StageBlock 把 input/output JSON 直接 `<pre>` 出来，UUID 当 pipeline 标识，日志包含 `ENOENT`/`UNIQUE constraint`
- **后果**：产品看起来像"开源工程师写给自己看的工具"，不像消费级产品
- **方向**：所有原始数据**默认折叠**，UI 默认显示"人话总结"，技术细节通过"展开原始数据"二级入口暴露给 power user

### 反模式 6：错误兜底 = `swallow` 或 `raw error.message`（新增 - 第 4 轮）
- ActionExecutor 多处 `catch { /* swallow */ }`（line 180, 196 - 失败也返 success），错误暴露处直接渲染 `error.message`（line 89, 177 等）
- 异常场景（API key 失效 / 配额耗尽 / 权限被撤销 / 网络断开 / 磁盘满）无系统性识别与引导
- **后果**：用户感受到的是"Ovo 越来越不灵了"，且看不懂错误，无修复路径 — 直接走向卸载
- **方向**：建立两层错误体系 — ① `errorTranslator` 把 raw error 翻成"为什么 + 怎么办"；② "系统健康监视器" 主动识别 6 类异常并提供修复入口

---

## 竞品对照与可借鉴模式（第 2 轮新增）

### 对照表

| 痛点 | 竞品解法 | Ovo 借鉴 | 对应问题 |
|---|---|---|---|
| 调试视图生硬 | Linear Activity Feed 用自然语言："You created issue ABC · 2h ago" | StageBlock 改叙述体："Ovo 看到你在 Slack，决定检查是否需要提醒" | P0.5, P1.12 |
| KnowledgeGraph 难理解 | Granola 把知识图谱改成"故事线"："你最常谈论的三个话题" | MemoryPanel 列表改时间线式故事卡 | P0.6, P1.18 |
| 浮窗无法执行 | Raycast 内联操作：搜索框内 Enter/Tab 完成所有动作 | FloatingIcon sticky 加 [接受/忽略/详情] 三按钮 + 右键菜单 | P1.17, P1.8 |
| Toast 自动关闭压力 | Notion AI 内联建议无自动消失，用户主动接受/忽略 | SuggestionToast 动态时长 + 锁定按钮 | P1.16 |
| 跨窗口不一致 | Arc Browser 的 Max sidebar 始终与主窗口同色板 | 建立跨窗口 design token | P2.7 |
| 找不到 pipeline | Linear Cmd+K 全局搜索 + 高级语法 `app:Gmail status:failed` | 实现 Cmd+K 命令面板 | P3.3 |
| Diff 缺失 | Cursor inline diff 显示 AI 想改什么 | 文本类建议加 Diff 视图 | P3.4 |

### 三个学习点（非具体功能）

#### 学习 1：Raycast 的"命令心智"
心智清晰 = 搜索 + Enter，菜单嵌套最多 2 层。
**Ovo 应该定义清晰心智**：浮球 → 浮球点击 → 选择操作（查看/配置/暂停）→ 查看 → 接受/忽略/详情。

#### 学习 2：Granola 的"故事线优于数据库视图"
不把知识当查询，而是"关于你的故事"。
**Ovo 应该用叙述体重写 MemoryPanel**。

#### 学习 3：Linear 的"人话总结 + 原始数据可选"
Activity feed 是自然语言，点击可展开 JSON。
**Ovo 应该把所有技术细节默认折叠**，但保留 power user 入口。

---

## 第二轮系统性发现

### 工程视图 → 用户视图的转换只完成 50%

| 阶段 | 现状 | 应该是 |
|---|---|---|
| 数据结构 | ✓ pipeline JSON / KG 节点 / log 流 | ✓ |
| 基础可视化 | ✓ 卡片 / 图谱 / 进度条 | ✓ |
| 人话解释 | ✗ 工程术语 + JSON 暴露 | 叙述体 + icon + 隐藏细节 |
| 交互完整性 | 🟡 能看 + 不能编辑 + 无快捷操作 | 修正中间推理 + 快捷操作 |
| 跨窗口一致性 | ✗ 各自独立设计 | 统一 design token |

---

## 可观察 KPI 框架（第 3 轮新增 - "世界级"的度量）

世界级 AI 助手必须能被数据度量。下表围绕"魔法时刻三轴"和"信任建立"，定义 Ovo 应该 track 的 12 个核心指标 + 4 个反指标。

### 核心 KPI（按产品哲学三轴组织）

| 类别 | 指标 | 世界级目标 | 测量方式 | 当前状态 |
|---|---|---|---|---|
| **首次价值** | TTFV（Time To First Value） | < 90 秒 | 从安装/启动 → 第一条建议被采纳 | 未度量 |
| **首次"魔法"** | TTFM（Time To First Magic） | < 24 小时 | 用户首次标记"这次太准了" | 度量机制未实现 |
| 🎯 命中率 | 建议采纳率 | > 40% | accepted / shown | `feedback-engine` 有数据，无 dashboard |
| 🎯 命中率 | 建议拒绝率 | < 30% | rejected / shown | 同上 |
| 🎯 命中率 | 沉默是金率（用户在场但 AI 不出手的时间占比） | > 70% | idle_time / (idle + suggest_time) | 完全未实现 |
| 💎 命中价值 | 建议平均评分 | > 4.0 / 5 | 用户主动评分 | UI 没有评分入口 |
| 💎 命中价值 | "永远不要这样" 触发次数 / 周 / 用户 | > 0（说明用户在教 AI） | 玻璃管家浮窗的 negative pattern 按钮 | 浮窗未实现 |
| 👁 命中感知 | "Ovo 帮我省了 X 时间" 周报点开率 | > 60% | clicks / sent | 周报功能未实现 |
| 👁 命中感知 | Pipeline 详情查看率 | > 30%（用户主动看 Ovo 怎么想） | views / pipeline_count | PipelineDetail 是二级页面 |
| **信任** | 7 日留存 | > 50% | 经典指标 | 未度量 |
| **信任** | 信任分级平均位置 | > Lv.2（用户主动升级） | sum(level) / user_count / action_count | 信任分级未实现 |
| **隐私感** | 暂停 / 黑名单使用率 | > 20%（敢用 = 信任建立） | users_used_privacy / total_users | 已有功能，无统计 |

### 反指标（红线警告）

| 指标 | 红线 | 含义 | 应对 |
|---|---|---|---|
| **撤销率** | > 10% | 主动行为被撤销超过 10% = AI 太激进 | 自动降级用户的信任分级 |
| **拒绝率** | > 60% | 60% 建议被忽略 = 命中率塌方 | 触发 prompt-self-eval 调优 |
| **首屏放弃率** | > 30% | 30% 用户在 60 秒内关闭应用 = 冷启动体验失败 | 重新设计首次启动流程 |
| **权限拒绝率** | > 25% | 25% 用户拒绝屏幕录制 = 信任前置不足 | 重新设计 PermissionGate 文案与时机 |

### KPI 实现建议

**新增数据基础设施**（电话簿式持久层）：
- `electron/metrics.ts` — 统一指标采集 SDK
- SQLite 新增 `metrics_events` 表 — `(event_type, timestamp, payload, session_id)`
- UI 新增"健康看板"（开发者模式可见）— 展示上述 KPI 的实时值
- 长期：聚合上报到可选的本地分析后端（用户授权后），形成"自我度量"的产品文化

**KPI 与现有 audit 问题的连接**：
- 解决 P0.1（首屏文案）→ 提升 TTFV 和首屏放弃率
- 解决 P0.3 P0.10（信任分级）→ 提升信任分级平均位置 + 降低撤销率
- 解决 P0.4（玻璃管家）→ 提升 "永远不要这样" 触发次数
- 解决 P0.6（KG 叙事化）→ 提升 Pipeline 详情查看率

**世界级判准**：当 Ovo 能在 dashboard 上看到这 12 个指标，并且 80% 达到目标值时，可以称之为"世界级"。

---

## 已修复 / 已 ship

_（暂无）_

---

## 审计历史

### 2026-05-16 第 1 轮（基线建立）
- 范围：BootstrapWizard / OverviewPanel / SuggestionPanel / SuggestionCard / FloatingIcon / ConsoleSidebar / shared / LiveStatusBar / PermissionGate
- 产出：23 个问题（P0×4, P1×11, P2×6, P3×2）+ 4 个系统性反模式
- 核心判断：哲学已定方向，但 UI 几乎零兑现

### 2026-05-16 第 2 轮（深入"调试视图变产品"与跨窗口体验）
- 范围：PipelineDetail / PipelinePanel / PipelineStageCard / MemoryPanel / KnowledgeGraphCanvas / ProcessPanel / LiveLogStream / FloatingIcon / SuggestionToastWindow + 竞品对照（Linear/Raycast/Granola/Arc/Notion/Cursor）
- 产出：15 个新问题（P0×3, P1×7, P2×3, P3×2）+ 1 个新反模式 + 竞品对照表
- 核心判断：工程视图→用户视图转换只完成 50%，缺"人话解释"和"跨窗口一致性"

### 2026-05-16 第 3 轮（首次 60 秒 + SettingsPanel + KPI 框架）
- 范围：electron/main.ts 启动流程 / BootstrapWizard 完整 / PermissionGate 完整 / SettingsPanel 678 行全审计
- 产出：13 个新问题（P0×4, P1×6, P2×3）+ 完整 KPI 度量框架（12 核心 + 4 反指标）
- 核心判断：
  - **首次 60 秒是流失最高峰**：连续 3 层模态对话框 + 强制权限重启 = 至少 4 次让用户离开应用的机会
  - **SettingsPanel 是哲学兑现的镜子**：哲学承诺的 5 项隐私核心功能（信任分级 / 截图保留期 / 脱敏强度 / 数据导出 / 删除所有数据）UI 零实现
  - **"世界级"必须可被度量**：没有 KPI 框架，所有"打磨"都是主观感受。建立 12 + 4 指标体系作为客观北极星

### 2026-05-16 第 4 轮（错误体验 + Action 端到端 + 异常场景）
- 范围：electron/action-executor.ts 423 行 / PendingActionsSection.tsx 247 行 / electron/error-logger.ts 158 行 / SuggestionPanel.tsx 72 行
- 产出：14 个新问题（P0×2, P1×7, P2×3, P3×2）+ 1 个新反模式（错误兜底 = swallow / raw error）
- 核心判断：
  - **错误体验是世界级和业余的最隐蔽分水岭**：底层 swallow 静默失败 + 上层暴露 raw `error.message` = 用户感受到"Ovo 越来越不灵但不知道为什么" → 静默流失
  - **关键异常场景无系统性识别**：API key 失效 / 配额耗尽 / 权限撤销 / 网络断开 / OCR 崩溃 / 磁盘满 — 6 类高频异常，UI 完全没有针对性引导
  - **Action 端到端闭环不完整**：失败无重试退避、长任务无 cancel、参数 key 直接英文、dismissed 状态刷新即丢
- 下一轮建议聚焦：
  - **可访问性（A11y）审计**：键盘导航、屏幕阅读器、对比度、字号缩放 — 世界级产品的盲区
  - **国际化（i18n）现状**：中文 hard-code 散落多少？英文用户体验如何？
  - **性能感知**：感知性能（perceived performance）— 启动闪屏 / 操作即时反馈 / 滚动顺滑度 / 大数据集渲染
