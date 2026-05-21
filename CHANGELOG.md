# Changelog

All notable changes to Ovo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

_Targeting 0.3.0. Still ahead: macOS code signing + Notarization, auto-update
mechanism, and the trust ladder UI. Already landed on `main` since 0.2.0:_

### Added
- 🌍 **Full bilingual UI (简体中文 / English)** — language switcher promoted to a
  standalone card at the very top of Settings, with localized status bar, all
  Settings sections, Overview / Memory / Process panels, suggestion & action
  toasts, and main-process surfaces (tray menu, receipt toasts)
- 🧠 **5W memory model + timeline view** — memory events captured as
  who/what/when/where/why and browsable on a timeline
- ⚡ **Executable action toasts** — actions surface in a toast with
  draft→promote confirmation before anything is sent
- 🔁 **T8 reverse calibration + draft expiry scheduling** — knowledge-graph
  schema split, drafts auto-expire instead of accumulating
- 🐳 **DevContainer + all-contributors infrastructure** for easier contribution
- 📝 Launch & self-audit docs: `FOUNDER_STORY.md`, `REFLECTION_LOG.md`,
  `UNRESOLVED_ISSUES.md`

### Changed
- ♻️ Console / Suggestion panels refactored onto a shared component library
- ♻️ `ipc-handlers` split into focused `ipc/*` modules + knowledge-graph migrations
- 🤖 **hermes backend is now the default priority**, with agent-output schema
  validation and an evidence grounder; the `claude -p` execution path was removed
- 🎨 Unified brand color to systemBlue; default theme now follows the system
- 📤 Output view shows deliverables only; memory search box narrowed;
  exported JSON is unwrapped

### Fixed
- 🔐 Keychain encryption no longer triggers repeated permission popups
- 💾 Draft promote no longer loses data
- 🪟 Window-enumeration permission errors no longer flood the logs
- 🖼 Icon red/blue channel bug fixed
- 📡 Action-confirm flow broadcast + macOS handler + OCR / sensitive-filter fallbacks

### Security
- 🔑 Keychain encryption defaults to **off** until a signed build ships
  (avoids confusing first-run prompts); action trust rebalanced toward
  auto-running reversible actions while still confirming anything that sends

---

## [0.2.0] — 2026-05-17 — "Going Public"

This is the first public release of Ovo. The product itself was already
functional in 0.1.0; this release is about **shipping it to the world** —
proper documentation, license, community infrastructure, and a clear
identity.

### Added
- 📜 **MIT License** — open source, commercial-friendly
- 🌍 **Bilingual README** — full English (main) + 简体中文 with hero, Why Ovo,
  vs other AI tools comparison, install guide, architecture, roadmap
- 🏛 **Product philosophy** (`docs/PRODUCT_PHILOSOPHY.md`) — project constitution
  defining the proactive + transparent + teachable philosophy
- 📊 **Audit reports** from 3 expert perspectives:
  - `docs/UX_AUDIT.md` — 65 product/UX issues + KPI framework
  - `docs/BUG_REPORT.md` — 37 system bugs + 8 architecture anti-patterns
  - `docs/UI_DESIGN_AUDIT.md` — 22 design consistency issues
- 🚀 **GitHub growth plan** (`docs/GITHUB_GROWTH_PLAN.md`) — 90-day path to 1000 stars
- 🤝 **Community infrastructure**:
  - `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Covenant 2.1), `SECURITY.md`
  - `.github/ISSUE_TEMPLATE/` (bug/feature/question YAML forms)
  - `.github/PULL_REQUEST_TEMPLATE.md` with philosophy alignment prompt
  - `.github/FUNDING.yml` (GitHub Sponsors + Ko-fi + 爱发电)
- 🏗 **CI/CD workflows**:
  - `.github/workflows/ci.yml` — typecheck + lint + build on macOS
  - `.github/workflows/release.yml` — tag-triggered multi-arch DMG build
- 🐣 **`docs/GOOD_FIRST_ISSUES.md`** — 10 ready-to-open issue drafts
- 📦 **`docs/RELEASE_PROCESS.md`** — step-by-step release runbook
- 🏷 **`.github/labels.yml`** — batch-importable GitHub label config
- 🗂 **`docs/assets/README.md`** — guide for contributing screenshots/GIFs

### Changed
- `package.json` populated with `license`, `homepage`, `bugs`, `repository`,
  `keywords`, `author`, English-language `description`
- README replaced from 27-line placeholder to ~370-line world-class structure
- Version bumped from 0.1.0 → 0.2.0

### Removed
- Misplaced compile outputs `/main.js` and `/ipc-handlers.js` from repo root
  (now `.gitignore`-d to prevent recurrence)

### Security
- Published `SECURITY.md` with responsible disclosure process and 48h SLA

---

## [0.1.0] — 2026-04-15

Initial private development version.

### Shipped
- Three-window architecture (main console / floating icon / suggestion panel)
- Auto screen capture every 5 seconds via `desktopCapturer`
- OCR via Tesseract.js + native macOS OCR fallback
- Multi-pass prompt engine (observe → synthesize)
- Four AI backends: Claude Code · OpenClaw · Hermes · direct API
- Knowledge graph (SQLite) with entities, relationships, memory events
- Pipeline transparency — every step logged
- Privacy controls — pause, app blacklist, sensitive data redaction
- Prompt self-eval (P8)
- Bootstrap wizard (4-step onboarding)
- WeChat Mac design guidelines applied to UI
- Tray icon support
- Floating window transparency

### Known issues at this version
- macOS DMG is unsigned — first launch requires right-click → Open
- No auto-update mechanism yet (planned for v0.3)
- Windows / Linux not yet supported (planned for v0.5+)
- See `docs/BUG_REPORT.md` for full list of tracked issues

---

[Unreleased]: https://github.com/dushaobindoudou/ovo/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dushaobindoudou/ovo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dushaobindoudou/ovo/releases/tag/v0.1.0
