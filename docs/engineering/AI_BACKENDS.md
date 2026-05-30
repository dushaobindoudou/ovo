# AI Backends

> Ovo is a copilot agent. The thinking is done by a **tool agent** of your choice.
> This document covers the four backends Ovo supports, how to configure each, and the trade-offs.

For the philosophical framing (why a copilot drives tool agents), see [`AGENT_PHILOSOPHY.md`](../product/AGENT_PHILOSOPHY.md).

---

## TL;DR — pick one

| Backend | Best for | Setup time |
|---|---|---|
| **Claude Code** | If you already use [Claude Code CLI](https://www.anthropic.com/claude-code). Fastest path for existing Anthropic users. | ~30s |
| **Direct API** | If you have an Anthropic or OpenAI API key. Most flexible, most control. | ~2 min |
| **OpenClaw** | If you want a local proxy that abstracts multiple providers. | ~5 min (local setup) |
| **Hermes** | If you have a Hermes server (alternative local proxy). | ~5 min (local setup) |

You can switch backends any time in **Settings → AI Backend**. Ovo will start using the new backend on the next pipeline run.

---

## 1. Backend Comparison

| | Claude Code | OpenClaw | Hermes | Direct API |
|---|---|---|---|---|
| **Transport** | Local CLI subprocess | Local HTTP proxy | Local HTTP proxy | HTTPS to vendor |
| **Auth method** | Inherits CLI's auth | Local proxy config | Local proxy config | API key (BYO) |
| **Provider lock-in** | Anthropic-only | Multi-provider via proxy | Multi-provider via proxy | Per-config (Anthropic by default) |
| **Cost model** | Pays Anthropic by tokens | Depends on proxy backend | Depends on proxy backend | Pays your provider by tokens |
| **Network exposure** | Indirect (via CLI) | Localhost only | Localhost only | Direct to vendor |
| **Latency** | +CLI startup (~500ms) | ~50ms LAN | ~50ms LAN | Network RTT |
| **Streaming support** | Yes | Yes | Yes | Yes (where vendor supports) |
| **Best privacy** | Whatever your CLI uses | Whatever proxy routes to | Whatever proxy routes to | Direct, no extra hop |
| **Failure modes** | CLI not installed / not authed | Proxy not running | Proxy not running | Bad key / rate limit / vendor outage |

---

## 2. Claude Code

[Claude Code](https://www.anthropic.com/claude-code) is Anthropic's official CLI. Ovo invokes it as a subprocess.

### Why pick this

- Zero new account/key needed if you already use Claude Code for development
- Anthropic's frontier models, official tooling
- Authentication is whatever you already configured for Claude Code

### Setup

1. **Install Claude Code** if you haven't:
   ```bash
   # Follow https://www.anthropic.com/claude-code
   # Or via Homebrew (when available)
   ```

2. **Verify it works standalone**:
   ```bash
   claude --version
   echo "hello" | claude
   ```

3. **In Ovo**: Settings → AI Backend → select **Claude Code** → Save.

That's it. Ovo will use whichever model/credentials your Claude Code is configured with.

### Cost notes

You pay Anthropic per token via Claude Code's billing (your existing setup). Ovo doesn't add overhead beyond the API call itself.

A rough budget for a typical day of moderate Ovo use:
- ~30-60 pipelines per active hour
- ~1-2k input tokens per pipeline (with KG context)
- ~200-400 output tokens per pipeline
- Total daily: ~$0.50-$2.00 on Claude Sonnet

(Your mileage will vary. Watch your Anthropic billing dashboard.)

### Known limitations

- CLI startup adds ~500ms per call. Less ideal for high-frequency contexts.
- Cannot use non-Anthropic models through this backend.

---

## 3. Direct API

Talks directly to an OpenAI-compatible chat completions endpoint. Default points at `api.anthropic.com`, but you can point it anywhere.

### Why pick this

- Most flexibility — any provider with an OpenAI-compatible interface
- Lowest latency (no proxy hop)
- Most control over which model is used

### Setup

1. **Get an API key**:
   - Anthropic: https://console.anthropic.com/ → API Keys → Create
   - OpenAI: https://platform.openai.com/api-keys → Create new
   - Or your own provider (DeepSeek / Qwen / Moonshot / Together / OpenRouter / etc.)

2. **In Ovo**: Settings → AI Backend → select **Direct API** → fill in:
   - **Base URL** (e.g. `https://api.anthropic.com` or `https://api.openai.com`)
   - **API Key** (encrypted via macOS Keychain — never visible after save)
   - **Model** (e.g. `claude-sonnet-4-20250514` or `gpt-4o-mini`)
   - Click **Save API Config**.

3. (Optional) **Test the connection** — once a "Test" button is added (planned for 0.3); for now, watch the next pipeline run.

### Provider quick-reference

| Provider | Base URL | Recommended model |
|---|---|---|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-20250514` |
| OpenAI | `https://api.openai.com` | `gpt-4o-mini` (cheap) or `gpt-4o` |
| OpenRouter | `https://openrouter.ai/api/v1` | Whatever is hot this week |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Moonshot Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| Together AI | `https://api.together.xyz/v1` | `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1:8b` or any pulled model |

### Privacy: how your key is handled

- The key is encrypted via Electron `safeStorage` (macOS Keychain) the moment you save it
- Stored at `~/Library/Application Support/Ovo/secrets.json` as `apiKeyCipher` (base64 ciphertext)
- The renderer can **never read it** — it can only check "is configured" or write a new one
- Cleared instantly when you clear the field and save

### Cost notes

You pay your chosen vendor directly. Ovo never sees your billing. We recommend setting **spending limits** in your provider's dashboard (e.g. Anthropic's Spend Limits, OpenAI's Usage Limits) when first trying Ovo to bound surprises.

---

## 4. OpenClaw（已放弃 / 暂不支持）

> 2026-05-22：OpenClaw 后端已下线。原先这份文档把它描述为 HTTP 本地代理，但代码里
> 是未经验证的 CLI 调用（`openclaw agent --non-interactive ...`），两者矛盾且从未跑通过。
> 在确认 OpenClaw 真实集成形态（CLI vs HTTP、子命令、输出格式）之前，它不在后端探测里、
> UI 不可选、调用会被拒绝。请使用 **Hermes**（本地、已验证）或 **Direct API**。
>
> 若未来要恢复：先核实真实接口，再在 `electron/agent-bridge.ts` 重写 openclaw 分支并补
> 输出 normalizer，然后改回本节文档。

---

## 5. Hermes

Hermes is another local proxy option (similar shape to OpenClaw).

### Setup

1. **Install and run Hermes** locally
2. **In Ovo**: Settings → AI Backend → select **Hermes** → Save

### Trade-offs

Same general profile as OpenClaw — pick whichever you're already running.

---

## 6. What gets sent in a typical prompt

Regardless of backend, every prompt Ovo sends to the LLM looks roughly like this:

```
SYSTEM:
You are Ovo, a proactive desktop AI assistant. Observe the user's
context and predict their next intent. Return JSON: { intent,
prediction, actions, suggestions, content, entities, relationships }.

USER:
## Current screen activity
### Window: <app name> - <window title>
[<timestamp>] <redacted OCR text, last 5 min, time-stamped>

## Knowledge graph context
### Relevant entities
- <entity 1>
- <entity 2>
### Relevant relationships
- <relationship 1>

## User personality summary
<short style/preference summary>
```

You can audit the actual prompt construction at:
- [`electron/prompt-engine.ts`](../../electron/prompt-engine.ts)
- [`electron/adaptive-prompt.ts`](../../electron/adaptive-prompt.ts)

Every prompt is **logged** in the Pipeline timeline (Console → Process / 回放 tab), so you can see exactly what was sent for any past pipeline.

### Redaction

Before sending, [`electron/sensitive-filter.ts`](../../electron/sensitive-filter.ts) strips:
- API tokens (sk-… / ghp-… / AIza-… / etc.)
- JWT tokens
- Credit card numbers
- Chinese ID numbers + phone numbers
- SSH / RSA private keys
- `.env`-style secret patterns
- Inline password / verification code patterns

See [`PRIVACY.md`](../product/PRIVACY.md) for the full privacy model.

---

## 7. Performance + Cost Benchmarks

Numbers below are approximate, measured on an M2 MacBook Pro with mid-2026 model pricing.

### Latency (single pipeline run)

| Backend | Pass 1 | Pass 2 | End-to-end |
|---|---|---|---|
| Claude Code | 1.5-3 s | 2-4 s | 4-8 s |
| Direct API (Anthropic Sonnet) | 0.8-2 s | 1.5-3 s | 3-6 s |
| Direct API (OpenAI gpt-4o-mini) | 0.5-1 s | 0.8-1.5 s | 1.5-3 s |
| Direct API (Local Ollama 8B) | 1-3 s | 2-5 s | 4-10 s |
| OpenClaw / Hermes | + ~50 ms hop overhead | | |

### Cost (typical day of moderate use)

Assuming ~150 pipeline runs per active workday with 1.5k input + 300 output tokens per pipeline:

| Backend / Model | Daily cost (USD) |
|---|---|
| Claude Sonnet via Direct API or Claude Code | ~$1.50 |
| Claude Haiku via Direct API | ~$0.30 |
| OpenAI gpt-4o-mini via Direct API | ~$0.25 |
| OpenAI gpt-4o via Direct API | ~$2.00 |
| DeepSeek Chat | ~$0.10 |
| Local Ollama (free, paid in CPU/GPU + electricity) | $0 |

> 💡 Tip: in **Settings → Capture**, you can lengthen the **AI 思考间隔 (Agent interval)** from the default 15s to 30s or 60s to roughly halve / quarter your daily cost.

---

## 8. Cost Control Tips

1. **Set provider-side spending limits** before first run (Anthropic / OpenAI dashboards both support this)
2. **Increase Agent interval** in Settings (15s → 30s → 60s) — halves to quarters the cost
3. **Use a cheaper model for the observe pass** (planned feature: per-pass model selection)
4. **Enable adaptive throttling** (planned): when no signal change is detected, skip the pipeline entirely
5. **Use the Privacy → Pause** button when doing something Ovo doesn't need to see (e.g. video calls)

---

## 9. Switching Between Backends

Switching is hot-swappable — no restart needed.

1. Settings → AI Backend → choose a different backend
2. Save
3. Next pipeline run will use the new backend

Configuration for each backend is remembered separately (e.g. switching from Direct API → Claude Code doesn't erase your API key — switching back restores it).

---

## 10. Adding a New Backend (for Contributors)

If you want Ovo to support a new backend (e.g. a self-hosted vLLM, a corporate proxy, a new vendor), the integration point is:

- [`electron/agent-bridge.ts`](../../electron/agent-bridge.ts) — add a new case in the backend dispatch
- Add the new backend to the type union in [`electron/types.ts`](../../electron/types.ts)
- Add a Settings UI option in [`src/components/Console/SettingsPanel.tsx`](../../src/components/Console/SettingsPanel.tsx)
- Add a unit test in `electron/__tests__/agent-bridge.test.ts` (when tests exist)

For step-by-step contribution flow, see [`CONTRIBUTING.md`](../../CONTRIBUTING.md). For architectural placement, see [`ARCHITECTURE.md`](ARCHITECTURE.md) §4 + §11.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "No agent backend configured" toast | Backend not set or save didn't apply | Settings → AI Backend → select & Save |
| All pipelines fail with `connect ECONNREFUSED` | Local proxy (OpenClaw/Hermes) not running | Start the proxy, then re-trigger pipeline |
| `401 Unauthorized` from Direct API | Wrong / expired API key | Re-enter key in Settings |
| `429 Rate limit` | Hit provider's rate ceiling | Increase Agent interval, or switch to a cheaper model temporarily |
| Pipelines very slow (>30s) | Cold model + large context | Try a cheaper/faster model for observe pass |
| Output looks degraded / weird | Model is wrong for the task | Switch model in Settings (e.g. Anthropic Haiku → Sonnet for higher quality) |

If you see errors that look like Ovo internals (rather than API errors), check the Error Log:
- Settings → Developer Tools → 错误日志

Or file an [issue](https://github.com/dushaobindoudou/ovo/issues/new/choose) — paste the relevant log lines.

---

## See also

- [`PRIVACY.md`](../product/PRIVACY.md) — what gets sent (and what doesn't) per backend
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — where the backend fits in Ovo's data flow
- [`AGENT_PHILOSOPHY.md`](../product/AGENT_PHILOSOPHY.md) — why Ovo (copilot) calls these backends (tools), not the other way around
- [`SECURITY.md`](../../SECURITY.md) — reporting issues with key handling or prompt content
