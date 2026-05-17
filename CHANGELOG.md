# Changelog

All notable changes to Ovo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Product philosophy document (`docs/PRODUCT_PHILOSOPHY.md`) — project constitution
- Comprehensive UX audit (`docs/UX_AUDIT.md`) — 65 known issues across 4 priority levels
- Bug report (`docs/BUG_REPORT.md`) — 37 tracked bugs with file:line references
- UI design audit (`docs/UI_DESIGN_AUDIT.md`) — design system consistency report
- GitHub growth plan (`docs/GITHUB_GROWTH_PLAN.md`) — 90-day path to 1000 stars
- MIT License
- README in English (main) + 简体中文
- CONTRIBUTING / SECURITY / CHANGELOG / CODE_OF_CONDUCT
- `.github/` issue + PR templates, FUNDING, workflows

### Changed
- `package.json` now includes proper `license`, `homepage`, `bugs`, `repository`, `keywords`, `author` fields
- Repository description updated for SEO

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

[Unreleased]: https://github.com/dushaobindoudou/ovo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dushaobindoudou/ovo/releases/tag/v0.1.0
