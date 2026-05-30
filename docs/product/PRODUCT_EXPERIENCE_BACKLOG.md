# Ovo 产品体验待执行清单

更新时间：2026-05-30

## ✅ 完成状态（2026-05-30）

全部 P0 / P1 / P2 主线已落 main，另接通了 scheduled-actions 到期执行调度。

| 项 | 状态 | 备注 |
|---|---|---|
| P0-1 首启 Setup Checklist | ✅ | `SetupChecklist.tsx`，挂 Overview 顶部 |
| P0-2 First Win 引导 | ✅ | `FirstWinGuide.tsx`，冷启动场景卡 + 5min 诊断 |
| P0-3 主界面隐私状态条 | ✅ | `LiveStatusBar` 补：黑名单命中 / 记忆写入 / AI 后端 |
| P1-1 建议反馈细分 | ✅ | 拒绝原因 → negative_patterns + 设置页规则管理 |
| P1-3 产出物验收台 | ✅ | 状态机 + 失败重试/放弃 + 跳详情 + `action:rerun` |
| P1-2 记忆纠错页 | ✅ | 实体改名 + 敏感记忆删除并不再记录（二次确认+反馈） |
| P2-1 悬浮球人话状态 | ✅ | 原生 title tooltip，零布局占用 |
| P2-2 设置页任务化 | ✅ | 顶部"我想…"快捷任务入口 |

**有意延后的子项**（非验收硬指标，风险/成本考量）：
- P1-2 错误实体**合并**：涉及关系/事件迁移，风险较大，单独一轮做
- P1-2 项目**标记已结束**：需 updateEntityAttributes，小项可后补
- P2-2 设置**搜索过滤** section：已有 sticky 锚点导航替代，搜索框可后补

---

> 目标：把 Ovo 从“能力完整的 AI 控制台”推进到“普通用户能快速获得收益、持续信任、越用越准的桌面助手”。
> 本文只放当前可执行的产品体验问题。历史审计保存在 `docs/archive/audits/`。

## 北极星

用户在首次启动后的 5 分钟内，应该能清楚知道：

1. Ovo 当前能不能工作。
2. Ovo 正在看什么、会不会上传、会不会记住。
3. 自己下一步可以做什么来拿到第一条有用建议。
4. Ovo 做过什么、做成没有、失败怎么补救。
5. 如何把错误建议教回系统，让下次变准。

## P0：激活与信任闭环

### P0-1 首启 Setup Checklist

**问题**：当前首启只有屏幕录制权限引导和画像 Wizard，缺少完整启动路径。用户授权后仍可能因为 AI 后端、API Key、OCR 或自动化权限不可用而不知道为什么“没反应”。

**方案**：新增一个首启检查清单，按状态显示：

- 屏幕录制权限
- 活动窗口识别
- 截图 / OCR 可用
- AI 后端可用
- API Key 或 Hermes 配置有效
- 自动化权限提示（提醒事项 / 日历 / 邮件，按需）
- 第一条建议状态：等待屏幕信号 / 正在理解 / 已生成

**验收标准**：

- 任一关键项失败时，用户能看到“问题是什么、为什么、下一步点哪里”。
- 全部通过后显示“可以开始使用”，并引导进入 First Win 场景。
- 不再需要用户打开设置页排查后端或权限问题。

**相关文件**：

- `src/components/shared/PermissionGate.tsx`
- `src/components/Onboarding/BootstrapWizard.tsx`
- `src/components/Console/SettingsPanel.tsx`
- `src/hooks/useAgentBridge.ts`
- `src/hooks/useOCR.ts`
- `src/hooks/useHealth.ts`

### P0-2 First Win 引导

**问题**：空状态只告诉用户“Ovo 正在观察”，但没有告诉用户怎样触发价值。主动助手如果第一分钟没有产出，用户会认为它不可用。

**方案**：在首启完成后提供 3-5 个可操作场景卡：

- 打开一封邮件草稿，让 Ovo 准备回复建议。
- 打开会议纪要，让 Ovo 提取待办和提醒。
- 打开代码 TODO，让 Ovo 建议下一步修复。
- 打开调研网页，让 Ovo 总结并生成后续动作。

**验收标准**：

- 用户能主动选择一个场景并看到“正在观察这个场景”的反馈。
- 5 分钟内未出现建议时，界面给出明确原因：权限、后端、屏幕内容不足、无可执行机会。
- First Win 完成后不再反复打扰。

**相关文件**：

- `src/components/SuggestionPanel/SuggestionPanel.tsx`
- `src/components/Console/OverviewPanel.tsx`
- `electron/event-processor.ts`
- `electron/adaptive-prompt.ts`

### P0-3 主界面隐私状态条

**问题**：隐私能力很完整，但用户需要实时知道 Ovo 此刻在做什么。设置页里的隐私配置不足以形成持续信任。

**方案**：在主界面常驻显示：

- 正在观察的 App / 窗口
- 最近一次截图 / OCR 时间
- 当前是否暂停
- 当前数据是否会写入记忆
- 当前是否会调用在线服务（AI 后端 / TTS）

**验收标准**：

- 用户不进设置页也能判断 Ovo 是否在观察。
- 暂停、恢复、黑名单命中时状态即时更新。
- 对在线服务调用有明确标识，不用营销文案替代真实状态。

**相关文件**：

- `src/components/Console/LiveStatusBar.tsx`
- `src/components/Console/OverviewPanel.tsx`
- `src/components/shared/PermissionGate.tsx`
- `electron/auto-capture.ts`
- `electron/sensitive-filter.ts`

## P1：学习与成果闭环

### P1-1 建议反馈细分

**问题**：当前“想要 / 不想要 / 取消”只能表达一次性态度，不能训练系统。用户真正想说的是“哪里错了”。

**方案**：给建议和动作增加轻量反馈原因：

- 不相关
- 理解错了
- 太早提醒
- 太打扰
- 这个 App 不要提醒
- 永远不要这样做
- 这条很好，以后多做

**验收标准**：

- 反馈原因写入 `negative_patterns` 或相应反馈表。
- 后续 prompt 能读到并约束同类建议。
- 用户能在记忆 / 设置里查看和撤销“教过 Ovo 的规则”。

**相关文件**：

- `src/components/SuggestionPanel/SuggestionCard.tsx`
- `src/components/SuggestionPanel/PendingActionsSection.tsx`
- `src/components/Console/SuggestionsPanel.tsx`
- `electron/knowledge-graph.ts`
- `electron/adaptive-prompt.ts`

### P1-2 记忆纠错页

**问题**：记忆页有图谱和时间线，但普通用户纠错成本高。主动助手必须允许用户修正“你对我的理解”。

**方案**：新增“我的画像”编辑体验：

- 角色、兴趣、当前项目可直接编辑。
- 过期项目可标记为已结束。
- 错误实体可合并、删除、改名。
- 敏感记忆可一键删除并加入不再记录规则。

**验收标准**：

- 用户不需要理解图谱也能修正核心画像。
- 修改后立即影响后续 prompt。
- 删除或屏蔽敏感记忆有二次确认和结果反馈。

**相关文件**：

- `src/components/Console/MemoryPanel.tsx`
- `src/components/Onboarding/BootstrapWizard.tsx`
- `electron/ipc/kg.ts`
- `electron/ipc/privacy.ts`
- `electron/knowledge-graph.ts`

### P1-3 产出物验收台

**问题**：产出物页展示未来提醒和历史动作，但没有突出“是否真的完成、在哪里完成、失败怎么补救”。

**方案**：把产出物页改成验收台：

- 待验收：邮件草稿、提醒、日历、剪贴板、搜索结果。
- 已完成：可跳转原 App。
- 失败：显示原因、重试、改参数、放弃。
- 需要用户继续：例如邮件草稿待发送。

**验收标准**：

- 每个产出物都有状态：待验收 / 已完成 / 失败 / 已放弃。
- 失败项有下一步动作，不只显示错误文本。
- 用户可以从产出物页回到对应 Action 详情。

**相关文件**：

- `src/components/Console/OutputsPanel.tsx`
- `src/components/Console/ActionHistoryPanel.tsx`
- `src/components/Console/ActionDetailDrawer.tsx`
- `electron/action-executor.ts`
- `electron/ipc/outputs.ts`

## P2：可发现性与日常使用

### P2-1 悬浮球人话状态

**问题**：悬浮球颜色和动画表达状态，但用户不一定知道含义。

**方案**：在 hover 或点击前短提示中显示一句状态：

- 正在看 Safari
- 有 2 条建议
- 已暂停 15 分钟
- AI 后端不可用
- 正在生成建议

**验收标准**：

- 不扩大悬浮窗常驻占用。
- 状态文案和主界面一致。
- 未读建议点击后清零逻辑不变。

**相关文件**：

- `src/components/FloatingIcon/FloatingIcon.tsx`
- `electron/window-manager.ts`
- `electron/ipc/system.ts`

### P2-2 设置页任务化

**问题**：设置页功能完整但偏系统配置，不适合普通用户快速完成任务。

**方案**：把设置页顶部改成任务入口：

- 我想暂停观察
- 我想屏蔽某个 App
- 我想降低打扰
- 我想检查 AI 后端
- 我想导出 / 删除数据

**验收标准**：

- 常见任务 1-2 次点击可达。
- 高级配置仍保留，但默认折叠。
- 设置搜索可以过滤到具体 section。

**相关文件**：

- `src/components/Console/SettingsPanel.tsx`
- `src/components/shared/Card.tsx`

## 指标

- **TTFV**：从首次启动到第一条有效建议的时间，目标 < 5 分钟。
- **Activation Rate**：完成 Setup Checklist 并看到第一条建议的比例。
- **Suggestion Hit Rate**：用户点击“想要 / 执行”的建议占比。
- **Correction Rate**：用户反馈“理解错 / 不相关”后，同类错误复发率。
- **Trust Actions**：暂停、黑名单、删除记忆、查看回放的使用率。
- **Output Completion Rate**：产出物最终完成或验收的比例。

## 执行顺序

1. P0-1 首启 Setup Checklist
2. P0-2 First Win 引导
3. P0-3 主界面隐私状态条
4. P1-1 建议反馈细分
5. P1-3 产出物验收台
6. P1-2 记忆纠错页
7. P2-1 / P2-2 日常可发现性优化
