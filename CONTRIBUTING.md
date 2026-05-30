# Contributing to Ovo

Thanks for your interest in contributing! Ovo is an open-source project — every contribution, big or small, is genuinely appreciated.

> 中文贡献者：本文档英文为主，欢迎用中文开 issue / PR / discussion，我们都会回复。

---

## Ways to Contribute

You don't need to be a coder to help:

- 🐛 **Report bugs** — [open an issue](https://github.com/dushaobindoudou/ovo/issues/new/choose) with reproduction steps
- 💡 **Suggest features** — start a [Discussion](https://github.com/dushaobindoudou/ovo/discussions/categories/ideas) before coding so we can align
- 📖 **Improve docs** — typos, clarifications, translations all welcome
- 🌍 **Translate** — help us support more languages (currently 中文/English)
- 🎨 **Design** — UI mockups, icon refinements, animation ideas
- 💻 **Code** — see [Good First Issues](https://github.com/dushaobindoudou/ovo/labels/good%20first%20issue) for entry-level tasks

---

## Before You Start

### Read the philosophy first

Ovo has an opinionated product philosophy: **proactive + transparent + teachable**. Before proposing a change, read [`docs/product/PRODUCT_PHILOSOPHY.md`](docs/product/PRODUCT_PHILOSOPHY.md) — it's our compass for product decisions.

Every PR should be able to answer: **"Which axis of the philosophy does this serve?"** (proactive / transparent / teachable, or all three.)

### Check existing work

- Search [issues](https://github.com/dushaobindoudou/ovo/issues) and [Discussions](https://github.com/dushaobindoudou/ovo/discussions) first
- Check [`docs/archive/audits/UX_AUDIT.md`](docs/archive/audits/UX_AUDIT.md), [`docs/archive/audits/BUG_REPORT.md`](docs/archive/audits/BUG_REPORT.md), [`docs/archive/audits/UI_DESIGN_AUDIT.md`](docs/archive/audits/UI_DESIGN_AUDIT.md) — many known issues are already tracked there

---

## Development Setup

### Requirements

- **Node.js** 20+
- **pnpm** 10+ (we use pnpm, not npm/yarn)
- **macOS** (Apple Silicon or Intel) — Windows/Linux support is planned

### Initial setup

```bash
git clone https://github.com/dushaobindoudou/ovo.git
cd ovo
pnpm install
```

### Run in development mode

```bash
pnpm dev
```

This starts:
- Vite dev server (renderer) on `http://localhost:5173`
- Electron main process with hot reload

### Build a production DMG

```bash
pnpm pack:mac
# DMG appears in out/
```

### Useful scripts

```bash
pnpm typecheck         # TypeScript check (renderer + electron)
pnpm lint              # ESLint
pnpm test:agents       # Smoke test AI agents
pnpm test:e2e:scenarios # 30 real-world scenarios
pnpm test:ci           # Full CI suite locally
pnpm verify:p0         # P0 verification
```

---

## Project Structure

```
ovo/
├── electron/           # Main process (Electron, Node.js)
│   ├── main.ts                  # Entry point, BrowserWindow creation
│   ├── preload.cjs              # Context bridge, IPC API
│   ├── ipc-handlers.ts          # IPC handler registration
│   ├── agent-bridge.ts          # Claude / OpenClaw / Hermes / API
│   ├── prompt-engine.ts         # Multi-pass prompt construction
│   ├── knowledge-graph.ts       # SQLite-backed KG (entities, relations)
│   ├── action-executor.ts       # Execute AI-suggested actions
│   ├── auto-capture.ts          # Periodic screenshot
│   ├── ocr-engine.ts            # Tesseract.js OCR
│   └── ...
├── src/                # Renderer process (React, browser)
│   ├── App.tsx                  # Routes by URL hash (#console / #float / #panel)
│   ├── components/
│   │   ├── Console/             # Main window
│   │   ├── FloatingIcon/        # Always-on-top widget
│   │   ├── SuggestionPanel/     # Suggestion side panel + toast
│   │   ├── Onboarding/          # First-run wizard
│   │   └── shared/              # Reusable components (Card, Button, ...)
│   ├── hooks/                   # React hooks wrapping Electron IPC
│   └── stores/                  # Zustand state management
├── docs/               # Project documentation
├── scripts/            # Build / test / verify scripts
├── build/              # App icons (PNG / ICNS)
└── electron-builder.yml # Packaging config
```

See [`docs/engineering/ELECTRON_IPC_MAPPING.md`](docs/engineering/ELECTRON_IPC_MAPPING.md) for IPC channels and payload contracts.

---

## Code Style

### TypeScript / JavaScript

- We use **ESLint + TypeScript strict mode**. Run `pnpm lint && pnpm typecheck` before pushing.
- **No `any`** unless absolutely necessary (and then comment why).
- **No `eslint-disable`** without explaining the reason in a comment.

### React

- Functional components only (no class components).
- Hooks for state — `useState`, `useEffect`, `useMemo`, `useCallback` as appropriate.
- Custom hooks live in `src/hooks/`.
- Global state via Zustand stores in `src/stores/`.

### Styling

- Tailwind CSS for styles (with project CSS variables for tokens).
- Read CSS variables via `var(--accent)` etc. — **avoid hex literals**.
- For colors / spacing / radius scales, see `src/index.css`.

### Commits

We follow **Conventional Commits**:

```
feat: add trust ladder UI in Settings
fix: prevent OCR worker memory leak on terminate
docs: update CONTRIBUTING with development setup
chore: bump electron-builder to 26.0.12
refactor: extract shared modal component
test: add scenario for offline mode
```

Types: `feat / fix / docs / style / refactor / test / chore / perf / build / ci`

---

## Pull Request Workflow

### 1. Fork & branch

```bash
git clone https://github.com/YOUR-USERNAME/ovo.git
cd ovo
git checkout -b feat/your-feature-name
```

### 2. Make your changes

- Keep PRs **focused** — one feature/fix per PR
- Add tests if you're changing logic
- Update docs if you're changing behavior
- Run `pnpm typecheck && pnpm lint` locally before pushing

### 3. Open the PR

- Use the PR template (auto-loaded when you open a PR)
- Link the related issue (`Closes #123`)
- Include **screenshots / GIFs** for UI changes
- Describe **what** you changed and **why**

### 4. Review

- We aim to respond within **24 hours**
- Be open to feedback — we may suggest changes
- Once approved, a maintainer will merge (we use squash merge for clean history)

### 5. Celebrate

- Your name will appear in the [Contributors](https://github.com/dushaobindoudou/ovo/graphs/contributors) list
- First-time contributors get a Twitter/即刻 thank-you 🎉

---

## Reporting Bugs

Use the [bug report template](https://github.com/dushaobindoudou/ovo/issues/new?template=bug_report.yml). Include:

- **OS** (macOS Sonoma / Sequoia, Apple Silicon / Intel)
- **Ovo version**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Logs** — Settings → Developer Tools → Error Log → copy & paste

For security vulnerabilities, see [`SECURITY.md`](SECURITY.md) — **do not** open a public issue.

---

## Requesting Features

Open a [Discussion under "Ideas"](https://github.com/dushaobindoudou/ovo/discussions/categories/ideas) first. Help us evaluate:

- **What** are you trying to do?
- **Why** is this important to you?
- **Which philosophy axis** does this serve (proactive / transparent / teachable)?
- **Alternatives** you've considered

Once we agree on direction, we'll convert it to an issue with a milestone.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

**TL;DR**: be kind, be patient, assume good intent. Disagreement is fine — disrespect is not.

---

## License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).

---

## Questions?

- 💬 [GitHub Discussions](https://github.com/dushaobindoudou/ovo/discussions) — preferred for most questions
- 🐦 [Twitter @dushaobin](https://twitter.com/dushaobin) — quick async
- 💚 WeChat group — see [README_CN.md](README_CN.md)

Thanks again for being here. Let's build something great together. 🚀
