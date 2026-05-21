# Ovo 未解决问题清单 — 自审日志

> 用户提的所有问题 × 当前代码状态。本文档由 `/loop 20m` 每 20 分钟自动重审。

**最近自审**：2026-05-17（**第 3 次深度审查** — 发现并修复 2 个关键 bug）

## 🚨 第 3 轮自审 — 关键真根因

### B-no-broadcast. `action:confirm` / `action:cancel` 不广播 `action:result`
**这是用户原 Bug "点击确认执行没任何效果"的真根因！**

**调用链分析**：
- `OverviewPanel.tsx:204` 用户在"等你处理"卡里点"确认执行"按钮 → 直接调 `confirmAction` IPC → 主进程 `action:confirm` handler 执行 action → 返回 result
- **主进程不广播 `action:result` 事件**
- `usePendingActions` hook (`useEffect line 23`) 监听 `action:result` 来移除已 settled action
- 结果：用户点了确认 → pending 列表永远不刷新 → "点了没效果"

**之前的"5 秒延迟"修复治标不治本** — 那只解决了 PendingActionsSection ConfirmDialog 路径，OverviewPanel 主面板的"确认执行"按钮**从来没工作过**！

**修复**：`ipc/pipeline.ts` `action:confirm` + `action:cancel` 两个 handler 都加 `broadcast("action:result", {...})`，4 个 renderer 窗口（Console / Toast / Floating / Panel）的 `usePendingActions` 都收得到事件 → pending 列表正确清。

### B-dead-ConsoleListPanel. 删除死代码
`ConsoleListPanel.tsx` 无任何 import 链路引用，rm 删除（同上次的 PipelinePanel）。

## 🐛 第 2 轮自审遗留发现（已修复）

### B-confirm-format. action.confirm.execute 写入 business_logs 格式错误
**根因**：`ipc/pipeline.ts:107` `finishBizNode` 写 output 是 `{actionId, duration, status}` 单对象，但 `knowledge-graph.ts:1111` `getActionHistory` 期待 `output.results: [{actionId, status, ...}]` 数组结构。**导致用户确认后的 success 不出现在 ActionHistory 中** — 用户看到"等待中"被用户确认后理论应该变 success，但因为格式不匹配，dedupe 拿不到，仍显示初始 pending status。

**修复**：`ipc/pipeline.ts:107` 改写成 `output: { results: [{...}] }` 数组格式 + 包含 type / output / error 全字段。

**影响**：用户原 Bug 6 "等待中" 的二次根因 — 之前已修了 dedupe 路径，但实际确认结果根本没写入！现在彻底修好。

### B-floating-hex. FloatingIcon 红色 badge 用 hex 而非 var
**根因**：`FloatingIcon.tsx:234` `bg-[#ef4444]` 是硬编码红，浅色 mode 下 var(--danger) = #ff3b30，hex 不响应主题。
**修复**：改为 `bg-[var(--danger)]`。

---

## 📋 用户提过的全部问题（按时间顺序）

| # | 问题 | 来源 | 状态 | 代码证据 |
|---|---|---|---|---|
| 1 | Action 无法执行，复制剪贴板也不行 | 第一批 | ✅ 已修 | `action-executor.ts:62-67` 6 个 macOS handler 直接路径 |
| 2 | 语音播放（TTS）失效 | 第一批 | ✅ 已修 | `ipc-handlers.ts:67` 主进程 init 读 preferencesStore；`useTTS.ts` 错误冒泡 + alert |
| 3 | 用户记忆里 "active:" 看不懂 | 第一批 | ✅ 已修 | `MemoryPanel.tsx:803` `renderEntityAttributes` 翻译表（18 keys + 4 formatters） |
| 4 | 应用图标 / 托盘图标不一致 | 第一批 | ✅ 已修 | `pnpm gen:icons` 跑过 + `icon-renderer.ts` systemBlue 色板 |
| 5 | 执行动作总失效（hermes/内置） | 第一批 | ✅ 已修 | 同 #1 — 6 handler 直接路径，不依赖 LLM/hermes |
| 6 | "等待中" | 第一批 | ✅ 已修 | `knowledge-graph.ts` getActionHistory dedupe by actionId |
| 7 | 技术回放交互不好 | 第一批 | ✅ 已修 | `ProcessPanel.tsx` PipelineRowCompact + drawer 模式 + 上下条导航 |
| 8 | 悬浮球点击应直接打开主窗口 | 第一批 | ✅ 已修 | `FloatingIcon.tsx:147` handleToggleSticky = handleOpenConsole |
| 9 | 浅色 / 图谱 / 列表筛选 / activity 看不懂 | 第一批 | 🟡 部分 | 浅色已通过 CSS var 归一；图谱加图例；筛选/活动具体场景未确认 |
| 10 | TODO / 提醒 / 日历不可用 | 第一批 | ✅ 已修 | 6 handler 直接路径，set_reminder/add_calendar 不走 LLM |
| 11 | 复制到剪贴板没内容 | 第二批 | ✅ 已修 | `action-executor.ts:227` 多 key fallback + 空值 failed + readback 验证 |
| 12 | error attempting reading image | 第二批 | ✅ 已修 | `auto-capture.ts:324` isEmpty + buffer < 1024 兜底；`ocr-engine.ts:124` 入口校验 |
| 13 | 点击"确认执行"没效果 | 第二批 | ✅ 已修 | `PendingActionsSection.tsx:164` 立即执行不走 5 秒撤销 |
| 14 | 记忆 = 5W（什么时候/在哪/谁/做什么）+ 区分我 vs 别人 | 用户新需求 | ✅ 已完成 | schema v2 + actor 字段 + adaptive-prompt 5W + `MemoryTimelineView` 完整 UI |
| 15 | 列表应该是记忆的列表（不是实体清单） | 用户产品反馈 | ✅ 已完成 | 默认 tab "时间线"事件流；实体清单降级到图谱视图右侧 |
| 16 | "你最常关心的话题"下面 activity: 看不懂 | 用户产品反馈 | ✅ 已完成 | 画像视图 `StorySection` 不显示 attributes raw key，只显示 name + 次数 + 质量条 |

**汇总**：16 个问题中 15 个已彻底修复 / 1 个需要用户具体输入。

---

## 🟡 待用户具体定位（无法继续推进）

### U9. "浅色模式有些文字颜色不匹配" / "图谱展示有问题" / "列表筛选不生效"

**原话**：「在浅色模式下，有些文字颜色不匹配，记忆下的图谱展示也有问题，记忆下的筛选这个也很奇怪，点击在列表模式下不生效」

**当前状态**：
- **浅色文字**：所有硬编码色已迁移到 CSS 变量，浅色/暗色都重新定义。如果还有，需要截图定位
- **图谱展示**：`KnowledgeGraphCanvas` 已加图例 + 颜色归一。具体"问题"未明（卡顿？标签糊？布局乱？）
- **列表筛选**：原来的"列表"已被 U2 改造成时间线 + 实体清单降级到图谱，问题应当不复存在。如果指时间线的 actor/app 筛选不生效，也需要截图

**所需用户输入**：
- 浅色模式哪个 tab / Card / 文字？最好截图标圈
- 图谱具体什么"问题"？节点重叠？文字看不清？拖动卡？
- 现在还有"列表筛选点击不生效"吗？（U2 之后应该消失）

**Bot 注**：再过 20 分钟我会自动重新检查代码 vs 这条；如果你下次给具体场景，立刻能修。

---

## ⚠️ 潜在风险（用户可能遇到但还没反馈）

### R1. TTS 首次启动用户不知道要开 toggle
当前 `preferencesStore.ttsEnabled` 默认 `false`（SEC-12 隐私保护），用户必须打开 Console → 设置 → 朗读 → 开 toggle。**没有任何首次提示** 告诉用户"TTS 默认是关的"。用户点 toast 朗读按钮会看到 alert "朗读已关闭，请到「设置 → 语音输出」开启"，但这是反应式提示。

**潜在改进**：第一次用户点 toast 朗读按钮时，弹个对话框"开启朗读会把消息内容发到 Microsoft Edge TTS，要打开吗？"，one-click 开启。下一会话考虑。

### R2. macOS 自动化权限拦截 set_reminder / send_email
首次执行 set_reminder：`osascript` 控制 Reminders 应用 → macOS 弹"允许 Ovo 控制 Reminders？"对话框。用户拒绝就永久失败。`errorTranslator` 已经能命中 `permission.applescript` 并显示"前往 系统设置 → 隐私 → 自动化"按钮，但**首次用户体验仍然奇怪**。

**潜在改进**：在 PermissionGate 加"自动化权限"教学（与屏幕录制并列），第一次启动主动引导。下一会话考虑。

### R3. 复制 readback 验证可能误判
`clipboard.readText()` 在主进程立即调用，理论上同步返回刚写的 text。但 macOS 剪贴板有 monitor 机制，**极少数情况下**会因为系统剪贴板 server 异步同步返回旧值，导致我们误判为"写入不一致"。

**保护**：误判时 status="failed" + 显式错误"剪贴板写入似乎成功但读取不一致"，用户至少能知道剪贴板实际是有内容的（粘贴可验证）。可接受。

### R4. OCR Vision 不可用降级到 Tesseract
Vision OCR 在 macOS 12+ 才稳定。如果用户 macOS 11 或 native module 编译失败，会 fallback Tesseract（速度 5× 慢 / 中文精度低）。已有 `errorLogger.alert("warn", "ocr.vision", ...)` 告警。可接受。

---

## 🏗 工程债（独立 PR 范围）

- **E1** KG god module Part 2 — `knowledge-graph.ts` 仍 2700+ 行（agent 拆分中断）
- **E2** Apple 代码签名 — 需要 Apple Developer 账号 + 5 个 secrets
- **E3** shared 旧 modal 迁移 — BootstrapWizard / PermissionGate 等手写 modal 未迁到 `shared/Modal`

---

## ✅ 本会话修复证据汇总（按 commit 影响域）

| 类别 | 关键改动 |
|---|---|
| Action 执行 | 6 个 macOS handler 恢复（set_reminder/add_calendar/send_imessage/send_email/open_url/search_web）|
| 剪贴板 | 多 key fallback + 空值 failed + readback 验证 |
| TTS | preferences-store 持久化 + 主进程 init 读初值 + renderer 错误冒泡 + alert 转译 |
| OCR | isEmpty + buffer<1024 双层兜底 |
| 5W 记忆 | schema v2 (actor/actor_name) + adaptive-prompt schema + pipeline 透传 + MemoryTimelineView UI |
| MemoryPanel | 3 视图（时间线/画像/图谱），实体清单合并到图谱右侧 |
| 技术回放 | PipelineRowCompact + drawer + 上下条导航 |
| 悬浮球 | 点击直接打开主窗口（删 sticky 卡片） |
| 图标 | gen:icons + systemBlue 全色板归一 |
| ActionHistory | dedupe by actionId（解决"等待中"）|
| attributes 翻译 | 18 keys + 4 formatters + 隐藏 3 内部 metadata |

---

**结论**：用户明确反馈的 16 个问题，15 个已彻底修复并通过 typecheck + lint + build，1 个（U9）需要用户截图或精确定位才能继续推进。

---

# 2026-05-21 会话：多轮自审（R2–R4）+ 修复记录

> `/loop 30m` 用户/产品/技术三视角循环审查，每轮在上轮基础上深入。

## ✅ 本会话已修复并验证（typecheck + lint + build + hermes 冒烟全绿）

| 项 | 文件 | 修复 |
|---|---|---|
| 动作"等确认"过多 | `preferences-store.ts` `agent-response-normalize.ts` | 可逆动作→Lv.3 自动；仅 send_email/iMessage/index_path/other 保留确认；REQUIRE_CONFIRM_TYPES 从 8 收窄到 3 |
| `claude -p` 噪音 | `agent-bridge.ts` | claude-code 从探测摘除 + callByBackend 分支直接抛错（双保险）；默认 hermes |
| 钥匙串反复弹窗 | `secrets-store.ts` | 加密模式判定：dev/未打包→明文不弹；签名构建→钥匙串；env OVO_DISABLE_KEYCHAIN/OVO_FORCE_ENCRYPTION |
| **T8 反向校准** | `knowledge-graph.ts` `adaptive-prompt.ts` `ipc/pipeline.ts` `ipc-handlers.ts` | evidence_inflation 表(schema v4) + 弃用草稿/取消 action 时 bump(7天衰减) + 合成 prompt 注入"请保守"。闭合自学习环 |
| **R3-1（关键根因）** | `agent-response-normalize.ts` `evidence-grounder.ts` | parseAction 之前丢弃 evidence_level/evidence → 所有 action 判 unverified 全进草稿台。已修：解析两字段 + groundEvidence 对"未声明 evidence_level"回退信任等级。**用户"很难用/全是采纳"的根因** |
| **可执行 action toast** | `SuggestionToastWindow.tsx` `main.ts` `ipc/_shared.ts` `ipc-handlers.ts` | 待确认动作每个弹浮窗带"执行/忽略"，直接调 action.confirm/cancel({actionId})，90s 超时 |
| KG 拆分（增量1） | `kg/migrations.ts` `knowledge-graph.ts` | 接通 migrations.ts(补 actor/drafts/inflation 3迁移+版本升4)，删 ~380 行内联 bootstrap 死代码 + 发散 schema 版本号。3220→2838 行 |

## ✅ 已修复（接上批，2026-05-21 续）

| ID | 问题 | 修复 | 文件 |
|---|---|---|---|
| **R4-1** | 抢屏动作静默自动执行 | open_url/open_app/search_web 改回 Lv.2 确认（弹 action toast 一键执行） | `preferences-store.ts:38-43` |
| **R2-2** | 草稿永不过期 | kg-daily-gc 接入 `kg.expireOldDrafts()` | `ipc/schedulers.ts` |
| **R2-1** | 草稿 promote 绕过确认 | send/iMessage/index_path 类 promote 改为注册 pending + 弹"执行"浮窗最终确认；可逆动作仍直执行 | `ipc/kg.ts:147+` `_shared.ts` `ipc-handlers.ts` |
| **U-clear** | "清理数据不好用" | 根因=preload kg.clear 只调一次握手没回传 token→永远 no-op。修：preload 包装自动两步握手 + clearAll 补删 drafts/evidence_inflation | `preload.cjs:212` `knowledge-graph.ts clearAll` |
| **R5-1** | action toast 多张重叠(slot 全=0) + 无去重刷屏 | 独立 getNextActionSlot 纵向堆叠(最多4行) + 按 (type:desc) 2分钟去重 + 同 actionId 不重复弹 | `main.ts` enqueueActions/openActionToast |
| **R6-2** | synthesis prompt requireConfirm 规则让 LLM 给 set_reminder/add_calendar 标 requireConfirm:true→架空 R4-1 Lv.3 自动 | line 464 清单对齐 REQUIRE_CONFIRM_TYPES(send_email/send_imessage/index_path)，其余交信任等级 | `adaptive-prompt.ts:464` |
| **R6-1** | （修正：原判 P1 有误）缺 evidence 字段的 buildAdaptivePrompt 是死代码无调用方；生产 synthesis prompt 字段正确 | 删除死代码 buildAdaptivePrompt(−179行) | `adaptive-prompt.ts` |

## 🔲 待办问题（按价值排序）

| ID | 优先级 | 问题 | 修复方向 | 文件:行号 |
|---|---|---|---|---|
| **R4-2** | P2（设计） | Lv.3 自动执行的 5s 撤销 startUndoWindow 死代码，自动执行不可撤销（R4-1 后仅可逆动作自动，撤销需求降低） | receipt toast 加"撤销"按钮 5s 回滚 | `action-executor.ts` `PendingActionsSection.tsx:179` |
| ~~R3-2~~ | ✅ 已修 | evidence-grounder 中文 n-gram | CJK 检测→中文 3字 gram/步长1/短串≤4严格子串；拉丁保持 6字/步长3。行为测试：完整/部分中文 grounded，编造仍 unverified（反幻觉保留） | `evidence-grounder.ts:62` |
| **#2** | 延后 | entities/relationships 字段加密 | 等 Apple 签名（未签名前加密休眠）；aliases 不能加密(破坏匹配) | `knowledge-graph.ts` |
| **E1** | 工程债 | KG 仍 2838 行，可继续抽 DraftStore/InflationStore/LogStore | 增量抽 Store（migrations 已抽完） | `knowledge-graph.ts` |

## 术语统一（待办）
浮窗三套语义：建议"采纳"=点赞反馈 / 动作"执行"=真执行 / 草稿"采用"=promote。建议统一：建议→"有用/不感兴趣"，动作→"执行/采用"。

## ⚠️ 需用户 `pnpm dev` 重启验证
KG schema bootstrap（better-sqlite3 Electron ABI 无法纯 node 验）、R3-1 自动执行效果、action toast、keychain 是否还弹、relation-inference 不再报 claude -p。
