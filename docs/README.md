# Ovo 文档导航

更新时间：2026-05-24

本目录按“当前要读”和“历史归档”重新整理。新开发优先读当前文档；旧审计、旧方案、过期状态放入 `archive/`，只作为背景资料。

## 当前文档

### 产品与体验

- [`product/PRODUCT_PHILOSOPHY.md`](product/PRODUCT_PHILOSOPHY.md)：产品宪法，定义 Ovo 为什么存在、什么不能妥协。
- [`product/PRODUCT_EXPERIENCE_BACKLOG.md`](product/PRODUCT_EXPERIENCE_BACKLOG.md)：当前产品体验待执行清单，按 P0/P1/P2 排序。
- [`product/AGENT_PHILOSOPHY.md`](product/AGENT_PHILOSOPHY.md)：Agent 产品观，两类 agent 与 Ovo 的定位。
- [`product/USE_CASES.md`](product/USE_CASES.md)：用户场景与价值时刻。
- [`product/PRIVACY.md`](product/PRIVACY.md)：隐私、数据流和本地优先边界。
- [`UNRESOLVED_ISSUES.md`](UNRESOLVED_ISSUES.md)：当前仍未解决的问题，只保留还需要处理的事项。

### 工程实现

- [`engineering/ARCHITECTURE.md`](engineering/ARCHITECTURE.md)：Electron / Renderer / Pipeline / KG 总体架构。
- [`engineering/ELECTRON_IPC_MAPPING.md`](engineering/ELECTRON_IPC_MAPPING.md)：IPC 通道与 payload 契约。
- [`engineering/AI_BACKENDS.md`](engineering/AI_BACKENDS.md)：AI 后端选择、配置和取舍。
- [`engineering/TESTING.md`](engineering/TESTING.md)：本地验证、测试命令和前置条件。

### 运营与协作

- [`operations/CONTINUATION_PLAN.md`](operations/CONTINUATION_PLAN.md)：上一阶段接续计划，保留给后续排期参考。
- [`operations/RELEASE_PROCESS.md`](operations/RELEASE_PROCESS.md)：发版流程。
- [`operations/GITHUB_GROWTH_PLAN.md`](operations/GITHUB_GROWTH_PLAN.md)：GitHub 增长与发布包装计划。
- [`operations/GOOD_FIRST_ISSUES.md`](operations/GOOD_FIRST_ISSUES.md)：适合新贡献者的任务。

### 视觉资产

- [`assets/README.md`](assets/README.md)：截图、演示 GIF/MP4 和原始素材说明。
- [`ui-design/`](ui-design/)：历史 UI/品牌实验 HTML，当前仅作设计参考。

## 归档

### 旧审计报告

- [`archive/audits/UX_AUDIT.md`](archive/audits/UX_AUDIT.md)
- [`archive/audits/UI_DESIGN_AUDIT.md`](archive/audits/UI_DESIGN_AUDIT.md)
- [`archive/audits/BUG_REPORT.md`](archive/audits/BUG_REPORT.md)
- [`archive/audits/REVIEW_REPORT.md`](archive/audits/REVIEW_REPORT.md)

这些文档包含很多已修复问题，不能直接当作当前 backlog 使用。当前待办以 [`UNRESOLVED_ISSUES.md`](UNRESOLVED_ISSUES.md) 和 [`product/PRODUCT_EXPERIENCE_BACKLOG.md`](product/PRODUCT_EXPERIENCE_BACKLOG.md) 为准。

### 历史设计规格

- [`archive/specs/`](archive/specs/)：2026-04 nudge / OCR / Claude 集成时期设计稿。

### 历史状态与复盘

- [`archive/history/STATUS.md`](archive/history/STATUS.md)：2026-04-15 实现状态快照，已过期。
- [`archive/history/REFLECTION_LOG.md`](archive/history/REFLECTION_LOG.md)：历史反思记录。
- [`archive/community/FOUNDER_STORY.md`](archive/community/FOUNDER_STORY.md)：社区传播素材，非当前产品规格。

## 推荐阅读顺序

1. 先读 [`product/PRODUCT_PHILOSOPHY.md`](product/PRODUCT_PHILOSOPHY.md)，确认产品边界。
2. 再读 [`product/PRODUCT_EXPERIENCE_BACKLOG.md`](product/PRODUCT_EXPERIENCE_BACKLOG.md)，选择当前产品体验任务。
3. 做工程改动前读 [`engineering/ARCHITECTURE.md`](engineering/ARCHITECTURE.md) 和 [`engineering/ELECTRON_IPC_MAPPING.md`](engineering/ELECTRON_IPC_MAPPING.md)。
4. 提交前按 [`engineering/TESTING.md`](engineering/TESTING.md) 跑验证。
