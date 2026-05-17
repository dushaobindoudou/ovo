<div align="center">

<img src="build/icon-512.png" width="120" alt="Ovo Logo" />

# Ovo

### Open-source proactive AI desktop assistant.<br/>Watches your screen, suggests next steps, runs 100% on your machine.

<p>
  <a href="https://github.com/dushaobindoudou/ovo/releases/latest"><img src="https://img.shields.io/github/v/release/dushaobindoudou/ovo?label=download&color=007aff" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-007aff.svg" alt="MIT License" /></a>
  <a href="https://github.com/dushaobindoudou/ovo/actions/workflows/ci.yml"><img src="https://github.com/dushaobindoudou/ovo/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://github.com/dushaobindoudou/ovo/stargazers"><img src="https://img.shields.io/github/stars/dushaobindoudou/ovo?style=social" alt="GitHub Stars" /></a>
</p>

<p>
  <b>English</b> · <a href="README_CN.md">简体中文</a>
</p>

<p>
  <a href="https://github.com/dushaobindoudou/ovo/releases/latest">⬇ Download for macOS</a> ·
  <a href="docs/PRODUCT_PHILOSOPHY.md">📖 Philosophy</a> ·
  <a href="https://github.com/dushaobindoudou/ovo/discussions">💬 Discussions</a> ·
  <a href="CONTRIBUTING.md">🤝 Contributing</a>
</p>

</div>

---

<p align="center">
  <img src="docs/assets/demo.gif" alt="Ovo 30-second demo" width="800" />
  <br/>
  <em>Ovo watching a Gmail draft, predicting the reply, and offering to copy it — all visible, all auditable.</em>
</p>

---

## 🪟 What is Ovo?

**Ovo is a proactive AI desktop assistant that watches what you're doing — and helps before you have to ask.**

Most AI tools today wait for you to type a prompt. Ovo flips that:

- It **observes your screen** every few seconds (OCR + window context).
- It **understands your intent** through a multi-pass reasoning pipeline with a long-term knowledge graph.
- It **suggests the next step proactively** — drafting an email reply, copying a snippet, reminding you of a deadline.
- It **shows you every step of its thinking** in a glass-box timeline — no magic, no black box.
- And it **learns from your feedback** — accept, reject, or teach Ovo to never do that again.

Built for people who want an AI that's actually present in their day — without giving up control, transparency, or privacy.

---

## ✨ Why Ovo? — The 5 things that make Ovo different

### 🚀 Proactive, not reactive
While ChatGPT waits for you to type, Ovo notices you're drafting an email to a customer and **silently prepares the reply** before you ask. You see the suggestion, decide whether to use it. Zero prompting overhead.

### 🪟 Glass-box transparency
Every other AI is a black box. Ovo shows you:
- 📸 What it saw (the OCR text from your screen)
- 🧠 What it thought (the full prompt sent to the LLM)
- 💡 What it decided (the structured suggestion + confidence)
- ⚡ What it did (every action with output and duration)

Click any suggestion → see its full reasoning chain. No more "why did the AI say that?"

### 🎓 Teachable, not opinionated
Don't like a suggestion? You can:
- **Reject this one** — Ovo remembers and won't repeat the mistake
- **"Never do this again"** — Ovo writes the rule into its knowledge graph
- **Adjust trust level** — give Ovo more or less autonomy per action type

Ovo gets smarter from your feedback, not from cloud telemetry.

### 🔒 Local-first, BYO LLM
- Screenshots and OCR happen on **your machine** — they never leave
- Bring your own Claude / OpenAI / local LLM key — no proxy server
- Built-in sensitive data redaction (API keys, JWT, credit cards, ID numbers)
- App-level blacklist (1Password, banking apps, etc. — never observed)
- Hard pause (5/15/60 min) when you need privacy

### 🧠 Long memory through a knowledge graph
Ovo builds a personal knowledge graph as you work:
- **Entities** (people, projects, documents, concepts)
- **Relationships** between them
- **Memory events** with timeline + intent tagging
- **Personality profile** that evolves with your patterns

Open the Memory panel to see exactly what Ovo knows about you. Edit it. Pin important entities. Delete anything you don't want remembered.

---

## 🆚 Ovo vs. Other AI Tools

|                          | ChatGPT Desktop | Rewind  | Cursor       | Granola | **Ovo** |
|--------------------------|:---------------:|:-------:|:------------:|:-------:|:-------:|
| Proactive (no prompting) | ❌              | ❌      | Partial (IDE only) | Partial (meetings only) | ✅ |
| Screen-aware             | ❌              | ✅ (record only) | ✅ (IDE only) | ✅ (audio only) | ✅ |
| Transparent reasoning    | ❌              | N/A     | ❌           | ❌      | ✅ |
| Teachable per-action     | ❌              | ❌      | Partial      | ❌      | ✅ |
| Local-first / BYOK       | ❌              | Partial | ❌           | ❌      | ✅ |
| Open source              | ❌              | ❌      | ❌           | ❌      | ✅ |
| Knowledge graph memory   | ❌              | ❌      | ❌           | ❌      | ✅ |

---

## 📥 Install

### Option 1: Download (recommended)

<p>
  <a href="https://github.com/dushaobindoudou/ovo/releases/latest">
    <img src="https://img.shields.io/badge/⬇_Download_for_macOS-007aff?style=for-the-badge" alt="Download for macOS" />
  </a>
</p>

> **First launch on macOS**: until we ship a signed/notarized build, you'll see "Ovo can't be opened because the developer cannot be verified". Right-click the app → Open → Open. Only needed once.

> **Windows / Linux**: planned for v0.5+. Star the repo to get notified.

### Option 2: Build from source

```bash
git clone https://github.com/dushaobindoudou/ovo.git
cd ovo
pnpm install
pnpm dev          # Dev mode (Vite + Electron live-reload)
# or
pnpm pack:mac     # Build production DMG to out/
```

**Requirements**: Node 20+, pnpm 10+, macOS (Apple Silicon or Intel)

### First-run setup

1. **Grant screen recording permission** — Ovo will guide you to System Settings
2. **Configure your AI backend** — choose Claude Code / OpenClaw / Hermes / direct API
3. **Set your API key** (encrypted with macOS Keychain, never sent anywhere)
4. **Tell Ovo about you** — optional 4-step onboarding to seed the knowledge graph

That's it. Within 1-2 minutes Ovo will start observing and suggesting.

---

## 🖼️ Screenshots

> _Screenshots and GIFs will be added in v0.2 release. PRs welcome — see [#good-first-issue](https://github.com/dushaobindoudou/ovo/labels/good%20first%20issue)._

| Console (main window) | Floating icon (always on top) | Suggestion toast |
|---|---|---|
| _placeholder_ | _placeholder_ | _placeholder_ |

| Knowledge graph | Pipeline timeline (transparent reasoning) | Settings — privacy panel |
|---|---|---|
| _placeholder_ | _placeholder_ | _placeholder_ |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (React + Zustand)                                 │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Main Console │  │ Floating Icon  │  │ Suggestion     │  │
│  │ (#console)   │  │ (#float)       │  │ Panel/Toast    │  │
│  └──────┬───────┘  └───────┬────────┘  └───────┬────────┘  │
└─────────┼──────────────────┼───────────────────┼───────────┘
          │   IPC (preload.cjs, context-isolated)
┌─────────▼──────────────────▼───────────────────▼───────────┐
│  Electron Main Process                                      │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ AutoCapture  │→ │ OCR Engine     │→ │ Event Processor│  │
│  │ (5s)         │  │ (Tesseract)    │  │ (intent infer) │  │
│  └──────────────┘  └────────────────┘  └───────┬────────┘  │
│                                                ▼            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Multi-Pass Prompt Engine                             │  │
│  │ Pass 1: Observe (intent + entities)                  │  │
│  │ Pass 2: Synthesize (predictions + actions)           │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Agent Bridge (Claude Code / OpenClaw / Hermes / API) │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               ▼                                              │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Knowledge    │  │ Action         │  │ Feedback       │  │
│  │ Graph (SQL)  │  │ Executor       │  │ Engine         │  │
│  └──────────────┘  └────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Tech stack**: Electron 34 · React 19 · TypeScript · Vite · Tailwind · better-sqlite3 · Tesseract.js · Zustand

See [`docs/PRODUCT_PHILOSOPHY.md`](docs/PRODUCT_PHILOSOPHY.md) for the design philosophy and [`docs/ELECTRON_IPC_MAPPING.md`](docs/ELECTRON_IPC_MAPPING.md) for IPC contracts.

---

## 🗺 Roadmap

**Shipped** ✅
- Multi-pass prompt engine (observe → synthesize)
- 4 AI backends (Claude Code / OpenClaw / Hermes / direct API)
- Knowledge graph with entities / relationships / memory events
- Pipeline transparency (every step logged + queryable)
- Privacy controls (pause, blacklist, sensitive data redaction)
- Prompt self-eval (Ovo reflects on its own pipeline quality)
- Bootstrap onboarding (4-step seed)

**In Progress** 🚧
- Trust ladder UI (per-action autonomy levels: show → draft → confirm → auto + 5s undo → full delegation)
- Glass butler floating window (real-time "Ovo is doing X because Y" with [Let it] [Don't] [Never again] buttons)
- AI behavior timeline as the main view (currently buried in a second-level panel)

**Planned** 🔮
- Windows + Linux support
- Plugin/extension system
- KPI dashboard (TTFV, hit rate, undo rate — see [`PRODUCT_PHILOSOPHY.md`](docs/PRODUCT_PHILOSOPHY.md))
- macOS Notarization + auto-updates
- Multi-language UI (currently 中文/English mixed)

See [open milestones](https://github.com/dushaobindoudou/ovo/milestones) for what's coming next.

---

## 📚 Documentation

| Doc | What it's for |
|---|---|
| [`PRODUCT_PHILOSOPHY.md`](docs/PRODUCT_PHILOSOPHY.md) | The project constitution — read this before contributing to product direction |
| [`UX_AUDIT.md`](docs/UX_AUDIT.md) | 65 known UX issues with priorities (P0 → P3) |
| [`UI_DESIGN_AUDIT.md`](docs/UI_DESIGN_AUDIT.md) | Design system consistency report |
| [`BUG_REPORT.md`](docs/BUG_REPORT.md) | QA-tracked bugs with file:line references |
| [`ELECTRON_IPC_MAPPING.md`](docs/ELECTRON_IPC_MAPPING.md) | IPC channels and payload contracts |
| [`STATUS.md`](docs/STATUS.md) | Current implementation status by feature |

---

## 💬 Community

We're building Ovo in the open. Come help us shape it:

- 🐙 **[GitHub Discussions](https://github.com/dushaobindoudou/ovo/discussions)** — questions, ideas, show & tell
- 🐛 **[Issue tracker](https://github.com/dushaobindoudou/ovo/issues)** — bugs and feature requests
- 🐦 **[Twitter @dushaobin](https://twitter.com/dushaobin)** — build-in-public updates
- 💚 **WeChat group** (中文社区) — see README_CN.md for QR code

---

## 🤝 Contributing

Contributions are warmly welcomed — from typo fixes to new features.

- **First-time contributor?** Look for [`good first issue`](https://github.com/dushaobindoudou/ovo/labels/good%20first%20issue) — each one comes with full context, file pointers, and acceptance criteria.
- **Got a bigger idea?** Open a [Discussion](https://github.com/dushaobindoudou/ovo/discussions) first so we can align on direction.
- **Pull request?** See [`CONTRIBUTING.md`](CONTRIBUTING.md) for dev setup, code style, and PR workflow.

Every external PR gets a review within 24 hours and a Twitter thank-you. 🙏

---

## 🔐 Security

Found a vulnerability? Please **do not** open a public issue. See [`SECURITY.md`](SECURITY.md) for our responsible disclosure process.

---

## 💖 Support

If Ovo saves you time, consider supporting development:

- ⭐ [Star this repo](https://github.com/dushaobindoudou/ovo) — the cheapest way to help
- 🐦 [Share on Twitter](https://twitter.com/intent/tweet?text=Check%20out%20Ovo%20%E2%80%94%20open-source%20proactive%20AI%20desktop%20assistant&url=https://github.com/dushaobindoudou/ovo)
- ☕ [Buy me a coffee](https://ko-fi.com/dushaobin) (international) or [爱发电](https://afdian.com/a/dushaobin) (China)
- 🤝 [Contribute](CONTRIBUTING.md) code, docs, translations, or designs

---

## 📜 License

[MIT](LICENSE) © 2026 dushaobin

Ovo is and will always be **open source and free for personal use**. Commercial fork friendly under MIT.

---

## 🙏 Acknowledgements

Ovo stands on the shoulders of giants:

- [**Electron**](https://www.electronjs.org/) — desktop runtime
- [**React**](https://react.dev/) — UI framework
- [**Anthropic Claude**](https://www.anthropic.com/) — default AI backend
- [**Tesseract.js**](https://tesseract.projectnaptha.com/) — OCR engine
- [**better-sqlite3**](https://github.com/WiseLibs/better-sqlite3) — knowledge graph storage
- [**Lucide**](https://lucide.dev/) — icon library
- [**Tailwind CSS**](https://tailwindcss.com/) — styling
- And every contributor whose name will appear here ❤️

---

## ⭐ Star History

<a href="https://star-history.com/#dushaobindoudou/ovo&Date">
  <img src="https://api.star-history.com/svg?repos=dushaobindoudou/ovo&type=Date" alt="Star History Chart" width="600" />
</a>

---

<div align="center">

**Built with care by [@dushaobindoudou](https://github.com/dushaobindoudou) and the Ovo community.**

If this project resonates with you — please star it. It really helps a lot. ⭐

</div>
