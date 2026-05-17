# Architecture

> Deep technical documentation for contributors and integrators.
> If you just want to use Ovo, see the [README](../README.md).
> If you want to align with project direction first, see [PRODUCT_PHILOSOPHY.md](PRODUCT_PHILOSOPHY.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Process Topology](#2-process-topology)
3. [Data Flow](#3-data-flow)
4. [Module Breakdown](#4-module-breakdown)
5. [IPC Contract](#5-ipc-contract)
6. [Knowledge Graph Schema](#6-knowledge-graph-schema)
7. [Multi-Pass Prompt Engine](#7-multi-pass-prompt-engine)
8. [Action Executor Model](#8-action-executor-model)
9. [Security Model](#9-security-model)
10. [Storage Layout](#10-storage-layout)
11. [Extension Points](#11-extension-points)
12. [Performance Characteristics](#12-performance-characteristics)
13. [Known Limitations](#13-known-limitations)
14. [Future Architecture](#14-future-architecture)

---

## 1. Overview

Ovo is an **Electron desktop application** with three responsibilities:

1. **Observe** — capture the user's screen periodically, extract text via OCR
2. **Reason** — build a knowledge graph + run multi-pass LLM reasoning
3. **Act** — surface suggestions, execute approved actions, learn from feedback

The system is **local-first**: screenshots, OCR, the knowledge graph, and the agent runtime all live on the user's machine. The only network calls are to the user's chosen LLM backend (Claude / OpenAI / etc.) — using the user's own API key.

### Design constraints (from PRODUCT_PHILOSOPHY.md)

| Constraint | Architectural implication |
|---|---|
| **Proactive** — Ovo acts before being asked | Continuous capture loop (every 5s) + scheduled agent pipeline |
| **Transparent** — every action auditable | Full pipeline logging in SQLite, queryable via UI |
| **Teachable** — user shapes behavior | Feedback engine with positive/negative pattern storage |
| **Local-first** | All data in `userData/`, no telemetry, BYO LLM key |

---

## 2. Process Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Electron Application                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Main Process  (Node.js + native modules)        │  │
│  │  • Window management        • SQLite (better-sqlite3)        │  │
│  │  • IPC handlers             • Tesseract.js OCR worker        │  │
│  │  • Auto-capture scheduler   • macOS Keychain (secrets)       │  │
│  │  • Agent backends           • powerMonitor (planned)         │  │
│  └────────┬──────────────────┬────────────────────┬─────────────┘  │
│           │ preload.cjs      │                    │                 │
│           │ contextBridge    │                    │                 │
│  ┌────────▼────────┐  ┌──────▼──────┐  ┌─────────▼─────────────┐  │
│  │  Console Window │  │  Floating   │  │  Suggestion           │  │
│  │  (#console)     │  │  Icon       │  │  Panel + Toast        │  │
│  │                 │  │  (#float)   │  │  (#panel, #toast)     │  │
│  │  Full management│  │  Always-on- │  │  Lightweight quick    │  │
│  │  interface      │  │  top status │  │  decisions            │  │
│  └─────────────────┘  └─────────────┘  └───────────────────────┘  │
│                                                                     │
│      React 19 + Zustand + Tailwind in every renderer window         │
└─────────────────────────────────────────────────────────────────────┘
                                ▼
            ┌──────────────────────────────────────┐
            │  External: User's chosen LLM API     │
            │  (Anthropic / OpenAI / local / etc.) │
            └──────────────────────────────────────┘
```

### Why multi-window

- **Console** is the full management UI — high information density, used episodically
- **Floating icon** is always-on-top, minimal footprint — for ambient awareness
- **Suggestion panel/toast** is the "in-flow" surface — quick decisions without context switch

Each window has its own React tree but shares the same Zustand stores via IPC sync — keeping UI state coherent across windows.

---

## 3. Data Flow

```
   ┌──────────────────────────────────────────────────────────────────┐
   │ User using their Mac (browser / IDE / Slack / Mail / anything)   │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ ⏱  every 5 seconds (configurable)
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 1. auto-capture.ts                                               │
   │    • desktopCapturer.getSources() per visible non-Ovo window      │
   │    • Apply blacklist (banking apps, password managers, etc.)     │
   │    • Skip if pausedUntil > now                                   │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ raw PNG buffers per window
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 2. ocr-engine.ts (Tesseract.js) + ocr-extractor.ts                │
   │    • OCR each captured window image                              │
   │    • sensitive-filter.ts redacts: API tokens / JWT / IDs / cards │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ redacted text + window metadata
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 3. event-processor.ts                                            │
   │    • Buffer OCR entries per window (rolling window)              │
   │    • Detect text deltas → derive activity signals                │
   │    • Update session-tracker (current focused app, dwell time)    │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ session events
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 4. scheduler.ts → agent pipeline (every 15s default, debounced)   │
   │    • Trigger if signal strength crosses threshold                │
   │    • Skip if recent pipeline result is still relevant            │
   └──────────────────────┬───────────────────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 5. prompt-engine.ts — Multi-pass prompt construction              │
   │    PASS 1 (observe):  intent + entities (~800 tokens out)        │
   │    PASS 2 (synthesize): predictions + suggestions + actions      │
   │                                                                  │
   │    Inputs to prompts:                                            │
   │    • Window OCR (cross-window, time-stamped)                     │
   │    • Knowledge graph context (relevant entities + relationships) │
   │    • Personality profile (working style, role, interests)        │
   │    • Recent activity trajectory (last 5 min)                     │
   │    • Pinned context (BootstrapWizard answers)                    │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ structured prompt
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 6. agent-bridge.ts → user's chosen backend                        │
   │    • Claude Code (claude command line)                           │
   │    • OpenClaw / Hermes (local proxies)                           │
   │    • Direct API (Anthropic / OpenAI compatible)                  │
   │    • All requests carry user's BYO API key                       │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ raw LLM response
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 7. agent-response-normalize.ts                                   │
   │    • Parse JSON (with self-repair on malformed responses)        │
   │    • Validate against schema (intent / suggestions / actions)    │
   │    • Tag confidence levels                                       │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ normalized AgentSuggestion[]
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 8. relation-inference.ts                                          │
   │    • Extract entities + relationships from LLM output            │
   │    • Persist to knowledge-graph.ts                               │
   └──────────────────────┬───────────────────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 9. UI surfaces (Suggestion Panel / Toast / FloatingIcon)         │
   │    • Show high-priority suggestions as toast                     │
   │    • Lower priority queued in side panel                         │
   │    • All visible in Pipeline timeline (transparency)             │
   └──────────────────────┬───────────────────────────────────────────┘
                          │ user accepts / rejects / teaches
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 10. action-executor.ts                                           │
   │     • Tier 1 (auto): log_note / create_todo / copy_to_clipboard │
   │     • Tier 2 (confirm): all others → pending state              │
   │     • Tier 3 (planned: trust ladder per-action levels)          │
   └──────────────────────┬───────────────────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────────────────┐
   │ 11. feedback-engine.ts                                           │
   │     • Record accept / reject / never-do-this-again              │
   │     • Recompute outcome_score for the pipeline                  │
   │     • Update personality-analyzer.ts profile                    │
   │     • Feed into prompt-self-eval.ts (P8 reflection loop)        │
   └──────────────────────────────────────────────────────────────────┘
```

Every step writes to the **pipeline log** (SQLite `pipeline_logs` table), making the entire flow reproducible and auditable in the UI.

---

## 4. Module Breakdown

### Main process modules (`electron/`)

| Module | Responsibility | Key dependencies |
|---|---|---|
| `main.ts` | Entry point, window lifecycle, app events | electron |
| `preload.cjs` | Context bridge (renderer → main IPC API surface) | contextBridge |
| `ipc-handlers.ts` | Central IPC handler registration | All below |
| `window-manager.ts` | BrowserWindow factory + window state persistence | electron |
| `auto-capture.ts` | Screenshot scheduler, blacklist, pause | desktopCapturer |
| `screenshot.ts` | Low-level screen capture helpers | electron |
| `ocr-engine.ts` | Tesseract.js worker pool | tesseract.js |
| `ocr-extractor.ts` | Higher-level OCR wrapper + text post-processing | ocr-engine |
| `sensitive-filter.ts` | Regex-based PII / secrets redaction | (none) |
| `event-processor.ts` | OCR buffer + activity signal extraction | session-tracker |
| `session-tracker.ts` | Current focused app, dwell time | (none) |
| `scheduler.ts` | Job scheduler (capture / agent / health-check) | node:timers |
| `agent-bridge.ts` | LLM backend abstraction + retry/timeout | fetch, AbortController |
| `agent-executor.ts` | Multi-pass orchestration | agent-bridge |
| `prompt-engine.ts` | Prompt template construction | knowledge-graph, personality-analyzer |
| `adaptive-prompt.ts` | Prompt variant selection based on context | prompt-engine |
| `agent-response-normalize.ts` | JSON parsing + schema validation + repair | (none) |
| `relation-inference.ts` | Extract KG entities/relations from LLM output | knowledge-graph |
| `knowledge-graph.ts` | SQLite KG (entities / relationships / events / logs) | better-sqlite3 |
| `action-executor.ts` | Action dispatch, auto-execute whitelist | macos-actions, agent-executor |
| `macos-actions.ts` | macOS-native primitives (Reminders / Calendar / Mail / iMessage) | osascript |
| `feedback-engine.ts` | Reaction recording + outcome scoring | knowledge-graph |
| `personality-analyzer.ts` | User profile derivation | knowledge-graph |
| `prompt-self-eval.ts` | P8: daily reflection on low-score pipelines | agent-bridge |
| `secrets-store.ts` | Encrypted API key storage (macOS Keychain) | safeStorage |
| `preferences-store.ts` | Plain preferences persistence | fs |
| `tts-engine.ts` | Edge TTS for voice readback | msedge-tts |
| `logger.ts` | Buffered file logger | fs |
| `error-logger.ts` | Critical error capture + UI alert broadcast | logger |
| `error-translator.ts` | Raw error → human-friendly message | (none) |
| `safe-execute.ts` | Centralized try/catch wrapper (prevents swallow) | error-logger |
| `system-events.ts` | powerMonitor + display + network event hub | electron |
| `text-diff.ts` | Diff utility for upcoming Diff view | (none) |
| `file-recognizer.ts` | File path → entity type mapping | (none) |
| `icon-renderer.ts` | Tray icon SVG → nativeImage | electron |
| `path-helpers.ts` | userData / dist / preload path resolution | electron |
| `electron-loader.ts` | Lazy require electron (for non-electron contexts) | (runtime) |
| `frame-change.ts` | Detect significant frame change to gate captures | (image diff) |

### Renderer modules (`src/`)

| Module | Responsibility |
|---|---|
| `App.tsx` | URL hash router (#console / #float / #panel / #toast) |
| `components/Console/*` | Main window panels (Overview / Memory / Process / Settings / etc.) |
| `components/FloatingIcon/*` | Always-on-top widget with status orb |
| `components/SuggestionPanel/*` | Side panel + Toast window |
| `components/Onboarding/*` | First-run BootstrapWizard |
| `components/shared/*` | Reusable components (Card / Button / Modal / Empty / etc.) |
| `hooks/*` | Wrappers around `window.ovoAPI` IPC calls (one hook per IPC namespace) |
| `stores/*` | Zustand stores (runtime / suggestions / settings / pipeline / windows) |
| `utils/errorTranslator.ts` | Renderer-side bridge to main process error-translator |

---

## 5. IPC Contract

The renderer accesses main-process functionality exclusively through `window.ovoAPI`, exposed via `electron/preload.cjs` and `contextBridge`. The full surface is documented in [`docs/ELECTRON_IPC_MAPPING.md`](ELECTRON_IPC_MAPPING.md).

### Namespaces (44 total)

```
window.ovoAPI = {
  capture:    { start, stop, takeScreenshot, getInterval, ... }
  ocr:        { initialize, recognize, terminate }
  agent:      { status, setBackend, setApiConfig }
  kg:         { clear, export, getStats, listEntities, ... }
  process:    { listPipelines, getPipelineDetail, ... }
  history:    { listEvents, listFeedback }
  privacy:    { pause, resume, getPauseState, getBlacklist, setBlacklist }
  suggestion: { feedback }
  action:     { confirm, cancel }
  pipeline:   { clear }
  logs:       { getSystem, getBusiness }
  logger:     { info, warning, error }
  alerts:     { getRecent }
  tts:        { speak }
  app:        { getVersion, openExternal }
  permissions: { getStatus, requestScreenRecording, openSettings }
  scheduler:  { setInterval, getStatus }
  floating:   { show, hide, setPosition }
  toast:      { show, dismiss, setVerbosity, setDoNotDisturb }
  prefs:      { getBootstrapStatus, saveBootstrap }
  dev:        { ... developer-only utilities }
  windows:    { ... window management }
  insights:   { ... }
  promptEval: { list, runNow, setStatus }
  errorLog:   { getRecent }
  health:     { getConfig, setConfig }
}
```

### Known security gap (tracked in BUG_REPORT C4 + M7)

Currently:
- All 44 namespaces are exposed to **all** renderer windows
- No payload schema validation on the main side
- A compromised renderer (XSS via OCR content, devtools) can call any IPC

**Mitigation in progress**:
- `electron/ipc-schema.ts` (new module) — Zod schemas per channel
- Per-window API surfaces (Floating window gets a subset, Toast even less)
- `safeHandle(channel, schema, fn)` wrapper for all IPC handlers

See `docs/BUG_REPORT.md` C4 + A6 for the threat model.

---

## 6. Knowledge Graph Schema

Stored in `userData/knowledge-graph.db` (SQLite via better-sqlite3).

### Core tables

```sql
-- Entities: people, projects, documents, concepts, organizations, etc.
CREATE TABLE entities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,        -- person / project / document / concept / org / location / application / file
  description     TEXT,
  attributes      TEXT,                  -- JSON blob of type-specific fields
  mention_count   INTEGER DEFAULT 0,
  first_seen      INTEGER NOT NULL,      -- unix seconds
  last_seen       INTEGER NOT NULL,
  last_referenced_at INTEGER DEFAULT 0,
  quality_score   REAL DEFAULT 0.5,      -- confidence in this entity (0..1)
  pinned          INTEGER DEFAULT 0      -- user-pinned (always in prompt context)
);

-- Relationships: how entities relate
CREATE TABLE relationships (
  id              TEXT PRIMARY KEY,
  from_entity_id  TEXT NOT NULL,
  to_entity_id    TEXT NOT NULL,
  type            TEXT NOT NULL,        -- works_on / mentioned_with / owns / depends_on / etc.
  strength        REAL DEFAULT 0.5,
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  inferred        INTEGER DEFAULT 0,    -- 1 = LLM-inferred (lower trust)
  FOREIGN KEY (from_entity_id) REFERENCES entities(id),
  FOREIGN KEY (to_entity_id)   REFERENCES entities(id)
);

-- Memory events: things that happened
CREATE TABLE memory_events (
  id              TEXT PRIMARY KEY,
  app_name        TEXT,
  window_title    TEXT,
  content         TEXT,                  -- redacted OCR snippet or AI summary
  summary         TEXT,
  intent          TEXT,                  -- LLM-derived intent label
  source_window_id TEXT,
  entity_ids      TEXT,                  -- JSON array of related entity IDs
  importance      REAL DEFAULT 0.5,
  created_at      INTEGER NOT NULL
);

-- User feedback on suggestions
CREATE TABLE user_feedback (
  id              TEXT PRIMARY KEY,
  pipeline_id     TEXT,
  suggestion_id   TEXT,
  reaction        TEXT,                  -- accepted / rejected / ignored / never_again
  intent_type     TEXT,
  created_at      INTEGER NOT NULL
);

-- Pipeline run log (the transparency backbone)
CREATE TABLE pipeline_logs (
  id              TEXT PRIMARY KEY,
  stage           TEXT NOT NULL,         -- aggregate / agent / schema / suggestions / actions / kg-update
  status          TEXT NOT NULL,         -- success / failed / pending
  input           TEXT,                  -- JSON snapshot of stage input
  output          TEXT,                  -- JSON snapshot of stage output
  duration_ms     INTEGER,
  outcome_score   REAL DEFAULT NULL,     -- recomputed when feedback arrives
  created_at      INTEGER NOT NULL
);

-- Business-level events (higher-level than system log)
CREATE TABLE business_logs (
  id              TEXT PRIMARY KEY,
  pipeline_id     TEXT,
  node            TEXT NOT NULL,         -- e.g. "ocr.recognize", "intent.predict"
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

-- Prompt-self-eval suggestions (P8 reflection loop output)
CREATE TABLE prompt_eval_suggestions (
  id              TEXT PRIMARY KEY,
  scope           TEXT,
  problem         TEXT,
  proposed_change TEXT,
  evidence        TEXT,
  confidence      REAL,
  status          TEXT DEFAULT 'pending',  -- pending / applied / dismissed
  created_at      INTEGER NOT NULL
);
```

### Migration strategy (current)

Migrations are applied at startup via try-catch `ALTER TABLE` statements. **This is fragile** — see `docs/BUG_REPORT.md` C9 + A7. Future work: introduce `schema_version` table + ordered migration files.

### Privacy properties

- All KG data is **local** — never uploaded
- `kg:clear` IPC wipes the entire database
- `kg:export` produces a JSON dump for user backup
- (Planned) per-entity delete + per-time-range delete

---

## 7. Multi-Pass Prompt Engine

To keep response quality high without exploding token cost, Ovo runs **two passes** per pipeline:

### Pass 1: Observe

**Goal**: extract structured intent + key entities from raw OCR.

```
Inputs:
  - Cross-window OCR (last 5 minutes, time-stamped)
  - Currently focused app + window
  - User personality summary (concise, ~50 tokens)
  - Pinned entities (always in context)

Output schema:
  {
    intent: "...",           // user-readable intent label
    entities: [{id, type, ...}],
    confidence: 0..1,
    notes: "..."
  }
```

### Pass 2: Synthesize

**Goal**: turn observed intent into actionable suggestions.

```
Inputs:
  - Pass 1 output
  - Relevant KG context (entities + 1-hop relationships)
  - Last 20 pipeline outcomes (success / failure / user reaction)
  - Negative patterns ("never_again" rules from feedback-engine)

Output schema:
  {
    prediction: "...",       // what user is likely to do next
    suggestions: [{
      id, type, title, content, priority, requireConfirm
    }],
    actions: [{
      id, type, params, requireConfirm, priority
    }],
    content: [...],          // additional context for the user
    relationships: [...]     // new relationships to record in KG
  }
```

### Why two passes (not one)

- **Quality**: Pass 1's intent classification grounds Pass 2's suggestions in a clear hypothesis. Single-pass tends to produce mush.
- **Cost**: Pass 1 output is short (intent + entities), so Pass 2's prompt is leaner.
- **Auditability**: Each pass logged separately → user sees the AI's reasoning chain.

### Adaptive prompt selection (`adaptive-prompt.ts`)

For specific contexts, swap in specialized prompts:
- IDE focus → "code intent" prompt variant
- Email/messaging → "reply prediction" prompt variant
- Browser research → "knowledge gathering" prompt variant

---

## 8. Action Executor Model

Currently a **2-tier model** (planned: 5-tier trust ladder, see PRODUCT_PHILOSOPHY.md):

### Tier 1: Auto-execute (whitelist)

Three action types execute silently — local, reversible, user-visible:
- `log_note` → write to KG events
- `create_todo` → write to KG events with tag
- `copy_to_clipboard` → set system clipboard

### Tier 2: Confirm-required (everything else)

All other actions enter `status: "pending"` state and wait for user confirmation in the UI. This includes:
- `send_email`, `send_imessage`, `set_reminder`, `add_calendar`
- `open_url`, `search_web`, `index_path`
- Any LLM-planned action via `agent-executor.planAndExecuteAction()`

### Planned: 5-tier trust ladder (per action type)

| Level | Behavior |
|---|---|
| Lv.0 | Show only (no draft, no execute) |
| Lv.1 | Draft (prepare but wait for click) |
| Lv.2 | Confirm (one-click execute with preview) |
| Lv.3 | Auto + 5s undo (Gmail-style) |
| Lv.4 | Fully delegated (specific actions + time windows) |

User adjusts per-action-type slider in Settings. See UX_AUDIT P0.3 + P0.10.

---

## 9. Security Model

### What's protected

| Threat | Defense |
|---|---|
| API key leak | `secrets-store.ts` uses macOS `safeStorage` (Keychain). Renderer can only check "is configured" — never reads plaintext. |
| Sensitive content in OCR | `sensitive-filter.ts` regex redacts API tokens, JWT, credit cards, IDs, passwords, etc. before LLM call. |
| Always-on observation of private apps | App-level blacklist in `preferences-store.ts` — password managers, banking apps blocked by default. |
| Unwanted screen capture | Hard pause (`privacy:pause` IPC) stops auto-capture entirely. |
| Telemetry without consent | **No telemetry exists.** Zero phone-home calls. |
| Disk leakage | All data in standard `userData/` (macOS sandbox). secrets.json is `chmod 0o600`. |
| Update tampering | (Planned) Code signing + Notarization, see BUG_REPORT C6. |

### What's NOT yet protected (tracked in BUG_REPORT)

| Gap | Tracker |
|---|---|
| IPC payload schema validation | C4 — renderer can send arbitrary payloads to main |
| Per-window IPC permission | M7 — floating window can call dev.* APIs |
| Suspend/resume awareness | C5 — Ovo captures during system sleep/lock |
| Dependency audit on China mirror | M10 — pnpm audit returns 405 |
| Auto-update mechanism | C7 — no automatic update channel yet |

See `docs/BUG_REPORT.md` for full threat inventory + tracking.

---

## 10. Storage Layout

All persistent data lives in `app.getPath("userData")`:

```
~/Library/Application Support/Ovo/   (macOS)
├── knowledge-graph.db          # SQLite — entities, relationships, events, pipeline_logs
├── secrets.json                # mode 0600 — apiKeyCipher + baseUrl + model
├── preferences.json            # User prefs: bootstrap, blacklist, pause state, theme
├── logs/
│   ├── error.log               # Rolling 500 KB × 5
│   ├── error.log.1 ... .5      # Rotated logs
│   └── system.log              # Lower-severity logs
└── snapshots/                  # (Planned) screenshot archive for transparency
    └── YYYY-MM-DD/<pipelineId>.webp
```

### Cleanup hooks

- `before-quit` event flushes buffered logs
- Log rotation triggers at 500 KB per file
- (Planned) Screenshot snapshots auto-purge after 30 days

---

## 11. Extension Points

Designed for future plugin/extension support:

| Extension type | Current state | Plan |
|---|---|---|
| **New AI backend** | `agent-bridge.ts` has 4 backends hardcoded | Plugin manifest + dynamic registration |
| **New action type** | Walk through `agent-executor.planAndExecuteAction()` (no code change needed for LLM-planned actions) | Native extension API for compiled actions |
| **New screen content processor** | Edit `ocr-extractor.ts` | Pipeline-stage plugin slot |
| **Custom prompt variant** | Edit `adaptive-prompt.ts` | User-defined prompt templates in `userData/prompts/` |
| **Custom KG entity types** | Already pluggable via `type` field | Schema declaration files |

---

## 12. Performance Characteristics

### Baseline (on M2 MacBook Pro)

| Metric | Value |
|---|---|
| Idle CPU | ~1-2% |
| Capture + OCR loop | ~5-10% peak, sub-second |
| Pass 1 LLM call | 1-3 s typical |
| Pass 2 LLM call | 2-5 s typical |
| End-to-end pipeline | 5-15 s typical |
| Memory (steady state) | 250-400 MB |
| Disk growth | ~1-2 MB / day (logs + KG) |

### Bottlenecks (known)

- **OCR**: Tesseract.js is JS-based; Apple Silicon native OCR (`@cherrystudio/mac-system-ocr`) is faster but only available on macOS 10.15+
- **LLM cold start**: First call after idle period takes 2-3x longer (DNS / TLS warmup)
- **KG joins on large graphs**: > 10k entities slows down 1-hop queries; planned: pre-computed materialized views

---

## 13. Known Limitations

| Limitation | Impact | Tracker |
|---|---|---|
| macOS only | Linux/Windows users can't run Ovo | Roadmap v0.5+ |
| Unsigned DMG | First-launch Gatekeeper prompt | BUG_REPORT C6 |
| No auto-update | Users stuck on old versions | BUG_REPORT C7 |
| No suspend/resume handling | Burst CPU on wake from sleep | BUG_REPORT C5 |
| No multi-display awareness | FloatingIcon can land off-screen after display change | BUG_REPORT M9 |
| Single user / single profile | No work/personal separation | (not yet planned) |
| English + Chinese only | UI not localized to other languages | Roadmap v0.4 |

---

## 14. Future Architecture

### v0.3 — Trust Ladder + Signing

- 5-tier per-action trust slider (replaces 2-tier whitelist)
- Apple Developer ID + Notarization
- electron-updater for automatic updates
- IPC schema validation (Zod) + per-window permission

### v0.4 — Cross-platform

- Windows support (test on Win 11)
- Linux support (test on Ubuntu / Fedora)
- Decision: stay on Electron or migrate to Tauri (gains: ~10x smaller binary, native webview; risks: rewriting renderer-native bridge)

### v0.5 — Plugin SDK

- Manifest-based extension registration
- Sandboxed extension runtime
- Built-in registry of extensions
- API stability commitment (SemVer-style)

### v1.0 — Stability

- All P0 issues from UX_AUDIT resolved
- Signed + Notarized + Auto-update working
- 30-day MTBF (mean time between bugs)
- > 1k stars + active contributor community

---

## See also

- [`PRODUCT_PHILOSOPHY.md`](PRODUCT_PHILOSOPHY.md) — why Ovo exists, what makes it different
- [`ELECTRON_IPC_MAPPING.md`](ELECTRON_IPC_MAPPING.md) — full IPC channel reference
- [`AI_BACKENDS.md`](AI_BACKENDS.md) — backend setup and trade-offs (this file)
- [`PRIVACY.md`](PRIVACY.md) — privacy commitments and data flow audit
- [`BUG_REPORT.md`](BUG_REPORT.md) — known issues with file:line references
- [`UX_AUDIT.md`](UX_AUDIT.md) — product/UX backlog
- [`UI_DESIGN_AUDIT.md`](UI_DESIGN_AUDIT.md) — design system consistency report
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — how to contribute code/docs/translations
- [`SECURITY.md`](../SECURITY.md) — responsible disclosure
