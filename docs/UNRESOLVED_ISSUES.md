# Ovo 未解决问题清单

> 只列**当前仍未解决**的问题。已解决的压缩到底部「归档」。
> 最近更新：2026-05-21（大迭代落 main 后清理）

---

## 🟡 可立即做

| ID | 问题 | 修复方向 | 文件 |
|---|---|---|---|
| **R4-2** | Lv.3 自动执行没有 5 秒撤销窗（`startUndoWindow` 是死代码）| receipt toast 加"撤销"按钮，5s 内可回滚（至少 copy_to_clipboard 恢复旧剪贴板）| `action-executor.ts` `PendingActionsSection.tsx` |
| **i18n 长尾** | 深层插值标签未双语：回放详情、实体详情统计、FloatingIcon tooltip、Onboarding 引导、设置页 隐私/关于 section | 同 P1 模式：加 key + useTranslation | `PipelineDetail.tsx`(约42行中文) 等 |
| **R1** | TTS 首次无引导（默认关，用户不知道）| 第一次点朗读时弹"开启会发到 Edge TTS，要开吗？"one-click | `SuggestionToastWindow.tsx` |
| **R2** | macOS 自动化权限（提醒/邮件）首次无教学 | PermissionGate 加"自动化权限"引导 | `PermissionGate` |
| **CODE-21/22** | IPC payload 仍约 8 处 `any`，类型双向化破窗 | 补 OvoInvokePayloadMap / 事件 payload 类型 | `src/types/ovo.d.ts` 等 |

## 🏗 工程债（独立 PR）

| ID | 问题 | 备注 |
|---|---|---|
| **E1** | `knowledge-graph.ts` 仍 ~2838 行 | migrations 已抽出；可继续抽 DraftStore/InflationStore/LogStore |
| **E3** | 手写 modal 未迁 `shared/Modal` | BootstrapWizard / PermissionGate 等 |
| **UX 长尾** | UX-17~22 | 双层阴影 / Toggle 弹簧动画 / overlay 滚动条 / AboutPanel 用 alert / PipelineStageCard 黑底 |

## ⏸ 受外部条件阻塞

| ID | 问题 | 阻塞点 |
|---|---|---|
| **E2** | Apple 代码签名 | 需 Developer 账号 + 证书 → 解决后 keychain 弹窗 / Gatekeeper 一并好 |
| **#2** | entities/relationships 字段加密 | 等签名才有意义；且 `aliases` 用于匹配不能加密 |
| **全库加密** | SEC-8 目前只字段级（memory_events.content/summary）| 需 N-API 兼容的 SQLCipher 绑定 |
| **F** | 依赖 53 漏洞（17 high）| 需独立一轮升级 + 全回归 |

## 🙋 需用户定位

- **U9**：浅色模式文字 / 图谱展示 / 列表筛选。主题已改跟随系统、硬编码色已迁 CSS 变量、列表已改时间线 → **理论上多半已解决**，待用户截图确认或关闭。

---

## ✅ 归档（已解决）

**2026-05-21 大迭代（已落 main，dogfood 验证）**
- 动作执行链路：等确认重平衡（可逆自动 / 发送类确认）· R3-1 parseAction 丢 evidence 根因 · 杜绝 claude -p · 可执行 action toast（执行/忽略，防重叠刷屏）· R4-1 抢屏动作回退确认 · R2-1 草稿 promote 确认 · R2-2 草稿过期 · R5-2 promote 孤儿草稿
- T8 反向校准（evidence_inflation 自学习闭环）
- KG schema 拆分（接通 migrations.ts，−380 行）
- 安全/隐私：A1 keychain 弹窗（默认明文，签名前）· sandbox:true · will-navigate 白名单 · dev pipeline 生产禁用 · 清理数据二次握手 · SEC-1/2/3/4/11 注入面
- prompt 一致性：R6-1 删死代码 buildAdaptivePrompt · R6-2 requireConfirm 对齐
- evidence-grounder R3-2 中文 n-gram
- UI：图标 R/B 通道 bug（棕橙→systemBlue）· 悬浮球配色统一 · 主题跟随系统 · windows:get-all 权限错误退避（不再刷屏）· 产出物只展交付物 · 记忆搜索框收窄 · 导出 JSON 解包
- i18n P0–P3：react-i18next + 主进程 i18n-main + 语言切换器 + 5 主视图 chrome + 弹窗 toast + 托盘菜单 + 回执 toast
- 性能/稳定（早前轮次）：CODE-2 Levenshtein→O(n) · CODE-4 fetch 超时 · CODE-8 history 截断 · CODE-14 TTS 取消 · CODE-12 迁移版本化

**更早会话**：用户反馈的 16 个问题中 15 个已修（Action 执行 / 剪贴板 / TTS / OCR 兜底 / 5W 记忆 / 技术回放 / 悬浮球 / 图标 / attributes 翻译等）。

> 详细修复历史见 git log 与 `docs/REFLECTION_LOG.md`、`docs/REVIEW_REPORT.md`（点对点审计报告，保留作存档）。
