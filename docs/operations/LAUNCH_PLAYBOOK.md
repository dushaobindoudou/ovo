# Ovo 发布推广 Playbook

更新时间：2026-05-30

> 「在哪发 + 什么顺序 + 发什么文案 + 发布日怎么执行」的可执行手册。
> 配套：`GITHUB_GROWTH_PLAN.md`（更早的全量增长方案，基建侧多数已完成）。

## 0. 发布前的两个硬前提（不解决会在评论区被当场打脸）

1. **下载体验**：当前无签名 DMG。未签名 app 对普通用户=转化归零。
   → **dev-first 软发布**（HN/LocalLLaMA 可忍"右键→打开"）；签名公证后再做大众渠道。
2. **依赖漏洞**：55 个（18 high）。HN/LocalLLaMA 一定有人跑 `npm audit` 贴评论。
   → 发布前至少清掉 high。

## 1. 三波发布节奏（按受众宽容度排序）

### 🌊 Wave 1 — 开发者软发布（现在可做，最宽容）
| 渠道 | 钩子 | 风险预案 |
|---|---|---|
| **r/LocalLLaMA** | 隐私 + BYOK + 本地处理（契合度最高） | "调 Claude 算什么本地"→ 自带 Key 直连、无中转、hermes 本机 CLI |
| **Hacker News (Show HN)** | 玻璃箱透明 + 开源 + 主动式 | 先清漏洞；备 AMA + 5 条质疑回复；进首页靠 48h 互动 |
| **Lobsters**（有邀请码时） | 工程向，比 HN 温和，可先练手 | — |
| **awesome-* 列表 PR** | 躺着涨 SEO（见 §4） | 零成本，第一波就提 |

### 🌊 Wave 2 — 主力大推（**签名 DMG 就绪后**）
| 渠道 | 钩子 |
|---|---|
| **Product Hunt** | 60s demo 视频 + 5 张精修图 + 提前 3 天找 hunter；"装上就用、不用配 prompt" |
| **r/macapps + r/SideProject** | 原生体验 + 独立开发；必须能一键装 |
| **即刻** | 主场，"做了 N 个月今天开源"的 build-in-public 故事 |
| **少数派 Matrix** | 深度产品故事：独立开发者用 Claude Code 造出会看屏幕的助手 |

### 🌊 Wave 3 — 持续长尾（飞轮）
- **X / Twitter #buildinpublic**：每周固定发 GIF 进度（持续曝光，非一次性）。
- **小红书 / B站**：demo 视频驱动、触达非技术用户（强依赖签名 DMG）。
- **AI 新闻信**：Ben's Bites / TLDR AI / The Rundown 投稿，被收录=一波精准流量。

## 2. 国际渠道文案（Wave 1，可直接用，占位数据自填）

### r/LocalLLaMA
**Title:** `Ovo: an open-source proactive desktop assistant that watches your screen and suggests next steps — local-first, bring your own LLM`

**Body 要点：** partner not chatbox · local-first（截图不落盘 / 本地 SQLite / 零遥测）· BYO LLM（hermes 本机 / Claude Code / API 直连，无中转）· glass-box（每步可查）· teachable（带原因拒绝→写规则→可撤销）· MIT · 坦诚 caveats（macOS only / 未公证 / 右键打开）。求隐私模型与 BYO-LLM 设计的反馈。

### Hacker News — Show HN
**Title:** `Show HN: Ovo – a proactive, glass-box AI desktop assistant (local-first, BYO LLM)`

**Body 要点：** 看屏幕→推断→主动建议/起草（不等 prompt）· 本机运行 + 调你自己的 LLM · 想要反馈的两点：①玻璃箱透明 + 送出类动作永远先问 ②teachable not opinionated · 栈：Electron/React/TS/OCR/sqlite · 坦诚 caveats · "Author here — AMA"。

**首条 comment：** `Author here. Happy to go deep on the privacy model, why Electron over Tauri, the trust ladder for actions, or the knowledge-graph design. AMA.`

### AMA 反驳草稿（提前备好 5 条）
1. **调 Claude 怎么算本地?** → 自带 Key 直连厂商、无中转；可用本机 hermes 离线；发出去的只有脱敏后的屏幕文本摘要，截图永不落盘。
2. **Electron 太重，为啥不用 Tauri?** → 诚实：需要稳定跨进程屏幕捕获 + 成熟多窗口生态；Tauri 在考虑范围。别嘴硬。
3. **未签名/不安全?** → 承认未公证，现面向愿跑 dev 构建的人；签名公证在做；指向"右键→打开"。
4. **会偷偷替我发邮件吗?** → 不会。发送类动作到点也必须确认，永不无人值守发出；仅可逆动作自动执行。
5. **中文项目英文够吗?** → 全双语 UI + 双语 README。

## 3. 国内渠道文案（Wave 2，调性各异）

- **即刻**：第一人称真诚故事，链接放评论区，发完自己补一条细节。核心："我不想要又一个对话框，我想要一个看着我干嘛、自己判断该不该搭手的伙伴。"
- **少数派 Matrix**：长文。结构=痛点钩子→工具型 vs 副驾型 agent（搬 `AGENT_PHILOSOPHY.md`）→怎么做到（配 GIF）→最难的取舍（隐私/信任/不打扰）→Claude Code 独立开发幕后→现状坦诚。需提前 1 周投稿审核。
- **小红书**（等签名 DMG）：标题钩子 + 痛点共鸣 + emoji + 3-5 张实拍。如「我电脑里装了个会"读心"的 AI，打工效率直接起飞 🚀」。
- **V2EX 创意区**：反营销朴素技术腔，求拍砖，技术细节指向 README。

## 4. 躺着涨的收录型渠道（Wave 1 就提，长期 SEO）
- **awesome-* 列表 PR**：`awesome-electron` / `awesome-macos` / `awesome-ai-agents` / `awesome-privacy` / `awesome-selfhosted`
  > 一句话：`[Ovo](<repo>) - Proactive, glass-box AI desktop assistant for macOS. Watches your screen, suggests next steps, runs local-first with your own LLM. (MIT)`
- **AlternativeTo / Slant**：登记为 Rewind / Cursor / Raycast 的开源替代品。

## 5. 发布日 Checklist（T-3 → T+48h）

**T-3 天｜准备**
- [ ] 清依赖漏洞（至少 high）
- [ ] 签名/公证 DMG（走大众渠道）或确认 build-from-source 说明实测可用
- [ ] 截图墙 + 60s demo 视频/GIF
- [ ] 上传 Social preview 图（Settings → Social preview）
- [ ] README 链接 + 安装步骤实测一遍
- [ ] AMA 5 条回复 + 首条 comment 定稿
- [ ] awesome-list PR 先提（不依赖发布日）
- [ ] GitHub Discussions 开好 + Issue 模板就位
- [ ] （用 PH 则）提前找好 hunter

**T-1 天**
- [ ] 实测"下载→打开"全流程（unsigned 路径亲自走一遍）
- [ ] 各渠道文案定稿 + 排版预览
- [ ] 清空发布日日程

**T-0 发布日**
- [ ] 选周二/周三；Show HN 在 US 早 8（北京晚 11）
- [ ] 先发最宽容渠道（LocalLLaMA）观察反馈
- [ ] 发完**立刻**发首条 AMA comment
- [ ] 即刻上午 10 点（错开 HN，别同日撞精力）
- [ ] 全天盯评论，<1h 回复

**T+0 → T+48h**
- [ ] HN/Reddit 评论高频回复（进首页靠互动）
- [ ] 反馈→开 issue→当场修小问题发推
- [ ] 记录指标（star / 下载 / 流量来源）——可对照应用内「Ovo 表现」看板验证 hit rate
- [ ] 第一个外部 issue/PR：当天响应 + 感谢 + README 贡献者墙加头像

**T+1 周**
- [ ] Weekly update（X + Discussions）
- [ ] 少数派 / PH（DMG 就绪）第二波
- [ ] 复盘哪个渠道 ROI 最高，集中加投

## 6. 一句话总策略
先清「未签名 + 漏洞」两颗雷 → 从 **r/LocalLLaMA** 起步（最契合最宽容）→ 用反馈校准 → 打 HN → 签名后再 Product Hunt + 国内大众渠道。**不要把所有渠道一次性打光。**
