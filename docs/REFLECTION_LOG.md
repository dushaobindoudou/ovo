# Ovo 主动性 vs 准确性 反思日志

> 由 `/loop 20m` 周期反思生成，每轮在上一轮基础上深入，不重复结论。
> 下次循环读这份文档继续。

---

## 反思 #1 — 信号强度模型（2026-05-17）

### 核心论断

**当前的"主动 vs 准确"假设是错的二元**。真问题是：LLM 输出的每条 action 没有附带"我有多确定"的元数据，导致 S4 级瞎猜和 S2 级真信号被同等对待。

### 信号强度分级

| 等级 | 主动度 | 例子 |
|---|---|---|
| **S1 direct**（用户显式表达） | 100% 主动 | 输入框打"帮我写个回复"、选中文本并说"复制"、菜单点了 action |
| **S2 inferred**（行为模式明确） | 80% 主动 | Mail 写邮件 + 已知客户 + 段落不完整 → 帮拟草稿 |
| **S3 暗示**（屏幕内容暗示） | 50% 主动 | 日期 + "记得"关键词 → 也许是 todo |
| **S4 speculative**（自由想象） | 0% 主动（只生成 suggestion 不执行） | 看到 IDE 代码 → 想象"用户想 audit code" |

### 之前几轮修改回顾

- copy_to_clipboard trust 3→2 + prompt 加约束 → 矫枉过正，Ovo 变被动
- source 字段（user_screen / ovo_generated）→ 方向对，但还是全局二分
- sanitize 层（后端 text-sanitize.ts + 前端 utils/sanitizeText.ts）→ 解决"内容污染"，没解决"主动性失衡"
- prompt 强约束 reply/next_step 必须带成品 → 在缓解 "suggestion 空话" 问题

### 当前应用现状的具体观察

1. `AgentAction.reason` 字段已存在但 prompt 没强制填，浪费了
2. `source` 我只加在 copy_to_clipboard，create_todo / send_email 等同样需要
3. suggestion 没 confidence，UI 一视同仁展示

### 提出的最小动作

1. prompt 显式化信号分级，要求每条 action/suggestion 带 `evidence_level`
2. `actionExecutor.execute()` 入口看 evidence_level：speculative 拒绝执行，转 system_log
3. 长期跟 hermes skill router 合流：skill 自己声明 `min_evidence_level`

---

## 反思 #2 — 谁来标 evidence？第三种状态？反向校准？（2026-05-18）

### #1 的盲区：LLM 自报 evidence 不可靠

如果只让 LLM 在 JSON 里填 `evidence_level: "inferred"`，**它会一律说 inferred**，因为：
- LLM 训练倾向于"显得有依据"
- 自报置信度跟实际可信度不挂钩（幻觉对 LLM 自己感觉就像有根据）
- 没有惩罚机制

**所以 evidence_level 必须由运行时客观信号背书，不是 LLM 自评。**

### 新洞察 1：observable evidence 验证

主进程加一个 grounding validator：
- LLM 自报 `evidence_level: "inferred"` + `evidence: ["用户在收件人栏输入了 wang@xx.com", "subject 字段是空的"]`
- 主进程取 OCR preview / window title / 输入流，检查 evidence 字符串是否真在屏幕上找得到
- 找得到 → 升级为 `grounded`（执行）
- 找不到 → 降级为 `unverified`（进草稿台）

这是**结构性反幻觉**，比任何 prompt 改文字都硬。

### 新洞察 2：第三种状态 —— 草稿台 (drafts pane)

当前只有两种状态：
- 自动执行（trust ≥ 3）
- pending 等用户确认（trust < 3）

**inferred 级 action 应该走第三种**：**"我做好放这了，但没出手"**（剧院道具准备好）

草稿台 ≠ pending：
- pending 是"等你按一下按钮，我立刻执行" — 焦点在"你要不要让我做"
- 草稿台是"我已经做完一版放这了，你看看用不用" — 焦点在"成品在这"

这把"主动 vs 准确"从 yes/no 执行 → 变成 yes/no 准备。**准备永远是安全的，准备好的东西是否动用由用户决定**。

之前 task #30 提的"刚生成的草稿"卡片正好就是这个，但当时没说清产品定位。

### 新洞察 3：撤销窗 per-level 化

之前我把 5s undo 删了改"立即执行"，因为用户嫌烦。但这是对所有 action 一刀切。应该 per-level：
- **direct**：立即执行无撤销（用户说了，不需要安全网）
- **inferred + grounded**：5s undo（轻保护）
- **inferred + unverified**：进草稿台（不执行）
- **speculative**：不进入 action 队列，转 suggestion

### 新洞察 4：反向校准 —— 用户拒绝回流到 prompt

即使有客观 grounding，LLM 仍会犯错。需要闭环：
- 用户拒绝 action / 删除草稿 → KG 标记 `(app_name, intent, action_type)` 组合 `inflation_score += 1`
- 累积 ≥ 3 → adaptive-prompt 自动注入"在 X 场景下，你过去夸大了 evidence，请保守"
- 这是 hermes skill router 之外的独立改进路径，每个用户 Ovo 的"主动性曲线"会自我校准

### 反思 #2 下一步可执行最小动作

不是只加 `evidence_level`，而是整套：

1. **prompt 改造**：
   - 每条 action 必填 `evidence_level` + `evidence: string[]`（具体证据 1-3 条）
   - 写不出具体 evidence → 转 suggestion，不要进 actions 数组
2. **后端 grounding validator**（`electron/evidence-grounder.ts`）：
   - 接收 action + ocrPreview + windowTitle
   - 检查 evidence 字符串子串匹配率 ≥ 50% → `grounded`，否则 `unverified`
3. **action-executor 路由**：
   - direct → 立即执行
   - inferred + grounded → 立即执行 + 5s undo
   - inferred + unverified → 写入草稿台，不执行
   - speculative → 拒绝执行 + system_log
4. **草稿台 UI** —— OverviewPanel 新增模块（接管原 task #30）
5. **反向校准** —— KG 加 `inflation_score` 表，adaptive-prompt 注入相关场景的保守提示

---

## 收敛判断

**反思 #2 之后，框架已经基本完整**：
- WHO labels evidence（runtime grounding）
- WHAT 三种状态（执行 / 草稿台 / 拒绝）
- HOW 撤销窗 per-level
- LEARNING 反向校准

再深一轮可能就是重复或纯实现细节。**判断：收敛，进入编码阶段**。

---

## 编码任务（从反思 #2 落地）

按优先级：

- [ ] T1. prompt：每条 action 必填 evidence_level + evidence[]
- [ ] T2. `types.ts`：AgentAction 加 evidence_level + evidence 字段
- [ ] T3. `evidence-grounder.ts`：grounding validator 实现
- [ ] T4. `action-executor.ts`：execute 入口按 grounded 状态分流（执行 / 草稿台 / 拒绝）
- [ ] T5. KG：drafts 表 schema + addDraft / listDrafts / consumeDraft / deleteDraft
- [ ] T6. IPC: `drafts:list` / `drafts:promote` / `drafts:dismiss`
- [ ] T7. OverviewPanel: 草稿台卡片（标题"Ovo 准备了，你来定"）
- [ ] T8. （次轮）反向校准 inflation_score

T1-T4 是 MVP，做完就能验证"准确的主动"。T5-T7 让草稿台可见。T8 留下个会话。
