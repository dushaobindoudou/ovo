# Good First Issues — Ready-to-Open Drafts

> 10 entry-level tasks ready to copy-paste into GitHub Issues.
> Each one is **scoped**, has **clear acceptance criteria**, and pointers to **file:line**.
> Estimated time: 30 min – 2 h each.

**How to use this file**:
1. Open https://github.com/dushaobindoudou/ovo/issues/new/choose
2. Copy one of the issue bodies below
3. Add labels: `good first issue` + the suggested labels at top
4. (Optional) Create a `good first issue` GitHub label if missing

---

## #1 — Clean up misplaced compile outputs at repo root

**Labels**: `good first issue`, `chore`, `repo-hygiene`
**Estimated time**: 30 min
**Skills**: git, .gitignore

### Background
Two compiled JavaScript files were accidentally created at the repo root:
- `/ipc-handlers.js` (38 KB — compiled from `electron/ipc-handlers.ts`)
- `/main.js` (15 KB — compiled from `electron/main.ts`)

They are not committed, but every contributor's `git status` shows them as untracked and they could easily be force-pushed by mistake. See `docs/BUG_REPORT.md` → N1 + N5.

### Files involved
- `/main.js` (delete)
- `/ipc-handlers.js` (delete)
- `/.gitignore` (add patterns)

### Acceptance criteria
- [ ] `main.js` and `ipc-handlers.js` deleted from repo root
- [ ] `.gitignore` has rules `/main.js` and `/ipc-handlers.js`
- [ ] `git status` no longer shows them as untracked
- [ ] One commit, message: `chore: ignore misplaced compile outputs at repo root`

---

## #2 — Standardize empty-state copy across panels

**Labels**: `good first issue`, `ui-consistency`, `i18n`
**Estimated time**: 1 h
**Skills**: TypeScript, React, attention to detail

### Background
We have 8+ variants of "no data" copy scattered across UI: `暂无错误` / `暂无日志` / `暂无业务日志` / `暂无注册任务` / `(空)` / `（空）` (full-width vs half-width brackets!) / `空闲` / etc. This makes the product feel inconsistent. See `docs/UI_DESIGN_AUDIT.md` → S8.

### Files involved
- `src/components/Console/SettingsPanel.tsx:340,355,384,439,485,544,652`
- `src/components/Console/MemoryPanel.tsx:130`
- `src/components/Onboarding/BootstrapWizard.tsx:204,208,212`
- `src/components/SuggestionPanel/PendingActionsSection.tsx:242`
- `src/components/SuggestionPanel/SuggestionPanel.tsx:65-67`

### Acceptance criteria
- [ ] All empty-state copy follows a consistent template: `还没有 X` (instead of mix of `暂无 X` and `(空)`)
- [ ] No more mixed full-width `（）` vs half-width `()` brackets in Chinese copy
- [ ] (Bonus) Create `src/components/shared/Empty.tsx` with `title` + `description` + `icon` props and use it in 2+ panels
- [ ] Visual diff screenshots before/after in PR

---

## #3 — Replace ⚠ emoji icons with lucide `<AlertTriangle />`

**Labels**: `good first issue`, `ui-consistency`
**Estimated time**: 1 h
**Skills**: React, lucide-react

### Background
The codebase mixes emoji icons (`⚠ 📸 🧠 💡`) with lucide-react icons (`<AlertCircle />`, `<Brain />`). Emoji render differently across OS/font and they're inconsistent with the rest of the icon system. Start with the `⚠` warning emoji as the test case. See `docs/UI_DESIGN_AUDIT.md` → B5 + T2.

### Files involved
- `src/components/Console/OverviewPanel.tsx:111`
- `src/components/Console/SettingsPanel.tsx:236`
- `src/components/Console/PipelineDetail.tsx:342`
- (search for any other `⚠` in `src/`)

### Acceptance criteria
- [ ] Every `⚠` emoji in JSX replaced with `<AlertTriangle size={N} className="text-[var(--warning)]" />` (use appropriate size to match nearby text)
- [ ] Layout matches before (no spacing regressions)
- [ ] Screenshot before/after in PR
- [ ] `pnpm typecheck` + `pnpm lint` pass

---

## #4 — Reframe BootstrapWizard headline to "restraint promise"

**Labels**: `good first issue`, `product-philosophy`, `copy`
**Estimated time**: 30 min
**Skills**: copywriting, React (trivial JSX edit)

### Background
Current onboarding headline `5 分钟告诉 ovo 关于你` creates an expectation that Ovo will "really know you" — which we can't yet deliver. The product philosophy says we should open with a **restraint promise** instead. See `docs/UX_AUDIT.md` → P0.1.

### Files involved
- `src/components/Onboarding/BootstrapWizard.tsx:94` (current headline)
- `src/components/Onboarding/BootstrapWizard.tsx:95` (subtitle)

### Acceptance criteria
- [ ] Headline changed to something like: `看着 Ovo 思考` or `Ovo 默认只看不做`
- [ ] Subtitle clarifies: `我会主动告诉你我在想什么，再问你是否要替你做`
- [ ] Translation also applied to English version (when it exists)
- [ ] Screenshot of new copy in PR

---

## #5 — Add tooltips to ConsoleSidebar tabs

**Labels**: `good first issue`, `ui-polish`, `a11y`
**Estimated time**: 30 min
**Skills**: React, basic CSS

### Background
The 4 tabs (`现在 / 记忆 / 回放 / 设置`) are abstract — new users don't know what `回放` means. Tooltips would help. See `docs/UX_AUDIT.md` → P1.5.

### Files involved
- `src/components/Console/ConsoleSidebar.tsx:14-18` (tab labels)

### Acceptance criteria
- [ ] Each tab has a `title="..."` attribute (browser-native tooltip is fine for v1)
- [ ] Tooltip copy explains the tab:
  - 现在: `Ovo 当前正在做什么 + 最新建议`
  - 记忆: `Ovo 形成的知识图谱 — 它学到了你的什么`
  - 回放: `历史 pipeline 与 AI 推理过程`
  - 设置: `偏好、隐私、AI 后端配置`
- [ ] (Bonus) Replace native tooltip with a styled Tooltip component
- [ ] Screenshot of tooltip in PR

---

## #6 — Contribute README screenshots

**Labels**: `good first issue`, `documentation`, `design`
**Estimated time**: 1 h
**Skills**: screen recording, image editing

### Background
README has 6 screenshot placeholders that need real screenshots. This is a high-impact, low-difficulty contribution that makes the project look 10x more professional on GitHub. See `docs/GITHUB_GROWTH_PLAN.md`.

### What's needed
- 6 PNG screenshots, 1920×1200 (or 16:10 retina), saved to `docs/assets/`:
  1. `screenshot-console.png` — main console with active pipeline
  2. `screenshot-floating.png` — floating icon with sticky card open
  3. `screenshot-toast.png` — suggestion toast in corner
  4. `screenshot-memory.png` — knowledge graph view
  5. `screenshot-pipeline.png` — pipeline detail (transparent reasoning)
  6. `screenshot-privacy.png` — settings privacy panel
- 1 GIF (or MP4) `docs/assets/demo.gif` — 30 second hero demo

### Acceptance criteria
- [ ] All 6 screenshots committed under `docs/assets/`
- [ ] README image links updated to point to them
- [ ] README_CN.md image links updated
- [ ] Images under 2 MB each (use [TinyPNG](https://tinypng.com/) if needed)
- [ ] Demo GIF under 10 MB (use [Kap](https://getkap.co/) → export as optimized GIF)

---

## #7 — Add splash screen on app launch

**Labels**: `good first issue`, `ux-polish`
**Estimated time**: 1-2 h
**Skills**: Electron, basic HTML/CSS

### Background
From double-clicking the Ovo icon to seeing the first UI, there's a 1-3 second black screen. A splash screen (with Ovo logo + "正在唤醒...") would make the launch feel intentional. See `docs/UI_DESIGN_AUDIT.md` → P2.10.

### Files involved
- `electron/main.ts` (create splash window before main window)
- New: `src/splash.html` (static HTML, no React needed)

### Acceptance criteria
- [ ] Splash window appears within 500 ms of launch
- [ ] Shows Ovo logo + spinner + tagline
- [ ] Splash closes when main window is ready (`ready-to-show` event)
- [ ] Splash window is frameless, transparent background, centered
- [ ] Screenshot / GIF of splash in PR

---

## #8 — Add 5-second undo for accepted suggestions

**Labels**: `good first issue`, `ux-polish`, `philosophy:teachable`
**Estimated time**: 1-2 h
**Skills**: React, Zustand

### Background
When you click "Accept" on a suggestion, the receipt only shows for 1.1 seconds. That's too fast to undo if you change your mind. Gmail-style 5-second undo would dramatically improve trust. See `docs/UX_AUDIT.md` → P1.3 + P1.4.

### Files involved
- `src/components/SuggestionPanel/SuggestionCard.tsx:26` (`RECEIPT_HOLD_MS = 1100`)
- `src/components/SuggestionPanel/SuggestionCard.tsx` accept handler

### Acceptance criteria
- [ ] Receipt now stays for 5 seconds (configurable constant)
- [ ] Receipt has an "撤销 / Undo" link that reverts the accept and brings the card back
- [ ] If user clicks Undo, the action is cancelled (call `cancelAction` IPC)
- [ ] Auto-dismiss after 5 seconds if no undo
- [ ] Screenshot / GIF of new flow in PR

---

## #9 — Create `errorTranslator` for common error messages

**Labels**: `good first issue`, `dx`, `philosophy:transparent`
**Estimated time**: 2 h
**Skills**: TypeScript

### Background
When an action fails, we currently show raw `error.message` strings like `ENOENT: no such file` or `AppleScript error -1743` — users can't understand or fix these. We need an error translator that maps common errors to user-friendly "what + why + what to do next" messages. See `docs/BUG_REPORT.md` → P0.12.

### Files involved
- New: `electron/error-translator.ts` (with `translateError(rawError: string): { title, why, action }`)
- `src/components/SuggestionPanel/PendingActionsSection.tsx:177` (use translator on `error`)

### Acceptance criteria
- [ ] New `error-translator.ts` exports `translateError()`
- [ ] At least 10 common patterns translated:
  - `ENOENT` → "找不到文件 — 可能被移动或删除了"
  - `EACCES` → "权限不够 — 检查文件夹访问权限"
  - `-1743` → "需要 AppleScript 权限 — 前往 系统设置 → 隐私 → 自动化 授权"
  - `ECONNREFUSED` → "连不上服务 — 检查网络或重启 Ovo"
  - `429` → "AI API 频率超限 — 等 1 分钟再试"
  - (5 more)
- [ ] Unknown errors fall back to original text
- [ ] Used in `PendingActionsSection.tsx` so users see friendly errors
- [ ] At least 5 unit tests in `electron/__tests__/error-translator.test.ts`

---

## #10 — Add search to SettingsPanel

**Labels**: `good first issue`, `ux-polish`
**Estimated time**: 1-2 h
**Skills**: React, basic search filtering

### Background
SettingsPanel is a single long scrolling page with many sections. Hard to find a specific setting like "blacklist" or "pause" without scrolling. A search box at the top would let users filter sections. See `docs/UX_AUDIT.md` → P1.22.

### Files involved
- `src/components/Console/SettingsPanel.tsx`

### Acceptance criteria
- [ ] Search input at top of SettingsPanel (sticky position)
- [ ] Typing filters which sections are visible (match on section title + body keywords)
- [ ] Empty search shows all sections
- [ ] Highlight matched keywords in visible sections (use `<mark>` tag)
- [ ] Keyboard shortcut: `Cmd+F` focuses the search input
- [ ] Screenshot / GIF in PR

---

## Bonus pool (5+ more ideas if these get claimed fast)

- Replace `text-[10.5px]` / `text-[13px]` hardcoded sizes with Tailwind type scale (`docs/UI_DESIGN_AUDIT.md` → I3)
- Define z-index scale in CSS variables and replace `z-[100] z-50 z-40 z-30` magic numbers (UI S5)
- Add `--motion-fast / --motion-base / --motion-slow` CSS variables and use them everywhere instead of `0.55s / 0.7s / 1.4s / 2.4s` scattered values (UI S7)
- Add `darkModeSupport: true` test — verify SiriOrb / AnimatedLogo / Tray icon all respond to theme switch (UI I1)
- Write missing TypeScript type for `electron-store` (currently using `any`)

---

## How to be a good maintainer for these

When someone claims an issue:
1. **Reply within 24 h** with "thanks, let me know if you get stuck"
2. **Be available for questions** in the issue thread
3. **Review the PR within 24 h** of submission
4. **Merge & thank** publicly (X / 即刻 + Contributors section in README)

This is the difference between "I tried but maintainer ghosted me" (most projects) and "I'll come back and contribute more" (the ones that grow).
