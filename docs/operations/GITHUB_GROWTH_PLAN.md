# Ovo GitHub 增长整改方案

> 目标：从当前 0 stars / 仅一行 description 的"裸 repo"，**90 天内成长为 1000+ stars 的世界级开源 AI 桌面项目**。
> 调研基础：Khoj (26k⭐) / AnythingLLM (30k⭐) / Open Interpreter (60k⭐) / Pake (38k⭐) / ChatGPT-Next-Web (79k⭐) / Reor (7k⭐) 等同类成功项目的实战路径。

**最后更新**：2026-05-17

---

## 一、现状诊断（一图看清差距）

### 当前 GitHub 仓库状态
```
Repository: https://github.com/dushaobindoudou/ovo
Description: "ovo"  ← 只有 3 个字符，0 SEO 价值
Topics:      []  ← 完全为空，搜索不到
Stars:       0
Forks:       0
Releases:    0  ← 无可下载产物
Issues:      0  ← Discussions 未开启
License:     ❌ 缺失（法律上无人能合规使用）
```

### 必备社区文件审计

| 文件 | 状态 | 影响 |
|---|---|---|
| `LICENSE` | ❌ 缺失 | **企业用户直接划走** |
| `README.md` | ⚠️ 仅 27 行 | hero / demo / 安装全无 |
| `CONTRIBUTING.md` | ❌ 缺失 | 第一个潜在 contributor 找不到入口 |
| `CODE_OF_CONDUCT.md` | ❌ 缺失 | "不够专业"信号 |
| `SECURITY.md` | ❌ 缺失 | 安全研究员无负责披露通道 |
| `CHANGELOG.md` | ❌ 缺失 | 老用户判断"是否升级"无依据 |
| `.github/` 整个目录 | ❌ 不存在 | 无 issue 模板 / 无 CI / 无 release workflow |
| Social preview image | ❌ 缺失 | 分享出去是裸链接 |
| Release artifacts | ❌ 缺失 | 用户必须从源码编译（流失 99%） |

### 一句话诊断

> **Ovo 当前像"一个开发者的本地实验项目"，不像"严肃开源产品"。世界级项目和当前状态的差距，不在代码，在 README 第一屏和 release 页。**

---

## 二、5 件最紧急的事（按 ROI 排序）

> 这 5 件做完，stars 自然增长能到 100-300（无需任何主动推广）。

### 🔥 P0.1 — 重写 README（当前 27 行不及格）

**当前问题**：
- 没有 hero / 没有 demo GIF / 没有截图
- 价值主张被"主动式 AI 桌面助手"一句话带过
- 没有"为什么用 Ovo 而不是 ChatGPT 桌面"的对比
- 没有快速安装入口（要求 `pnpm install + pnpm dev`，门槛极高）

**目标产物**：300-500 行 README，结构如下：
```
1. Hero 区（居中 Logo + Tagline + 徽章群）
2. 30 秒 Demo GIF（核心场景，不是 UI 巡礼）
3. ✨ Why Ovo（3-4 个 bullet，对比其他 AI 助手）
4. 📥 一键下载（DMG 直链，放最上面）
5. 🚀 快速开始（5 分钟跑起来）
6. 📸 截图墙（3-6 张关键场景）
7. 🏗 架构图（一张 SVG）
8. 🗺 Roadmap
9. 💬 Community（Discord/微信群二维码）
10. 🤝 Contributing
11. ⭐ Star History
```

**Hero Tagline 推荐**（5 选 1）：

| 候选 | 优势 | 风险 |
|---|---|---|
| ✨ **`Open-source proactive AI desktop assistant. Sees your screen, suggests next steps, runs 100% on your machine.`** | 4 个 sell（开源+主动+桌面+本地） | 略长 |
| `The proactive AI that watches your screen and acts before you ask.` | 简洁有力 | 缺"本地" |
| `A glass-box AI assistant. Local-first screen awareness, proactive suggestions, every action you can audit.` | 文学性最好 | HN 太软 |

**强烈推荐第 1 个**（最适合 SEO + 工程师审美 + 表达完整差异化）。

中文 README hero：
> **Ovo — 主动看你屏幕的开源 AI 桌面助手。在你提问前给建议，所有动作都可审计。**

---

### 🔥 P0.2 — 加 LICENSE（不加法律上无人能用）

**关键决策**：

| License | 优点 | 缺点 | 推荐？ |
|---|---|---|---|
| **AGPL-3.0** | 防云厂商白嫖你的截屏+AI 能力，强制衍生开源 | 部分企业不能用 | ⭐ **推荐**（Khoj / Open Interpreter 都用） |
| Apache 2.0 | 含专利授权，企业最爱 | 不防白嫖 | 备选 |
| MIT | 最宽松，社区最广 | 对涉及隐私采集的桌面应用不友好 | ❌ 不推荐 |

**直接执行**：根目录新建 `LICENSE` 文件，从 https://choosealicense.com/licenses/agpl-3.0/ 复制全文 + 把版权年/名字改为 `Copyright (C) 2026 dushaobin`。

---

### 🔥 P0.3 — 上传 Social Preview 图（X/Discord 分享的脸面）

**当前问题**：在 X/Slack/Discord 分享 GitHub 链接，显示的是裸链接 + 默认 GitHub 头像，零吸引力。

**做法**：
1. 用 Figma/Canva 做一张 **1280×640 px** 图：左侧 Logo + 右侧 Tagline + 底部"Open source · Proactive · Local-first"
2. GitHub → Settings → Social preview → Upload
3. 用 https://www.opengraph.xyz/ 验证

---

### 🔥 P0.4 — 发布第一个可下载 Release（无 DMG = 无用户）

**当前 electron-builder.yml 已配好**，缺：
- macOS 签名 + Notarization（参考 BUG_REPORT.md C6）
- GitHub Release workflow

**最小可行路径**（暂不强求签名）：
```bash
pnpm pack:mac  # 生成 out/*.dmg
gh release create v0.2.0 out/*.dmg --title "v0.2.0 Public Preview" --notes "First public release"
```

**README 顶部加 download badge**：
```markdown
[⬇ Download macOS DMG](https://github.com/dushaobindoudou/ovo/releases/latest)
```

**注意**：暂无签名时 README 必须告知用户 "macOS 首次启动右键→打开"，否则差评爆炸。

---

### 🔥 P0.5 — 设置 Repository About + Topics（GitHub 搜索 SEO）

**当前**：description 是 `"ovo"`，topics 是 `[]` —— 在 GitHub 搜不到。

**立刻设置**（GitHub repo 主页右上角 ⚙️）：

**Description**（15 词内）：
> `Open-source proactive AI desktop assistant. Watches your screen, suggests next steps, runs 100% local.`

**Website**：填一个落地页 URL（暂可填 README 顶部 GIF demo 链接）

**Topics**（搜索流量入口，加 10-15 个）：
```
electron, ai-assistant, claude, claude-code, screen-ocr, productivity,
desktop-app, proactive-ai, personal-ai, macos, react, typescript,
knowledge-graph, local-first, privacy-first
```

---

## 三、完整 GitHub 优化清单（按文件组织）

### `.github/` 目录（全部缺失，需创建）

```
.github/
├── FUNDING.yml                  # 赞助入口
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml           # YAML form 格式（比 markdown 体验好 10 倍）
│   ├── feature_request.yml
│   └── question.yml
├── PULL_REQUEST_TEMPLATE.md     # PR 模板
└── workflows/
    ├── ci.yml                   # 跑 pnpm test:ci，三平台矩阵
    └── release.yml              # tag → 自动 build + sign + notarize + upload DMG
```

**FUNDING.yml 范例**（中国独立开发者）：
```yaml
github: [dushaobindoudou]
custom:
  - "https://afdian.com/a/dushaobin"   # 爱发电
  - "https://ko-fi.com/dushaobin"      # 海外
```

**bug_report.yml 范例**：
```yaml
name: Bug Report
description: Report a bug to help us improve
labels: ["bug", "triage"]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Describe the bug and what you expected.
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: OS
      options:
        - macOS (Apple Silicon)
        - macOS (Intel)
        - Windows
        - Linux
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Ovo Version
      placeholder: v0.2.0
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs
      description: Settings → 开发者工具 → 错误日志 复制粘贴
      render: shell
```

### 根目录文件（全部缺失，需创建）

| 文件 | 内容要点 |
|---|---|
| `LICENSE` | AGPL-3.0 全文，版权年/名字改对 |
| `CONTRIBUTING.md` | dev setup / commit 规范 / PR 流程 / 代码风格 |
| `CODE_OF_CONDUCT.md` | 直接用 Contributor Covenant 2.1 模板 |
| `SECURITY.md` | 漏洞负责披露邮箱 + 响应 SLA |
| `CHANGELOG.md` | Keep a Changelog 格式（[Unreleased] / v0.2.0 / ...） |
| `README_CN.md` | 中文 README，顶部 `English | 简体中文` 切换 |
| `README.md` | 英文版主，目标海外社区 |

### `package.json` 缺失字段

当前缺：
```json
{
  "homepage": "https://github.com/dushaobindoudou/ovo",
  "bugs": "https://github.com/dushaobindoudou/ovo/issues",
  "repository": "github:dushaobindoudou/ovo",
  "license": "AGPL-3.0",
  "keywords": ["electron", "ai-assistant", "claude", "screen-ocr", "proactive-ai"],
  "author": "dushaobin"
}
```

### Repository 设置（GitHub 网页操作）

| 设置 | 操作 |
|---|---|
| About → description | 见 P0.5 |
| About → topics | 见 P0.5 |
| About → social preview | 上传 1280×640 png |
| Features → Discussions | ✅ 开启 + 创建 Q&A / Show & Tell / Ideas 三个分类 |
| Features → Wiki | ❌ 关闭（用 docs/ 代替） |
| Features → Sponsorships | ✅ 开启 |
| Branches → main | 加 protection rule（require PR review） |

---

## 四、双语 README v2 草稿结构

### 英文版（主 README.md）

```markdown
<div align="center">

<img src="docs/assets/logo.png" width="120" alt="Ovo Logo" />

# Ovo

**Open-source proactive AI desktop assistant.**
**Watches your screen, suggests next steps, runs 100% on your machine.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Build Status](https://github.com/dushaobindoudou/ovo/workflows/CI/badge.svg)](https://github.com/dushaobindoudou/ovo/actions)
[![Release](https://img.shields.io/github/v/release/dushaobindoudou/ovo)](https://github.com/dushaobindoudou/ovo/releases)
[![Stars](https://img.shields.io/github/stars/dushaobindoudou/ovo?style=social)](https://github.com/dushaobindoudou/ovo/stargazers)
[![Discord](https://img.shields.io/discord/XXXX?label=Discord)](https://discord.gg/XXXX)

English | [简体中文](../../README_CN.md)

[⬇ Download for macOS](https://github.com/dushaobindoudou/ovo/releases/latest) ·
[📖 Documentation](docs/) ·
[💬 Discord](https://discord.gg/XXXX) ·
[🐦 Twitter](https://twitter.com/dushaobin)

</div>

---

<p align="center">
  <img src="docs/assets/demo.gif" alt="Ovo Demo" width="800" />
</p>

## ✨ Why Ovo?

While other AI assistants wait for you to ask, **Ovo watches your screen and helps before you have to**:

- 🪟 **Glass-box transparency** — see exactly what Ovo sees, thinks, and does. No magic.
- ⚡ **Proactive, not reactive** — Ovo suggests next actions based on what's on your screen.
- 🎓 **Teachable** — every suggestion can be approved, rejected, or trained ("never do this again").
- 🔒 **Local-first** — screenshots and OCR happen on your machine. Bring your own LLM key.
- 🧠 **Long memory** — built-in knowledge graph remembers entities, relationships, your patterns.

## 🆚 vs. Other AI Assistants

|           | ChatGPT Desktop | Rewind | Cursor | **Ovo** |
|-----------|---|---|---|---|
| Proactive | ❌ | ❌ | Partial (IDE only) | ✅ |
| Transparent reasoning | ❌ | N/A | ❌ | ✅ |
| Screen-aware | ❌ | ✅ (record only) | ✅ (IDE only) | ✅ |
| Teachable | ❌ | ❌ | Partial | ✅ |
| Local-first | ❌ | Partial | ❌ | ✅ |
| Open source | ❌ | ❌ | ❌ | ✅ |

## 🚀 Quick Start

### Option 1: Download (recommended)

[⬇ Download latest DMG for macOS](https://github.com/dushaobindoudou/ovo/releases/latest)

> First launch: right-click the app → Open (until we ship a signed build)

### Option 2: Build from source

```bash
git clone https://github.com/dushaobindoudou/ovo.git
cd ovo
pnpm install
pnpm dev
```

## 📸 Screenshots

[3-6 screenshots with one-line captions]

## 🏗 Architecture

[Insert architecture diagram]

## 🗺 Roadmap

- [x] Multi-pass prompt engine + Knowledge Graph
- [x] 4 AI backends (Claude Code / OpenClaw / Hermes / API)
- [ ] Trust ladder UI (let users set Ovo's autonomy per-action)
- [ ] Glass butler floating window
- [ ] AI behavior timeline (transparent reasoning)

See [PRODUCT_PHILOSOPHY.md](docs/product/PRODUCT_PHILOSOPHY.md) for the long-term vision.

## 💬 Community

- [Discord](https://discord.gg/XXXX) — international community
- WeChat Group — add QR image under `docs/assets/` before linking it here
- [GitHub Discussions](https://github.com/dushaobindoudou/ovo/discussions) — Q&A and ideas

## 🤝 Contributing

Contributions are very welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md).

Good first issues are tagged [`good first issue`](https://github.com/dushaobindoudou/ovo/labels/good%20first%20issue).

## 📄 License

[AGPL-3.0](../../LICENSE) — open source, copyleft. Commercial use requires the same license.

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=dushaobindoudou/ovo&type=Date)](https://star-history.com/#dushaobindoudou/ovo&Date)
```

### 中文版（README_CN.md）

同结构，文案中文化。**关键差异化强调**：
- "100% 本地处理，截图不离开你的电脑"
- "自带 Claude/OpenAI key，不经过任何中转服务器"
- "完整开源 + AGPL，代码可审计"
- "默认不收集任何使用数据"

中国独立开发者发"会截屏的 AI"，**信任成本是海外项目的 10 倍**——必须更强调隐私。

---

## 五、90 天行动路径

### Week 1（Day 1-7）：信任基础设施

| Day | 任务 | 产出 |
|---|---|---|
| 1 | 重写 README + 录 30s GIF（用 [Kap](https://getkap.co/)） | README v2 + demo.gif |
| 2 | 补齐 LICENSE / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / .github/ISSUE_TEMPLATE | 所有社区文件 |
| 3 | 配 GitHub Actions CI（typecheck + lint + build） | 绿色 ✅ 徽章 |
| 4 | 申请 Apple Developer ID（$99） | 启动签名流程 |
| 5 | 配 release workflow，发 **v0.2.0** | mac-arm64.dmg + mac-x64.dmg |
| 6 | 设置 Repository About + Topics + Social preview | SEO 完整 |
| 7 | 开 Discussions，发 3 个 seed thread（自问自答示范） | Discussions 启动 |

**预期产出**：repo 看起来像严肃项目，stars 自然到 **20-50**。

---

### Week 2-4（Day 8-30）：精准传播

**国内首发**（Day 8-14）：

| 渠道 | 时机 | 标题/角度 |
|---|---|---|
| **即刻** | Day 8 上午 10 点 | "做了 3 个月，今天开源：一个会看屏幕主动帮你的 AI 桌面助手" |
| **V2EX 创意区** | Day 10 上午 | 重点写"为什么我做这个"故事而不是功能列表 |
| **少数派 Matrix** | Day 28 | 深度产品故事（独立开发者怎么用 Claude Code 做出来） |

**国际首发**（Day 12-20）：

| 渠道 | 时机 | 标题 |
|---|---|---|
| **Hacker News Show HN** | Day 12 周二/周三 US 早 8 点（北京晚 11 点） | `Show HN: Ovo – A proactive AI desktop assistant that watches your screen (privacy-first)` |
| **r/LocalLLaMA** | Day 14 | 强调 BYOK + 本地处理 |
| **r/macapps + r/SideProject** | Day 16 | 不同角度同步 |
| **X build-in-public thread** | 持续 | 每周二/五发 GIF 进度 |

**HN 上首页准备**（**单点最大流量来源，进首页 = 500-2000 stars**）：
- 准备首条 comment："Author here, AMA"
- 准备 5 个常见质疑的回复草稿：privacy / electron 重 / 为啥不用 Tauri / 中文项目英文够不够 / closed-source backend 依赖
- 当天清空日程实时回复 48 小时

**预期产出**：300-600 stars（HN 进首页 + 1 个国内 KOL 转发即可达到）。

---

### Day 31-90：社区飞轮

**Issue 响应 SLA**（保守承诺、超额交付 — 新项目最稀缺的差异化）：
- **24 小时内必回**（哪怕只是 "thanks, looking into it"）
- 一周内必有结论（fix / wontfix with reason / tracked in milestone）
- 每周五发 Weekly Update（X + Discussions），让社区感受到"还活着"

**吸引第一个 Contributor 的具体动作**：

1. 创建 **10 个 `good first issue`** 标签，每个写清楚：
   - 背景上下文
   - 涉及文件 (`file:line`)
   - 验收标准
   - 预计耗时（30min - 2h）
2. 创建 **5 个 `help wanted`** 中等难度任务
3. 第一个外部 PR：**当天 review + merge + 发推感谢 + README Contributors 区加头像**
4. 用 [all-contributors bot](https://allcontributors.org/) 自动维护贡献者墙
5. 主动在 Discord/微信群点名感谢早期 issue reporter，转化为 contributor

**关键 milestone**：

| Day | 事件 | 准备 |
|---|---|---|
| 45 | **Product Hunt** 发布 | 5 张高质截图 + 60s 视频 + 提前 3 天找 hunter |
| 60 | 发 v0.5.0，开始接受 plugin/extension | 哪怕架构粗糙，先让别人能扩展 |
| 75 | 第一次**线上 Office Hour**（Zoom/腾讯会议 1 小时） | 录像发 YouTube/B 站 |
| 90 | 写 "Ovo 90 days" 长博客 → 投 HN Second Chance Pool | 再上一次首页 |

**节奏化内容输出**（每周固定）：
- 周一：GitHub Discussions 发"本周计划"
- 周三：X build-in-public（带 GIF）
- 周五：Weekly Update + 微信群 broadcast

**预期产出**：**1000-2000 stars / 3-5 个活跃 contributor / 500+ DMG 下载 / 10+ 第三方博客或视频**。

---

## 六、社群建立顺序（实战验证）

| 时机 | 渠道 | 理由 |
|---|---|---|
| **Day 1** | GitHub Discussions | 零成本，自带 SEO |
| **Week 2** | 微信群（README 底部二维码，过期 vx 助手维护） | 中国早期用户最活跃 |
| **Month 2（>500 stars 后）** | Discord | 国际用户标配，太早开会冷场比"门可罗雀"更伤口碑 |
| **跳过** | QQ 群 | 除非目标是学生，运营成本高且形象偏年轻 |

---

## 七、最关键的 3 个决策（开始执行前必须想清楚）

### 决策 1：License — AGPL 还是 Apache？
- **AGPL-3.0**（推荐）：防云厂商白嫖你的截屏 + AI 能力，强制衍生开源（Khoj / Open Interpreter 都用）
- Apache 2.0：含专利授权，企业最爱，但允许 SaaS 包装你
- 选错后期改 license 几乎不可能

### 决策 2：双语 README — 英文主 还是 中文主？
- **英文主 + README_CN.md 副**（推荐）：目标世界级（>10k stars），HN/Reddit/X 国际流量需要英文
- 中文主：只想先做中国社区，但顶部必须有英文 abstract（否则 GitHub trending 抓不到关键词）
- ChatGPT-Next-Web / LobeChat / Pake 都是英文主

### 决策 3：是否花 $99 买 Apple Developer ID？
- **强烈推荐 yes**：没签名的 DMG = "已损坏"提示 = 用户流失 80%+
- 这是从"玩具项目"到"严肃项目"的分水岭
- 同时是 Notarization 必备（macOS Sonoma+ 必需）

---

## 八、当前最紧急的 5 件事（重申）

| # | 任务 | 时间预估 | ROI |
|---|---|---|---|
| 1 | 重写 README + 加 demo GIF | 4-6 小时 | ⭐⭐⭐⭐⭐ |
| 2 | 加 LICENSE (AGPL-3.0) | 5 分钟 | ⭐⭐⭐⭐⭐ |
| 3 | 加 Social Preview Image (1280×640) | 1 小时 | ⭐⭐⭐⭐ |
| 4 | 发 v0.2.0 Release（含 DMG） | 2-4 小时 | ⭐⭐⭐⭐⭐ |
| 5 | 配 `.github/ISSUE_TEMPLATE/` + 开 Discussions | 1 小时 | ⭐⭐⭐ |

**全部做完预计 1-2 个工作日**。完成后 stars 自然能到 50-100，再启动 Week 2 的精准传播。

---

## 九、可让我立刻代你做的事

告诉我从哪里开始，我可以直接执行：

- [ ] 写 README.md v2 英文版（你提供 logo / 截图）
- [ ] 写 README_CN.md 中文版
- [ ] 生成 LICENSE 文件（AGPL-3.0）
- [ ] 创建 `.github/` 全套模板（ISSUE_TEMPLATE / PR template / FUNDING / workflows）
- [ ] 写 CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / CHANGELOG.md
- [ ] 写 GitHub Actions CI / Release workflow
- [ ] 补 package.json 缺失字段
- [ ] 用 Bash 准备 Repository About + Topics 的 gh CLI 命令清单
- [ ] 生成 5 个 `good first issue` 草稿（基于已有的 UX_AUDIT / BUG_REPORT 文档）

---

**配套文档参考**：
- 长期愿景：`docs/product/PRODUCT_PHILOSOPHY.md`
- UX 待修问题：`docs/archive/audits/UX_AUDIT.md`（65 问题）
- 系统 bug：`docs/archive/audits/BUG_REPORT.md`（37 bug — 其中 C6 签名 / C7 自动更新 / M11 图标 直接影响发布质量）
- UI 设计一致性：`docs/archive/audits/UI_DESIGN_AUDIT.md`（22 问题 — B5 三种图标系统混用 直接影响 README 截图质感）
