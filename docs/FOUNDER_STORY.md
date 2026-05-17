# Founder Story — Launch Post Pack

> 一份发文素材包：中英文长短版本 + 发布时序 + 配套素材清单。
>
> 你只需要把 `{方括号}` 标记的占位符替换成你的真实经历，就能发出去。
>
> 第一篇关于 Ovo 的传播文章会被引用很多年——值得花一个晚上把它写好。

---

## 目录

- [发布前 — 30 分钟准备清单](#发布前--30-分钟准备清单)
- [中文短版](#中文短版给即刻--朋友圈--v2ex-创意区) — 即刻 / 朋友圈 / V2EX 创意区 (< 500 字)
- [中文长版](#中文长版给少数派--公众号--知乎) — 少数派 / 公众号 / 知乎 (1500-2000 字)
- [英文 HN Show HN](#英文-hn-show-hn) — Hacker News
- [英文 X (Twitter) thread](#英文-x-twitter-thread) — 7 条
- [英文 Reddit](#英文-reddit) — r/LocalLLaMA / r/macapps / r/SideProject
- [发布时序建议](#发布时序建议)
- [配套素材清单](#配套素材清单)
- [常见质疑预案](#常见质疑预案)

---

## 发布前 — 30 分钟准备清单

发文前必须完成的事，少一个就会失分：

- [ ] **撤销暴露过的 GitHub token** → https://github.com/settings/tokens（再次提醒）
- [ ] **上传 Social Preview 图**（1280×640 PNG）→ Settings → Social preview
- [ ] **录一个 30 秒 demo GIF** 放进 `docs/assets/demo.gif`（用 [Kap](https://getkap.co/) 免费录制）
- [ ] **下载 v0.2.0 DMG 在本机走一遍首次启动流程**（右键打开 → 看是否顺畅）
- [ ] **README hero 区的 demo GIF 链接**（确认能正确显示）
- [ ] **GitHub Release v0.2.0 的描述**（已自动加 Gatekeeper 指引，确认一眼能看到）
- [ ] **3 个 issue pin 在 issues 顶部**（已自动 pin #1 / #6 / #8）

完成上述清单后再开始发文。带着半成品发文会**永久浪费**首发流量。

---

## 中文短版（给即刻 / 朋友圈 / V2EX 创意区）

### 标题候选（3 选 1）

1. ✅ **做了一个会看屏幕的 AI 副驾驶，结果自己离不开了**
2. **三个月业余时间，造了一个我每天都在用的 AI 助手**
3. **如果 AI 不主动帮你，那它和搜索引擎有什么区别**

推荐 1（最贴合"创始人自白"的真诚感）。

### 正文（约 480 字）

```
做了一个会看屏幕的 AI 副驾驶，结果自己离不开了 🪟

过去三个月业余时间在做一个开源桌面 AI 助手叫 Ovo。
今天 0.2 版本发出来了：https://github.com/dushaobindoudou/ovo

做这个的起点很简单——{填入：触发你动手的具体场景，
例如"我每天回 30 封一模一样的邮件" / "我老是忘了上次跟 Wei 说到哪了" 
等具体的痛点}。

跟 ChatGPT、Cursor 这些工具型 AI 不一样的是：
Ovo 不等你 prompt，它就在你屏幕旁边默默看着，理解你
在做什么，然后在你需要之前把下一步准备好。比如你正在
写邮件，它已经把回复草稿放在剪贴板了;你正在看一份合同,
它会标记"这条自动续约 12 个月,你上次也飞了类似的"。

最重要的是它全程透明——每一步都能看到 AI 看到了什么、
想到了什么、做了什么决定。不喜欢可以拒绝、可以教它
"永远别这么做"。

这是我心目中真正的 AI 副驾驶——不打扰、可审计、可学习,
100% 本地处理（截图永远不上传），自带你的 Claude/OpenAI key。

用了一个月之后我发现一件事:回不去了。{填入:一个具体的
"我意识到自己离不开了"的瞬间，例如"上周断网两小时，
我才发现我已经默认 Ovo 帮我记客户聊到哪了"}

完全开源 MIT 协议，已经发了 macOS DMG 可以直接下载。

GitHub: https://github.com/dushaobindoudou/ovo
首次启动右键→打开（还没买 Apple Developer ID 做签名）

欢迎 star、试用、提 issue。如果你也觉得"主动 AI"才是未来,
我们路上见。
```

### 即刻使用 tips

- 配图：1 张 demo GIF + 1 张 README 截图
- Hashtag：#独立开发者 #开源项目 #AI #效率工具
- 发布时间：**周二 上午 10 点** 或 **周三 上午 10 点**（即刻活跃高峰）

---

## 中文长版（给少数派 / 公众号 / 知乎）

### 标题候选

1. ✅ **做了一个会看屏幕的 AI 副驾驶，三个月后我已经回不去了**
2. **我们已经有了 ChatGPT，为什么还需要主动型 AI 助手？**
3. **关于一个会看屏幕的 AI 助手的诚实日记**

### 正文结构（约 1800 字）

```markdown
# 做了一个会看屏幕的 AI 副驾驶，三个月后我已经回不去了

## 开始之前

这不是一篇推广文。
这是我自己业余时间做的一个开源工具，**用了一个月后我自己离不开了**——所以我决定把它发出来。如果你也常常觉得"AI 工具明明很强，但每次都要我开口求它，太累了"，可能你会对它感兴趣。

项目地址：https://github.com/dushaobindoudou/ovo

---

## 起因

{这部分写真实的故事——大约 200 字。例子：}

> "事情的开始是去年冬天的某个晚上。我在凌晨两点写一封很重要的客户邮件，写到一半发现需要回忆我们三个月前讨论过的一个细节。我在邮件、Slack、笔记里翻了 20 分钟才找到。
>
> 我那一刻意识到一件事：今天的 AI 已经强到能写完这封邮件，但它**不知道**我需要它。我必须先停下来，先打开 ChatGPT，先描述我要什么，AI 才能帮我。
>
> 但人不是 prompt 机器啊。"

## 一个核心判断

我觉得现在的 AI 工具被分成了两类——很少人这么明确地说，但我觉得这是理解未来 5 年 AI 产品最重要的二分法：

**第一类：工具型 Agent**
- 例子：ChatGPT、Claude、Cursor、GitHub Copilot、Claude Code、OpenClaw、Hermes
- 特点：你 prompt → 它执行 → 它停下来等下一个 prompt
- 强大但被动，世界上已经有几千个

**第二类：副驾型 Agent**
- 例子：(几乎没有真正做对的)
- 特点：默默看着你工作 → 理解你在做什么 → 在你需要之前给你准备好 → 你接受/拒绝/教它
- 没有任何主流产品在这里——这就是我做 Ovo 的理由

我们在工具型 Agent 上花了数千亿美金。**真正能被广泛使用、真正改变工作方式的，是副驾型 Agent。但几乎没有人在认真做。**

(完整论述：[docs/AGENT_PHILOSOPHY.md](https://github.com/dushaobindoudou/ovo/blob/main/docs/AGENT_PHILOSOPHY.md))

## 第一次"哇这真的懂我"的时刻

{这里写 1-2 个具体场景，约 250 字。例子：}

> "做到第六周的某天下午，我在 Gmail 写一封拒绝候选人的邮件——这种邮件我一直拖着不想写。Ovo 在我点开邮件的时候已经在剪贴板里准备好了一份草稿：用我习惯的语气、提到了 ta 在面试里说的一个具体亮点、4 句话。
>
> 我惊到了。不是因为 LLM 能写邮件——这件事 ChatGPT 早就能做。让我惊到的是：**我没有跟它说一个字**。
>
> 它看到了我在 ATS 上停留的时间，看到了候选人页面上的笔记，看到了我之前几次拒绝候选人的语气模式，然后自己决定：嘿，他需要写这个，他可能想拖着，我把第一稿准备好。"

## 现在每天用它做什么

{这部分写 4-6 个你真在用的场景，每个 50-100 字。可以从 [USE_CASES.md](https://github.com/dushaobindoudou/ovo/blob/main/docs/USE_CASES.md) 里挑你真在用的。例子：}

1. **草拟邮件回复**：约 80% 我的简单回复（"是 / 不行 / Thursday 见"类）现在都是 Ovo 草拟好我一点 send。
2. **找回上下文**：再也不需要"Wei 是谁来着"——Ovo 看到对方邮箱就把上次的对话浮起来。
3. **会议记录**：Zoom 一关掉，Ovo 自动问"要记下刚才那 3 个决定吗"——我说要，就进知识图谱了。
4. **重复模式自动化**：我每次开 PR 都要复制 URL 到 Slack，Ovo 第 4 次注意到模式，现在切换到 Slack 时剪贴板已经有了。
5. **风险提示**：合同 PDF 里看到"自动续约"会被 Ovo 标出来——上次给我省了一个 12 个月的失误。

## "我离不开了"的瞬间

{这部分极其重要，写一个具体的"回不去"瞬间，约 200 字。例子：}

> "三周前我家里断网两小时。我以为没事——Ovo 是本地的，不依赖网络（除了 LLM 调用）。但其实 Ovo 在断网的时候，OCR 和 KG 都还在跑，只是不能调 LLM 生成建议。
>
> 我那两小时回到了"我自己干所有事"的世界。第一封邮件我下意识地等 3 秒——等 Ovo 的草稿出现。然后想起来：哦，对，没有 Ovo 我得自己写。
>
> 我意识到的不是 Ovo 厉害。我意识到的是：**我已经把"草拟邮件"这件事从大脑里删掉了**。Ovo 不在了，我那部分能力萎缩了。
>
> 这就是我之前关于 AI 的所有迷思被打破的瞬间。我从此知道：副驾型 Agent 不是一个 feature，它是一种新的工具形态——一旦用上，就回不去。"

## 关于隐私

(这点对中文用户特别重要，必须正面回答)

我做的是一个**会截屏的 AI**——我深知中国用户对这件事的信任成本有多高。所以从第一天开始我做了几件事：

- ✅ **截图和 OCR 全部本地处理**，永远不离开你的电脑
- ✅ **自带你的 LLM key**（Claude / OpenAI / 国内厂商任选）—— 不经过任何中转服务器
- ✅ **API key 用 macOS Keychain 加密**，渲染进程永远拿不到明文
- ✅ **API token / 银行卡 / 身份证号 自动脱敏**，发给 LLM 之前
- ✅ **App 级黑名单**（1Password / 工商银行等永不观察）
- ✅ **一键暂停 5/15/60 分钟**
- ✅ **完整 MIT 开源**，代码可审计
- ✅ **默认零遥测** —— Ovo 不收集任何使用数据

完整隐私文档：[PRIVACY.md](https://github.com/dushaobindoudou/ovo/blob/main/docs/PRIVACY.md)

## 现在的状态

- ✅ macOS 版本可用（Apple Silicon + Intel 都有 DMG）
- ✅ 支持 4 个 AI 后端（Claude Code / OpenClaw / Hermes / Direct API）
- ✅ MIT 协议完全开源
- ⏳ Windows / Linux 在 v0.5+
- ⏳ 代码签名在 v0.3（暂时首次启动需右键 → 打开，10 秒搞定）

## 如果你也对"主动 AI"这件事感兴趣

- ⭐ Star: https://github.com/dushaobindoudou/ovo
- ⬇ Download: https://github.com/dushaobindoudou/ovo/releases/latest
- 💬 加入讨论: https://github.com/dushaobindoudou/ovo/discussions
- 🙏 第一次贡献者欢迎来挑 [good first issue](https://github.com/dushaobindoudou/ovo/labels/good%20first%20issue)

不用做"用户"，做"共谋者"。这件事如果对，就一起把它做大。
```

### 长版使用 tips

- 配图：4-6 张截图，每段插一张
- 必有 GIF：开头一张 hero demo GIF（30 秒）
- 少数派：投 Matrix 而不是首页，避免初次发被风控
- 公众号：标题改"我们已经有了 ChatGPT，为什么..."更能在朋友圈传

---

## 英文 HN Show HN

### 标题（70 字符内）

✅ `Show HN: Ovo – Proactive AI desktop assistant that watches your screen (open source, local-first)`

或简洁版：

`Show HN: Ovo – A proactive, transparent, teachable AI copilot for your desktop`

### 首条 comment（你自己作为作者立即回的第一条）

```
Author here, happy to AMA.

Quick context on why Ovo exists:

After a year of using Claude/ChatGPT/Cursor heavily, I noticed I was 
spending real cognitive effort *prompting* tools. The dream of AI was 
never "I type into a chat box all day" — it was "the AI just helps".

That gap is what Ovo tries to fill. It watches your screen (OCR, 
locally), builds a knowledge graph of what you do, and surfaces 
suggestions before you have to ask. Every action is auditable (full 
pipeline timeline visible), teachable ("never do this again" button), 
and local-first (BYO API key, no telemetry, no server).

Two non-obvious things I learned building this:

1. The right interaction shape is hard. Too quiet and the AI is 
   forgotten; too loud and it's invasive. We default to silent + a 
   trust-ladder slider per action type.

2. The "transparent" part matters more than I expected. People don't 
   want magic — they want to see why the AI did what it did. Hence 
   the full pipeline log + visible KG + redaction rules.

Tech: Electron + React + SQLite. Calls Claude Code / OpenClaw / 
Hermes / OpenAI-compatible APIs as the "tool agent" — Ovo is the 
copilot, your LLM is the muscle.

Known limitations:
- macOS only currently (Win/Linux on roadmap)  
- DMG not yet code-signed (right-click → Open on first launch; 
  Apple Dev ID coming in v0.3)
- No auto-update yet (same milestone)
- 53 dependency CVE alerts as of today, Dependabot auto-fixing

Repo: https://github.com/dushaobindoudou/ovo
Philosophy doc (most important read): 
  https://github.com/dushaobindoudou/ovo/blob/main/docs/AGENT_PHILOSOPHY.md

Would love to hear: what's the first thing your screen-aware copilot 
should have noticed about you?
```

### 发布时机

- **周二或周三 美国东部时间 8:00 AM**（北京时间 周三或周四 晚 8 点）
- 那是 HN 流量最大的窗口
- 提前一天发，HN frontpage 寿命是 12-18 小时

### Pre-emptive replies 准备（HN 常见 5 类质疑）

#### 质疑 1: "Privacy concerns"
```
Fair concern — and I take it seriously since I built this for myself 
first. The privacy model:

- Screenshots and OCR happen locally, never uploaded
- Knowledge graph is local SQLite  
- API key encrypted via macOS Keychain
- Sensitive data (tokens, JWTs, card numbers, IDs) redacted before 
  any LLM call
- Per-app blacklist (banking, password managers default-blocked)
- Hard pause (5/15/60 min) when you need privacy
- Zero telemetry. We don't run any servers that see your data.

The only network call is to YOUR chosen LLM provider with YOUR key. 
Full data flow audit: 
https://github.com/dushaobindoudou/ovo/blob/main/docs/PRIVACY.md

The code is open — `grep -rE "fetch|http" electron/` shows every 
outbound call. Audit welcome.
```

#### 质疑 2: "Why Electron, not Tauri?"
```
Honest answer: I started with Electron because the React + Node 
toolchain let me ship faster. Tauri would have meant rewriting the 
renderer-native bridge for a project that needed to prove the concept 
first.

I think a Tauri rewrite is worth considering for v0.5 — gains: ~10x 
smaller binary, native webview. Risks: re-doing the IPC + SQLite + 
OCR bindings.

If you have strong opinions or want to lead a Tauri port, let's talk 
in Discussions.
```

#### 质疑 3: "Isn't this just Rewind / Microsoft Recall?"
```
Rewind records for retrospective search — passive. Recall got killed 
over privacy.

Ovo is active: it acts in the moment, surfacing a draft / risk / 
context exactly when you'd need it. Different problem shape.

Closer analogues are: Cursor (IDE-bound), Granola (meetings-only). 
Ovo is the general-purpose desktop copilot — that slot is open.

Full comparison: 
https://github.com/dushaobindoudou/ovo#-vs-other-ai-tools
```

#### 质疑 4: "Doesn't this require trust in the model?"
```
Yes — and that's why every suggestion is reviewable, every action 
either auto-executes (only 3 reversible types) or waits for your 
click. The pipeline timeline shows you exactly what the AI saw, 
thought, and decided.

I'd argue the trust required is LESS than a tool agent: a tool agent 
runs on your prompt, but its reasoning is invisible. Ovo runs on 
observation, but its reasoning is visible.

Glass-box AI is the bet. 
https://github.com/dushaobindoudou/ovo/blob/main/docs/AGENT_PHILOSOPHY.md#52-visible-reasoning
```

#### 质疑 5: "This is just OS-level integration the OS should provide"
```
Apple Intelligence and Microsoft Copilot are moving this direction, 
yes. Two reasons I'm building anyway:

1. Open source + local-first + your-own-LLM-key is a very different 
   trust model than what OS vendors will offer.
2. OS-vendor copilots will be locked to their model. Ovo lets you 
   pick (Claude / Anthropic / OpenAI / DeepSeek / local Ollama).

If Apple ships a great open API, I'd happily refactor onto it.
```

---

## 英文 X (Twitter) thread

### 7-tweet thread

**Tweet 1 (hook)**:
```
I've been quietly building an open-source proactive AI desktop 
assistant for 3 months.

Last week I realized I can't work without it.

Here's why I built it, what it does, and why I think proactive 
copilots are the AI shape almost no one is building. 🧵
```

**Tweet 2 (the gap)**:
```
There are 2 kinds of AI agents in the world:

1. Tool agents (ChatGPT, Cursor, Claude Code) — you prompt, they 
   execute, they stop

2. Copilot agents (Ovo) — they watch your context, anticipate your 
   intent, prepare what you'll need

The world has 10,000 tool agents. ~3 copilots that almost work.

That asymmetry is the opportunity.
```

**Tweet 3 (what Ovo does)**:
```
Ovo watches your screen (OCR, local), builds a knowledge graph 
of your work, and surfaces suggestions before you ask.

You're writing an email → reply draft on clipboard
You see a contract → "auto-renewal clause flagged"
Meeting ends → "log these 3 decisions?"

You don't prompt. It just notices.
```

**Tweet 4 (the screenshot/GIF)**:
```
[Insert your 30s demo GIF or 2-3 screenshots]

[Caption]: The Pipeline timeline shows every step — what Ovo saw, 
what it thought, what it decided. No magic. Glass-box AI.
```

**Tweet 5 (privacy)**:
```
The privacy model is the unlock:

✅ Screenshots + OCR local, never uploaded
✅ BYO API key (Claude/OpenAI/local), no proxy
✅ Sensitive data auto-redacted before LLM
✅ Per-app blacklist (banking apps default off)
✅ Zero telemetry. No servers we operate.
✅ MIT open source

This is the only way I'd let an AI watch my screen.
```

**Tweet 6 (the can't-go-back moment)**:
```
3 weeks ago my home internet went out for 2 hours.

I noticed myself waiting 3 seconds after opening each email — for 
Ovo's draft to appear.

I'd forgotten how to start a reply from scratch.

That's the test. "Once you use it, can you go back?" If no — 
you've built something.
```

**Tweet 7 (CTA)**:
```
Ovo is open source, MIT, macOS DMG available now:
github.com/dushaobindoudou/ovo

Read the philosophy if you build agents:
[link to AGENT_PHILOSOPHY.md]

Try it. Tell me what your screen-aware copilot should have noticed 
about you. That's how Ovo gets smarter.

⭐ helps. RT helps more. 🙏
```

### Posting tips

- Post the whole thread at once (don't drip)
- Quote-tweet from your @ account the next day with one update
- Reply to every comment within 24 hours for the first 48 hours

---

## 英文 Reddit

### r/LocalLLaMA

**Title**: `[Open Source] Ovo — proactive desktop AI that works with any LLM (BYO key, local-first)`

**Body**:
```
Hey r/LocalLLaMA,

I've been building Ovo (https://github.com/dushaobindoudou/ovo) — 
an open-source proactive AI desktop assistant for macOS. Sharing 
because I think this community will appreciate the local-first BYO 
design.

What makes it different from ChatGPT desktop apps:
- It WATCHES your screen (OCR locally) and surfaces suggestions 
  before you ask
- Works with ANY OpenAI-compatible endpoint — Claude / OpenAI / 
  Ollama / DeepSeek / OpenRouter / whatever
- Knowledge graph is local SQLite, no cloud dependency
- API key encrypted via macOS Keychain
- Sensitive data redacted before being sent to any LLM
- Zero telemetry, no analytics, no server we operate

For Ollama users: point Direct API base URL at 
http://localhost:11434/v1 and you have a 100% local copilot.

Tech: Electron + React + SQLite + Tesseract. Multi-pass prompt 
engine (observe → synthesize), trust-ladder for actions.

Limitations: macOS only currently. Unsigned DMG (right-click → Open 
on first launch).

Would love feedback from people running local models — especially: 
what's the smallest model you've gotten useful results from?
```

### r/macapps

Title: `[Free / Open Source] Ovo — proactive AI desktop assistant`

Body: shorter version of the above, emphasize macOS-native feel + 
Apple Silicon support.

### r/SideProject

Title: `Built an open-source AI copilot for my own desktop and 
now I can't work without it — released v0.2 today`

Body: most personal version — the "I built this for myself first" 
angle resonates most here.

---

## 发布时序建议

### Day 1 (周二)
- **AM 10:00 CN** — 即刻短版发出
- **AM 11:00 CN** — V2EX 创意区发出
- **PM 4:00 CN** — 朋友圈短版

### Day 2 (周三)
- **AM 8:00 ET / 周三 PM 8:00 CN** — Show HN
- **同步发推 thread**
- **24 小时清空日程**回复每条 HN / X / GitHub issue 评论

### Day 3 (周四)
- **r/LocalLLaMA + r/macapps + r/SideProject** 三个不同角度同步
- **少数派**长文投稿（不投 Matrix 首页，投社区）

### Day 7 (下周一)
- **公众号 / 知乎** 长版
- 总结首周数据发一条复盘推

### Day 14
- 根据反馈发 v0.2.1 修最常见的 3 个 bug + 1 个最被要求的 feature
- 发 "Ovo's first 2 weeks" 推

### Day 30
- 第一次月度复盘博客
- 投 HN Second Chance Pool 看能不能再上首页

---

## 配套素材清单

### 必须有

| 素材 | 用途 | 工具 |
|---|---|---|
| **30s demo GIF** | README hero + 即刻 + X | [Kap](https://getkap.co/) → export as optimized GIF |
| **6 张截图** (1920×1200 retina) | README + 少数派 + Reddit | macOS Cmd+Shift+5 |
| **1280×640 social preview PNG** | GitHub Social preview + X 卡片 | Figma / Canva |
| **YouTube/B站 60s 视频** (可选) | 给 Product Hunt 用 | QuickTime + iMovie |

### 锦上添花

- 3-5 张架构图 (`docs/ARCHITECTURE.md` 里的 ASCII art 做成 SVG)
- 公众号封面图 (1080×1440)
- 知乎首图 (1280×720)
- 头像/Logo 高分辨率 (2048×2048)

### 文案

- ✅ 短版 (< 300 字) — 这份文档已经写好
- ✅ 长版 (1500-2000 字) — 这份文档已经写好
- ✅ HN 标题 + 首回复 — 这份文档已经写好
- ✅ X thread (7 tweets) — 这份文档已经写好

---

## 常见质疑预案

### "看起来像 Microsoft Recall 第二，要凉"
> Recall 死于隐私和"被动记录无用"。Ovo 是主动的（surfaces actions），不是被动的（records for search）。完全不同的产品形态。

### "Electron 太重"
> 同意 Tauri 更优雅。当前选 Electron 是为了 ship 快速。v0.5 会评估 Tauri 重写。同时欢迎 PR。

### "为什么不直接用 ChatGPT Desktop"
> 因为 ChatGPT Desktop 等你 prompt。它不看你屏幕，不记得你昨天的工作，不主动推荐下一步。它是 tool agent，Ovo 是 copilot agent。不同类。

### "中国独立开发者做截屏 AI，可信吗"
> 把信任问题正面回答：① 完全开源 ② 截图不离开本机 ③ 自带 LLM key ④ macOS Keychain 加密 ⑤ 敏感数据脱敏 ⑥ 零遥测 ⑦ App 黑名单 ⑧ 一键暂停。比闭源工具的信任成本低。

### "AI 准确率不够会很烦"
> 默认安静 + 用户可调的 trust ladder + 每个建议可拒绝 + "永远别这样"按钮。不是"AI 替你做"，是"AI 给你选项你决定"。

### "这跟 Granola / Otter 有什么区别"
> 它们绑定一个上下文（会议 / 录音）。Ovo 是全桌面的。

---

## 写在最后

记住三件事：

1. **诚实是稀缺资源**。在 AI 工具泛滥 + 营销爆炸的时代，创始人说"我为自己做的，结果我自己离不开了"这件事是真正稀缺的信号。**不要试图把这件事写得'营销化'**——越真实越有力量。

2. **故事 > 功能列表**。读者记不住"OCR + KG + 多 pass prompt"。读者记得住"我在断网两小时里下意识等 Ovo 的草稿"。

3. **首发是一次性的**。同一篇文章不会有第二次机会。所以**完成准备清单再发**——少了 demo GIF / 缺了 Social Preview / Release notes 没编辑——任何一项缺失都会折损 50% 的转化。

---

愿你的副驾驶帮你飞远一点。🚀
