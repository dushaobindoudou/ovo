# Privacy Policy

> 中文版：[PRIVACY_CN.md](PRIVACY_CN.md)
> Last updated: 2026-05-17 · Applies to: Ovo v0.2.0 and later

This is the privacy policy for **Ovo**, an open-source proactive AI desktop assistant. As open source software you run locally, the privacy model is fundamentally different from cloud services — and we want to be specific about exactly what that means.

---

## The Short Version

If you only read one paragraph:

> **Ovo runs entirely on your machine.** Screenshots, OCR text, the knowledge graph, your preferences, and your API key all live on your computer and never leave it. The only network calls Ovo makes are to the LLM provider you choose (Anthropic / OpenAI / your local model), using the API key you provide. We collect zero telemetry. Zero analytics. We don't run any servers that see your data.

---

## 1. What Ovo Collects (and Where It Goes)

| Data | Where it's stored | Who can see it | Why |
|---|---|---|---|
| **Screenshots** | RAM only, discarded after OCR | Only Ovo's local process | Source for OCR text extraction |
| **OCR text** (redacted) | `~/Library/Application Support/Ovo/knowledge-graph.db` (SQLite, local) | You + Ovo's local process + the LLM you chose | Powers the AI's understanding of your context |
| **Knowledge graph** (entities, relationships, events) | Same SQLite file (local) | You + Ovo's local process + the LLM you chose | Long-term memory for the AI |
| **Preferences** (theme, blacklist, intervals) | `~/Library/Application Support/Ovo/preferences.json` | You + Ovo's local process | Your configuration |
| **API key** | `~/Library/Application Support/Ovo/secrets.json`, encrypted via macOS Keychain | You + Ovo's local process (encrypted; renderer can never read plaintext) | To call the LLM you chose |
| **Logs** (system + business + error) | `~/Library/Application Support/Ovo/logs/` (rotating 500 KB × 5 files) | You + Ovo's local process | Debugging |

### What Ovo never collects

- ❌ Phone home pings ("Ovo is alive" beacons)
- ❌ Usage analytics ("you used feature X N times")
- ❌ Crash reports sent to us
- ❌ Your IP address
- ❌ Your name, email, or any identifier
- ❌ Telemetry of any kind

You can verify this by reading the source code — `grep -rE "fetch|http|axios|got" electron/` will show every network call Ovo can make. Every call goes to **your** chosen LLM endpoint, never to a server we operate.

---

## 2. Network Activity — What Leaves Your Computer

Exactly one type of network call leaves your machine:

### LLM API requests

When Ovo's pipeline runs, it sends a prompt to the LLM backend you configured:

| Backend | Endpoint | What's sent |
|---|---|---|
| Claude Code | `claude` CLI (local subprocess; routing depends on your CLI config) | Prompt text |
| OpenClaw | `http://localhost:<port>/...` (local) | Prompt text |
| Hermes | `http://localhost:<port>/...` (local) | Prompt text |
| Direct API | `<your apiBaseUrl>/v1/chat/completions` (default `api.anthropic.com`) | Prompt text + your API key in `Authorization` header |

### What's in the prompt

A typical Ovo prompt contains:

- **Redacted OCR text** from your recently captured windows (last 5 minutes)
- **Knowledge graph excerpts** — relevant entities + relationships
- **Personality summary** — derived from your past patterns (e.g. "user prefers concise replies")
- **Recent activity** — current app, dwell time
- **Pinned context** from your BootstrapWizard answers

### What's NOT in the prompt

- Anything matched by `electron/sensitive-filter.ts`:
  - API tokens (sk-… / ghp-… / AIza-… / AKIA-… / xoxb-… etc.)
  - JWT tokens
  - Credit card numbers (13-19 digit sequences with Luhn validation)
  - Chinese ID numbers + phone numbers
  - SSH / RSA private keys
  - `.env`-style secret patterns
  - "password: …" / "verification code: …" patterns
- Anything from apps in your blacklist (default includes password managers, banking apps)
- Anything during a paused period (`privacy:pause` IPC)

You can audit the redaction regex list at [`electron/sensitive-filter.ts`](../electron/sensitive-filter.ts).

---

## 3. Third-Party Dependencies (Who Else Touches Your Data)

| Dependency | What it does | Data exposure |
|---|---|---|
| **Anthropic / OpenAI / your LLM** | Receives Ovo's prompts | Sees redacted OCR + KG excerpts + personality. Subject to their own privacy policy. |
| **Tesseract.js** | OCR engine (runs locally) | Sees raw screenshots in memory; discards after returning text |
| **@cherrystudio/mac-system-ocr** | macOS-native OCR (optional, runs locally) | Same as above |
| **better-sqlite3** | Local database (runs locally) | Native binding to SQLite, no network |
| **Electron** | App runtime | Standard Chromium privacy considerations apply to the renderer process |
| **Edge TTS** (only if you enable TTS) | Microsoft Edge text-to-speech service (online) | Sees the text you ask Ovo to speak |

**Important about your LLM provider**: Anthropic, OpenAI, and other providers have their own privacy policies that govern what they do with the prompts you send. By default Anthropic does not train on API requests, but check their current terms. If you use Claude Code, prompts go through your local CLI which proxies to Anthropic; same caveat.

If you want zero third-party data exposure, configure Ovo to use a **local LLM** (e.g. via Ollama through the Direct API backend).

---

## 4. Your Control Over Your Data

| Action | How |
|---|---|
| **Pause all observation** | Click pause in Console or FloatingIcon (5/15/60 min) |
| **Permanently block an app** | Settings → Privacy → blacklist → add app name |
| **Delete your knowledge graph** | Settings → Developer Tools → Knowledge Graph → 清空 (or `kg:clear` IPC) |
| **Export your data** | Settings → 记忆 (Memory) tab → ⋯ menu → Export (JSON dump of KG) |
| **Delete your API key** | Settings → AI Backend → clear key field → save |
| **Uninstall completely** | Move Ovo.app to Trash + delete `~/Library/Application Support/Ovo/` |

There is no account to delete because there is no account.

---

## 5. Children's Privacy

Ovo is a productivity tool intended for adults. We do not knowingly collect data from anyone — including children — because we do not collect data at all.

---

## 6. Regulatory Alignment

### GDPR (EU users)

- **Lawful basis**: contract (you install and use; no separate processing happens server-side)
- **Data controller**: you (the user). We are not a data controller because we do not receive your data.
- **Subject rights**: all data is local on your machine; you have full read/edit/delete rights via the OS file system + Ovo UI
- **Data Protection Officer**: not required (we process no data)
- **International transfers**: only if you choose an LLM provider outside the EU (e.g. Anthropic US). That transfer is between you and your LLM provider.

### 中华人民共和国《个人信息保护法》(China users)

- **个人信息处理者** (PI handler)：仅本机 Ovo 进程，所有数据**境内本机存储**
- **处理目的**：屏幕活动感知 → AI 建议生成
- **告知同意**：首次使用必须授权 macOS 屏幕录制权限
- **删除权**：用户可一键清空知识图谱、删除 API key、卸载应用
- **跨境传输**：仅当用户选择海外 LLM（如 Anthropic）时发生，此场景由用户主动决定

### California (CCPA)

- We are not a "business" under CCPA because we do not collect personal information.
- Your "right to know" is satisfied by this document.
- Your "right to delete" is exercised via your local file system.

---

## 7. Security Disclosures

For security vulnerabilities, please follow [`SECURITY.md`](../SECURITY.md). Do not open public issues.

---

## 8. Changes to This Policy

We will update this policy when:

- We add new third-party dependencies that touch your data
- We add new data collection (which we do not currently plan)
- Regulations require it

Material changes will be announced in:

- A pinned issue in [Discussions](https://github.com/dushaobindoudou/ovo/discussions)
- A new entry in [`CHANGELOG.md`](../CHANGELOG.md) under "Security"
- A Toast notification at next app launch

The `Last updated` date at the top of this file always reflects the current version.

---

## 9. Contact

- For privacy questions: open a GitHub Discussion in the [Q&A category](https://github.com/dushaobindoudou/ovo/discussions/categories/q-a)
- For vulnerabilities: see [`SECURITY.md`](../SECURITY.md)
- For everything else: see [`CONTRIBUTING.md`](../CONTRIBUTING.md)

We don't have a "privacy@" inbox because we don't process your data centrally. The repository owner is `@dushaobindoudou` on GitHub.

---

## 10. The Source of Truth Is the Code

This policy describes intent. The code describes reality. If anything in this policy disagrees with what the code actually does, **the code is wrong and should be fixed** — please open an issue.

Files most relevant to privacy:

- [`electron/auto-capture.ts`](../electron/auto-capture.ts) — what's captured and when
- [`electron/sensitive-filter.ts`](../electron/sensitive-filter.ts) — redaction rules
- [`electron/agent-bridge.ts`](../electron/agent-bridge.ts) — every outbound network call
- [`electron/secrets-store.ts`](../electron/secrets-store.ts) — API key encryption
- [`electron/preferences-store.ts`](../electron/preferences-store.ts) — preferences storage
- [`electron/knowledge-graph.ts`](../electron/knowledge-graph.ts) — KG schema and queries

Auditing welcome — that's the whole point of open source.
