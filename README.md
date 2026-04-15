# ovo

主动式 AI 桌面助手（Electron + React + SQLite + 多 Agent 后端）。

## 开发

```bash
pnpm install
pnpm dev
```

## 核心能力

- 三窗口架构：控制台界面 / 悬浮球 / 建议面板
- 5 秒 OCR 捕获 + 15 秒 Agent 批处理
- AgentBridge：Claude Code / OpenClaw / Hermes / API fallback
- 知识图谱记忆（entities / relationships / memory_events / pipeline_logs）
- Pipeline 全链路日志与节点评价反馈
- 定期截屏自检（可配置间隔与开关）

## 文档

- 文档导航：`docs/README.md`
- 当前状态：`docs/STATUS.md`
- 测试说明：`docs/TESTING.md`
- 接续计划：`docs/plans/CONTINUATION_PLAN.md`
