# Ovo UI 设计一致性审计（持续演进文档）

> UI 设计专家视角，聚焦视觉一致性、设计系统、品牌完整性。
> 与 `UX_AUDIT.md`（产品 UX）/ `BUG_REPORT.md`（QA bug）互补 — 这份只看视觉层。

**最新更新**：修复轮（2026-05-21）· 🎨 配色一致性已修复 ✅（B1/B2/B3/B4/S1）· 累计 22 个问题（5 个已解决）· 5 个系统性反模式

---

## 文档说明

### 评分体系（不同于 UX/BUG 文档）

| 等级 | 含义 | 处理时机 |
|---|---|---|
| 🔴 **Brand-Breaking** | 品牌完整性问题，用户感受到"两个产品" | 立刻修，先于一切 |
| 🟠 **System-Violation** | 违反已有设计系统（绕过 tokens / shared 组件） | 当前 sprint |
| 🟡 **Inconsistency** | 局部不一致，未到品牌层 | 滚动清理 |
| 🟢 **Polish** | 视觉细节打磨 | 持续优化 |

### 每条问题必须包含
- **位置**：`file:line` 精确定位 + 视觉差异截图描述
- **不一致的具体证据**：两个或多个地方的对比
- **建议修复**：统一的方向

---

## 🔴 Brand-Breaking 问题（5 项）— 必须先于一切修

### B1 三套互不相关的 Logo 视觉系统并存
**这是 Ovo 当前最严重的设计问题**。同一个产品在三个窗口呈现三种完全不同的 logo 概念：

| 窗口 | logo 风格 | 文件 | 视觉描述 |
|---|---|---|---|
| 浮动球（运行时常驻） | Siri 风格"渐变光球" | `src/components/FloatingIcon/FloatingIcon.tsx:310-342` SiriOrb | SVG radialGradient 发光圆 + 外圈水波 + 粒子轨道 |
| 主控台（应用打开） | "OVO 表情脸" | `src/components/shared/AnimatedLogo.tsx:1-142` | 双圆眼睛 + V 形嘴，会眨眼/扫视/思考 |
| 系统托盘 / Dock | "OVO 表情脸"（不同颜色） | `electron/icon-renderer.ts:1-40` | 注释自称"唯一设计源" — 但实际并不是 |

**用户体验**：
- 启动看到 Tray 的**深绿色眼睛 logo**
- 主控台看到**亮绿色 + 微信绿的 AnimatedLogo**
- 屏幕角落浮窗看到**Siri 风格的彩色光球**（绿/紫/黄/红循环）

**用户感受到的是三个不同的产品**，根本无法建立品牌印象。

- **复现路径**：启动 Ovo → 看 Tray icon（深绿眼睛） → 打开控制台（亮绿眼睛） → 关闭控制台看屏幕角落（彩色光球） — 三个完全不同的"logo"
- **建议修复**：
  - 立刻决定**唯一 logo 概念**：要么"表情脸"（双眼 + V 嘴），要么"渐变光球"，二选一
  - 状态变化用**统一系统**呈现（颜色变化 / 微动效），而不是换 logo
  - 删除其他两套实现，从一个 source-of-truth 渲染所有尺寸

### B2 设计 tokens 系统存在但被 4 套色板大规模绕过
`src/index.css` 定义了完整的 macOS systemBlue 体系（`--accent: #007aff`），但代码里实际用的是：

| 来源 | 色板 | 文件 |
|---|---|---|
| 设计 tokens (CSS) | systemBlue `#007aff` 系列 | `src/index.css:18-25` |
| FloatingIcon SiriOrb | 绿/紫/黄/红 `#34d399 / #7c8dff / #fbbf24 / #ef4444` | `FloatingIcon.tsx:23-27` |
| AnimatedLogo | 微信绿 + 蓝 `#07C160 / #5B9BD5 / #8AA896` | `AnimatedLogo.tsx:12-15` |
| icon-renderer | 深绿背景 + 亮绿前景 `#103d28 / #3affa6 / #2da96e / #4ae39b` | `electron/icon-renderer.ts:29-37` |
| SuggestionCard tints | Ant Design 蓝/红 `#1890ff / #ff4d4f` | `SuggestionCard.tsx:24-25` |

**5 套色板并存，没有任何一个用 design tokens**。

- **复现路径**：grep `#[0-9a-fA-F]{6}` src/ electron/ 看色值散布
- **建议修复**：
  - 把 5 套色板**归一**为 1 套 design tokens（如统一到 systemBlue 或统一到品牌绿，二选一）
  - 强制所有组件读 `var(--color-xxx)` 不允许硬编码
  - ESLint 加 `no-restricted-syntax` 禁止 hex 颜色字面量

### B4 项目根本没有 tailwind.config 文件 — design tokens 无法成为类名（第 2 轮新增）
- **位置**：项目根 — `tailwind.config*` 不存在；CSS `src/index.css:1` 仅 `@import "tailwindcss"`
- **现状**：使用 Tailwind v4 + @tailwindcss/vite，但**没有 config 文件**，也没有用 v4 的 `@theme` 指令把 CSS 变量暴露为 Tailwind 类名
- **影响**：
  - 所有颜色必须写丑陋的 `bg-[var(--accent)]` 而不是 `bg-accent`
  - 无法定义统一的 spacing scale → 散落 `gap-2/3` `px-3/4` `py-1.5/2/2.5/3`
  - 字号被迫硬编码 `text-[13px]` `text-[11px]` `text-[10.5px]` `text-[10px]`
  - **这是 B2（5 套色板）+ I3（字号跳跃）+ I2（圆角混乱）等所有"散落硬编码"问题的根因**
- **复现路径**：`ls tailwind.config*` 无输出 → grep `text-\[` 看 hard-code 字号数量
- **建议修复**：
  - 立刻新建 `tailwind.config.ts`（或用 Tailwind v4 的 `@theme` 指令在 CSS 内定义）
  - 把 `--accent / --text-primary / --bg-card` 等暴露为 `bg-accent / text-primary / bg-card` 等类名
  - 定义 spacing scale (`1,2,3,4,6,8`)、radius scale (`sm/md/lg`)、type scale (`xs/sm/base/lg/xl`)
  - ESLint 加规则禁 `text-\[#`、`bg-\[#`、`text-\[\d+px\]` 等 hard-code

### B5 三种图标系统混用 — lucide / 手画 SVG / Emoji（第 2 轮新增）
| 系统 | 使用次数 | 示例 |
|---|---|---|
| lucide-react | 18 个文件导入，48+ 种图标 | `<Loader2 />`, `<Sparkles />`, `<Bot />`, `<Brain />`, `<Coffee />`, `<Compass />` |
| 内联手画 SVG | 至少 4 处 | `StatusPanel.tsx:208-210` 自画对勾/叉号/警告 |
| Emoji 当图标 | 散布 10+ 处 | `📸 🧠 💡 ✦ ⚠ ⏸ ⚡ ✓` |

- **位置**：grep `from "lucide-react"` × 18 / `<svg ` 手画 / emoji 散布
- **问题**：
  - **同一界面同时出现 lucide 图标 + emoji 图标**（OverviewPanel 里 lucide 的 `Pause` 旁边是 emoji `📸 🧠 💡`）
  - **Emoji 在不同字体下渲染不一致** — macOS Apple Color Emoji 彩色 / Linux/Windows 可能黑白 / 部分用户字体替换为方块
  - **同一概念有多个 emoji 候选** — "警告" 既有 lucide `AlertCircle` 又有 lucide `AlertTriangle` 又有 emoji `⚠` 又有 emoji `⚠️`
- **影响**：视觉风格分裂 + 跨平台渲染不可控（如果未来 Linux/Windows 用户使用）
- **复现路径**：打开 OverviewPanel → 同时看到 lucide outline 风格图标 + emoji 彩色图标 → 在一行内
- **建议修复**：
  - **零容忍**：UI 中禁用 emoji 当 icon（emoji 仅用于文字内容如 toast 标题装饰）
  - 所有图标走 lucide-react，禁止手画 SVG（除非是 logo 等品牌资产）
  - 建立 `src/icons/index.ts` 重导出 lucide 用过的图标作为白名单
  - 同一概念定一个 icon — "警告" 永远是 `AlertTriangle`

### B3 主题色概念自相矛盾（CSS 注释 vs 代码现实）
- **位置**：`src/index.css:18` 注释 `/* 主题色 - macOS systemBlue（避免与微信品牌冲突） */`
- **现状**：注释说"避免与微信品牌冲突"，但实际代码：
  - `AnimatedLogo.tsx:13` `watching: { color: "#07C160" }` — **就是微信绿**
  - `AnimatedLogo.tsx:21` `const vColor = "#07C160"` — 同样
  - `icon-renderer.ts:35` `v: { r: 0x4a, g: 0xe3, b: 0x9b }` — 亮绿系
- **影响**：设计意图（避开微信）与实施（仍用微信绿）冲突 — 团队内部对"我们是什么颜色"无共识
- **复现路径**：把 Ovo 图标和微信图标并列比对，会被误认为关联产品
- **建议修复**：开产品会议确定 — 要么明确"用 systemBlue 不用任何绿色"，要么明确"用品牌绿但调整色值（如换成 emerald-500 #10b981）避开微信识别色"，写进 `docs/product/PRODUCT_PHILOSOPHY.md` 作为长期承诺

---

## 🟠 System-Violation 问题（8 项）

### S1 状态机三套不一致的命名 + 颜色映射
同一个"系统状态"概念，在三个地方有三套不同的命名：

| 地点 | 状态枚举 | 颜色来源 |
|---|---|---|
| CSS tokens | `--state-idle / watching / thinking / executing` | systemBlue 系 |
| AnimatedLogo (`LogoState`) | `idle / watching / thinking / executing` | 微信绿 + 蓝 + 灰绿（**与 CSS 同名不同色**） |
| FloatingIcon (`Visual`) | `idle / thinking / generating / alert / error` | 绿/紫/黄/红/红（**5 个状态，与上面不同名**） |
| SuggestionCard types | `content_help / risk_alert / pattern_insight / ...` | Ant Design 蓝/红（**完全另一套**） |

- **位置**：`src/index.css:31-34` / `AnimatedLogo.tsx:5` / `FloatingIcon.tsx:21` / `SuggestionCard.tsx:24-30`
- **影响**：用户看到的"思考中"在主控台是蓝色脸、在浮窗是紫色光球 — 同一概念视觉割裂
- **建议修复**：建立 `electron/types/AppState.ts` 单一状态枚举（如 `idle | observing | thinking | acting | alerting`），所有 UI 从同一枚举读颜色 mapping

### S2 OvoLogo shared 组件存在但被绕过
- **位置**：`src/components/shared/OvoLogo.tsx`（43 行）已存在
- **现状**：意图是"shared logo 组件"，但 AboutPanel、ConsoleSidebar 等地方仍直接写 `<h3 className="text-xl font-semibold">ovo</h3>` 或直接画 SVG
- **影响**：未来要改 logo 需要改多处，且无法保证视觉同步
- **复现路径**：grep `OvoLogo` import 数量 vs grep 直接画 logo 的位置
- **建议修复**：把所有 logo 出现的位置统一用 OvoLogo 组件；该组件内部包含 size 变体 + 动画状态

### S3 副标题 / 口号散落无统一定义
项目对自己的"一句话定义"在不同位置完全不同：

| 位置 | 文案 |
|---|---|
| `electron/main.ts:60` Tray tooltip | "ovo - AI 桌面助手" |
| `AboutPanel` | "ovo 是一个观察屏幕、推断意图、长期跟随用户成长的桌面副驾驶" |
| `BootstrapWizard.tsx:94` | "5 分钟告诉 ovo 关于你" |
| `PermissionGate.tsx:166` | "ovo 作为主动式助手，会定时对屏幕截图并通过 OCR 理解上下文..." |
| README | (待核实) |
| `PRODUCT_PHILOSOPHY.md` | "玻璃房子里的主动管家" |

**6 个地方 6 个定义**。哲学文档说的是诗意定义，UI 用的是功能定义，没有任何一处一致。

- **建议修复**：开会定 1 个 tagline（如"看着 ovo 思考，让 AI 主动为你服务"）+ 1 句 elevator pitch + 1 段长描述，三层结构强制所有 UI 引用同一个常量

### S5 z-index 散落 5 个魔法数字 — 弹层层级不可预测（第 2 轮新增）
- **位置**：
  - `BootstrapWizard.tsx:87` `z-[100]`（modal 外层）
  - `PermissionGate.tsx:150` `z-[100]`（教学弹窗）
  - `PendingActionsSection.tsx:130` `z-50`（执行确认对话框）
  - `App.tsx` `z-50`（全屏 layout）
  - `Sidebar drawer` `z-40`
  - `MemoryPanel.tsx:364` `z-30`（dropdown menu）
  - 多处 inline `style={{ zIndex: 50 }}`
- **现状**：5 个不同 z-index 值散落，无 scale 定义
- **影响**：未来加 Toast / Tooltip 时无法决定该用哪个 z-index — Modal 和 Toast 同时出现谁压谁？Tooltip 在 Modal 内还能看见吗？
- **复现路径**：让 PendingAction 确认对话框（z-50）和 BootstrapWizard（z-[100]）同时出现 → 看 z-50 是否被遮挡
- **建议修复**：定义 z-index scale（CSS 变量）：
  - `--z-base: 0` / `--z-dropdown: 100` / `--z-sticky: 200` / `--z-overlay: 300` / `--z-modal: 400` / `--z-toast: 500` / `--z-tooltip: 600`
  - 禁用 `z-[\d+]` hard-code

### S6 焦点环（focus ring）4 种实现 — 键盘可访问性视觉不一致（第 2 轮新增）
- **位置**：
  - `Input.tsx:7` / `BootstrapWizard.tsx:138,190`：`outline-none focus:ring-1 focus:ring-[var(--accent)]`
  - `index.css:130-132`：全局 `:focus-visible { box-shadow: var(--focus-ring) }`（2px ring）
  - `StatusPanel.tsx:59` / `WindowPanel.tsx:305`：`ring-2 ring-[var(--accent)]/40 ring-offset-2`
  - 多处 `focus:border-[var(--accent)] focus:outline-none`（只改边框无 ring）
- **影响**：键盘用户 tab 不同元素时焦点视觉跳变 — 有时 1px ring、有时 2px ring、有时只有 border 变色、有时还有 ring-offset
- **复现路径**：用键盘 Tab 走完一个 Settings 页 → 截图比较每个聚焦元素的视觉
- **建议修复**：废除散落实现，**只保留 `:focus-visible` 全局规则**；shared 组件用 utility class `focus-ring` 引用同一 CSS 变量

### S7 动画来源 4 处分散 — keyframes 复制粘贴 + timing 完全无标准（第 2 轮新增）
- **位置**：
  - `index.css` 全局 keyframes（如 `suggestion-toast-enter`）
  - `FloatingIcon.tsx:283-301` 组件内嵌 6 个 keyframes（`ovo-breathe / heartbeat / orbit / pulse / flicker`）
  - `AnimatedLogo.tsx:27-42` 组件内嵌 15+ keyframes（`ovo-idle-breathe / blink-l/r / head-scan / think-l/r` 等）
  - `SuggestionToastWindow.tsx:221` inline style `animation: "ovo-pulse 0.8s..."`
- **timing duration 散落**：`0.55s / 0.7s / 0.8s / 1.4s / 1.6s / 2.4s / 3.0s / 4.5s / 150ms / 160ms` — 没有任何 motion scale
- **影响**：
  - 动画维护必须改多处文件
  - "呼吸""脉动""扫视" 概念被多次重新实现，无组件复用
  - 一个界面里 5 个动画同时跑用 5 个不同 duration，节奏混乱
- **复现路径**：grep `@keyframes ovo-` 看名字数量
- **建议修复**：
  - 全部 @keyframes 集中到 `src/styles/animations.css`
  - 定义 motion scale：`--ease-soft / --ease-bounce / --ease-snap` + `--duration-instant: 100ms / fast: 150ms / base: 250ms / slow: 400ms / slower: 600ms`
  - 状态动画统一封装成 utility class（如 `.ovo-breathe-slow`）

### S8 "暂无数据" 文案 8 个变体 — 全角半角不统一（第 2 轮新增）
- **位置**：
  - `SettingsPanel.tsx:340,355,384` `暂无错误` / `暂无日志` / `暂无业务日志`
  - `SettingsPanel.tsx:439` `暂无错误日志。应用运行正常。`
  - `SettingsPanel.tsx:544,652` `暂无注册任务` / `暂无自评结果——明天 ovo 第一次自评后...`
  - `MemoryPanel.tsx:130` `暂无数据`
  - `BootstrapWizard.tsx:204` `(空)`（**半角括号**）
  - `PendingActionsSection.tsx:242` `（空）`（**全角括号**）
  - `OverviewPanel.tsx:86` `空闲`
  - `SettingsPanel.tsx:485` `（黑名单为空——点下方添加）`
- **影响**：用户感受到产品不细致，半角/全角混用是中文排版基础错误
- **建议修复**：建立 `src/components/shared/Empty.tsx` 统一空状态组件 — 插图 + 标题 + 描述 + 引导 CTA，所有 Panel 强制使用

### S4 shared 组件库严重不完整
- **位置**：`src/components/shared/`
- **现状**：仅 12 个组件，且大部分是 10-20 行的简单包装
  - 有的：AnimatedLogo (142) / PermissionGate (200) / OvoLogo (43) / Card / GlowButton / Input / Select / Toggle / StatusBadge / ProgressBar / LogViewer
  - **没有**：Modal / Dialog / Tooltip / Popover / Menu / Tabs / Combobox / Form / Skeleton / Avatar / Divider / Empty / Spinner
- **影响**：高频复用组件不存在 → 各 Panel 各自手写 → 视觉割裂（验证：PendingActionsSection 自己写了 ConfirmDialog，BootstrapWizard 自己写了 Modal 外壳，未来还会有更多）
- **建议修复**：扩充 shared/ — 至少补 `Modal / Dialog / Tooltip / Tabs / Empty` 5 个；现有自定义 modal 全部迁移

---

## 🟡 Inconsistency 问题（7 项）

### I1 暗色主题覆盖不完整
- **位置**：`src/index.css:75-110` 暗色 token 定义
- **现状**：暗色模式定义了大部分 token，但散落的硬编码颜色（B2）完全不响应暗色切换
  - SiriOrb 不论暗/亮始终是绿/紫/黄/红
  - AnimatedLogo 不论暗/亮始终是 #07C160
  - icon-renderer Tray 同上
- **影响**：用户切到暗色 → 主界面变暗 → logo 仍刺眼亮绿
- **复现路径**：Settings → 切暗黑 → 看 FloatingIcon / Tray / AnimatedLogo 是否变化
- **建议修复**：所有色值走 CSS 变量 + 暗色模式所有变量都重定义

### I2 圆角 scale 不统一（rounded-md / lg / xl / 2xl / full 全在用）
- **位置**：散落全 UI
- **现状**：随手 grep 可见
  - `BootstrapWizard.tsx:88` `rounded-2xl`（16px）
  - `PendingActionsSection.tsx:81` `rounded-lg`（8px）
  - 多处 Card `rounded-xl`（12px）
  - 按钮 `rounded-md`（6px）
  - FloatingIcon `rounded-full`（50%）
- **建议修复**：定义圆角 scale 仅 3 档 — `--radius-sm: 8px / --radius-md: 12px / --radius-lg: 16px`，禁用 2xl

### I3 字号跳跃过大无中间过渡
- **位置**：散落
- **现状**：
  - 标题 `text-base`（16px）/ `text-lg`（18px）
  - 正文 `text-sm`（14px）/ `text-[13px]`（hard-code 13px 三次以上）
  - 小字 `text-xs`（12px）/ `text-[11px]` / `text-[10.5px]` / `text-[10px]`
- **影响**：10/10.5/11/12/13/14 六个字号挤在一起，视觉层级混乱
- **建议修复**：type scale 仅 5 档 — 11 / 13 / 15 / 18 / 24，禁用任意 hard-code

### I5 加载状态只有 spinner — 无 Skeleton / 无 ProgressBar（第 2 轮新增）
- **位置**：grep `animate-spin Loader2` × 4 处 / grep `Skeleton` 0 处
- **现状**：数据加载时只用 `<Loader2 className="animate-spin" />`，无骨架屏占位
- **影响**：
  - 用户感受"卡住了" — 不知道还要多久
  - 内容首次出现时直接 pop 出来，缺平滑过渡
  - 列表 / 卡片 / 详情页加载时视觉空白
- **建议修复**：新增 `shared/Skeleton.tsx`（带 shimmer 动画）+ `shared/Spinner.tsx`（标准化）+ 现有 `ProgressBar.tsx` 增加 indeterminate 模式

### I6 响应式断点完全未使用 — 大窗口浪费空间（第 2 轮新增）
- **位置**：grep `sm:|md:|lg:|xl:` 几乎无结果；全代码都是 hard-code 尺寸
  - `BootstrapWizard.tsx:88` `w-[640px] h-[600px]`
  - `FloatingIcon.tsx:249` `w-[280px]`
  - `PermissionGate.tsx:75` `max-w-6xl`（72rem 固定）
- **现状**：Electron 主控台窗口可拉伸到 1600+ 宽，但内容始终居中很小区域
- **影响**：宽屏用户看到大量留白浪费 / 窄屏可能溢出
- **复现路径**：拖大控制台到 1920×1080 → 看主内容是否填充
- **建议修复**：定义 layout breakpoints — `sm: 640 / md: 768 / lg: 1024 / xl: 1280`；大窗口下控制台改为 grid 双栏布局

### I7 颜色透明度散落 12+ 个比例 — 无标准 opacity scale（第 2 轮新增）
- **位置**：grep `/\d+` 透明度后缀
- **现状**：散落 `/5 /8 /10 /15 /20 /30 /40 /50 /55 /60 /85 /95` 等 12 个不同透明度
- **影响**：边框、背景、文字、glow 等使用透明度无标准，视觉权重难以预期
- **建议修复**：定义透明度 scale 仅 5 档 — `/10 /20 /40 /60 /80`，禁止其他

### I4 按钮变体散落（GlowButton 之外还有 3 种风格）
- **位置**：散落
- **现状**：
  - GlowButton（主按钮，蓝色填充）
  - 内联 icon-only 按钮（如 PendingActionsSection.tsx:226 X close）
  - 纯文字按钮（如 BootstrapWizard.tsx:229 "跳过，以后再说"）
  - 边框按钮（如 PendingActionsSection.tsx:218 "不执行"）
- **影响**：用户对"什么是可点击"无法形成固定预期
- **建议修复**：定义 3 个变体（primary / secondary / ghost） + 1 个 icon-button，shared/Button.tsx 统一导出

---

## 🟡 测试残留视觉问题（2 项 — 用户特别强调）

### T2 半角 `⚠` vs 全角 `⚠️` emoji 混用 — 跨平台渲染不一致（第 2 轮新增）
- **位置**：
  - 半角 `⚠`（无 variation selector）：`OverviewPanel.tsx:111` / `SettingsPanel.tsx:236` / `PipelineDetail.tsx:342`
  - 全角 `⚠️`（带 variation selector U+FE0F）：散布部分 toast 文案
- **现状**：同一警告符号有两种 Unicode 表示 — 半角是 text-style，全角触发 emoji-style
- **影响**：
  - macOS 上半角 ⚠ 可能渲染为黑白文字字符，全角 ⚠️ 渲染为彩色 emoji
  - 同一界面看到 `⚠ 文本` 和 `⚠️ 文本` 视觉风格断裂
- **复现路径**：在 macOS 上看 OverviewPanel.tsx:111 vs toast 警告文案
- **建议修复**：统一弃用 emoji 当 icon（参考 B5），改用 lucide `<AlertTriangle />` 组件

### T1 docs/ui-design/ 下存放 HTML 设计参考但未用作单一源
- **位置**：`docs/ui-design/ovo_brand_wechat_green.html` + `ovo_logo_expressions.html`
- **现状**：文件名就叫 `wechat_green`（微信绿）— 与 CSS 注释"避免与微信冲突"的意图矛盾。这两个 HTML 是设计探索 mockup，应该是 design system 的起点，但实际代码完全没遵循
- **影响**：设计师产出与开发实施分离 — 设计探索仅停留在 HTML mockup
- **建议修复**：要么把 mockup 提升为 "design tokens 源"（导出色板、字号、组件库），要么明确标记为"历史探索，不再参考"

---

## 关键设计反模式（系统性问题）

### 反模式 1：Logo 是"装饰"不是"系统"
当前 logo 散落在 3 个文件，每次新场景都重画一遍。**Logo 应该是品牌系统的 source of truth** — 一处定义，所有场景渲染。

### 反模式 2：Design tokens 是"建议"不是"强制"
CSS 定义了完整 tokens 但代码大规模绕过。**Design tokens 必须 ESLint 强制** — 任何 hex / rgb 字面量都报错。

### 反模式 3：状态机视觉分散在每个组件
同一个"thinking"概念三个组件三套实现。**状态机必须中心化** — 1 个枚举 + 1 个 visual mapping。

### 反模式 4：设计文档与代码脱节
`docs/ui-design/` 是 HTML、`docs/product/PRODUCT_PHILOSOPHY.md` 是文字、`src/index.css` 是 CSS — 三处定义彼此不同步。**design system 应该是单一物料库** — code-as-spec 或 spec-as-code。

### 反模式 5：Tailwind 被当成 "utility class 库" 而非 design system 引擎（第 2 轮新增）
项目根本没有 `tailwind.config` 也没用 `@theme` 指令。Tailwind 沦为 "随手写 utility class" 而不是 "把 design tokens 工业化的引擎"。这是 B2/I2/I3/I7 等所有"散落硬编码"问题的根因。
**正确做法**：Tailwind config 是 design system 的代码体现 — 修改一个 token 全产品同步。

---

## 待验证清单（动态更新）

### ✅ 第 2 轮验证 / 立项
- ~~Tailwind config 暴露 tokens 给类名~~ → **CONFIRMED MISSING** 升级为 **B4**
- ~~图标库使用情况~~ → **3 套混用** 升级为 **B5**
- ~~动画 timing function 一致性~~ → **4 处分散** 升级为 **S7**
- ~~z-index 层级管理~~ → **5 个魔法数字** 升级为 **S5**
- ~~焦点环实现~~ → **4 种实现** 升级为 **S6**
- ~~加载状态视觉~~ → **只有 spinner，无 Skeleton** 升级为 **I5**

### ⏳ 待验证（剩余 + 第 2 轮新增）
1. **黑暗模式实测**：切换后真实视觉断点在哪
2. **响应式断点 / 大窗口浪费空间** → I6 已立项需实测
3. **打包后 hardcoded 颜色在 macOS 暗色 menu bar 表现**
4. **不同 macOS 版本（Big Sur/Monterey/Ventura/Sonoma/Sequoia）下视觉差异**
5. **macOS 系统字体回退链**（Helvetica → SF Pro → PingFang SC）
6. **国际化时的视觉断裂**（英文长字符串 vs 中文短字符串）
7. **打印 / 截图 / 屏幕录制场景**下 Ovo UI 表现
8. **OS 字体大小放大场景**（系统设置 → 显示器 → 文字大小）

---

## 审计历史

### 2026-05-16 第 1 轮（基线建立）
- 范围：FloatingIcon / AnimatedLogo / icon-renderer 三套 logo / index.css / shared 组件 / 命名一致性
- 产出：12 个设计问题（B×3, S×4, I×4, T×1）+ 4 个系统性反模式
- 核心判断：
  - **B1 三套 Logo 视觉系统并存** — 用户感受到"三个不同的产品"
  - **B2/B3 5 套色板绕过 design tokens + 注释与代码矛盾**
  - **S1 状态机三套命名 + 颜色映射**
  - **S3 副标题 6 处 6 个定义**

### 2026-05-16 第 2 轮（Tailwind / 图标 / 动画 / z-index / focus）
- 范围：tailwind.config 检查 / lucide vs emoji vs 手画 SVG 对比 / @keyframes 散布 / z-index / focus ring 实现 / 加载状态 / 响应式 / 透明度 scale
- 产出：10 个新设计问题（B×2, S×4, I×3, T×1）+ 1 个新反模式
- 核心判断：
  - **B4 项目根本没有 tailwind.config 文件** — 这是 B2/I2/I3/I7 等所有"散落硬编码"问题的**根因**
  - **B5 lucide / 手画 SVG / Emoji 三种图标系统混用** — 同一界面视觉风格分裂 + 跨平台渲染不可控
  - **S5 z-index 5 个魔法数字** — Modal/Toast/Dropdown 层级不可预测
  - **S6 焦点环 4 种实现** — 键盘可访问性视觉跳变
  - **S7 动画 @keyframes 散落 4 处 + 10 个不同 duration** — 无 motion scale
  - **S8 "暂无" 文案 8 个变体** + 全角/半角括号混用 — 中文排版基础错误
- 下一轮建议聚焦：
  - **跨窗口实拍对比**：截图 main console / floating / toast 三窗口同状态视觉差异
  - **macOS 系统级集成**：menu bar 表现 / 系统暗色切换实时性 / 字体回退链
  - **国际化视觉断裂**：英文长字符串 vs 中文短字符串布局崩
  - **OS 字体放大场景**：系统设置放大文字 → Ovo UI 是否破版

### 2026-05-21 修复轮（配色一致性统一）✅
- 触发：创始人 dogfood 时一眼发现"系统蓝 / 图标黄 / 悬浮球绿紫"不一致（验证了 B1/B2/B3/B4/S1）
- 决策：**品牌主色统一到 systemBlue `#007aff`**，状态色从主色派生
- 修复 commit：`4609d82` fix(ui): 统一品牌色到 systemBlue
- 已解决的问题：
  - ✅ **B1 三套 Logo 视觉系统** → icon-renderer 改 navy + systemBlue（修了 R/B 通道 bug），重新生成 `build/icon*.png` + `.icns`
  - ✅ **B2 5 套色板** → 全部归一到 systemBlue token 体系
  - ✅ **B3 主题色概念矛盾** → 去掉微信绿 `#07C160`，AnimatedLogo 改读 `var(--state-*)` CSS 变量
  - ✅ **B4 无 tailwind.config 根因** → `index.css` 用 Tailwind v4 `@theme` 暴露 tokens 为类名（`bg-accent` 等）
  - ✅ **S1 状态机三套颜色** → FloatingIcon orb / AnimatedLogo / CSS state tokens 现统一从 systemBlue 派生（idle→systemBlue / thinking→indigo / acting→green / alert→orange）
- 对应 GitHub issues：#26 / #27 / #28（已在 PR #29 关联，merge 后自动关闭）
- 仍待处理：B5（emoji vs lucide 图标系统，见 issue #3）、S5（z-index）、S6（focus ring）、S7（动画 scale）、S8（空状态文案）
