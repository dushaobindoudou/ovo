# Agent Philosophy

> Our manifesto on what AI agents are, where they're going, and why **Ovo is a kind of agent the world doesn't have enough of yet**.
>
> This document is upstream of [`PRODUCT_PHILOSOPHY.md`](PRODUCT_PHILOSOPHY.md).
> Product philosophy says *what Ovo is*. Agent philosophy says *why this kind of thing should exist*.

---

## TL;DR

There are **two fundamental kinds of AI agents** in the world today:

1. **Tool agents** — strong, focused, on-demand. You call them. They do the thing. They stop.
   *Examples: OpenClaw, Hermes, Claude Code, Cursor in chat mode, GitHub Copilot, ChatGPT.*

2. **Copilot agents** — quiet, present, anticipatory. They watch your context, understand your intent before you articulate it, prepare what you'll need, and call the tool agents on your behalf.
   *Examples: Ovo. And… that's mostly it, today.*

The world has built incredible tool agents. **The world is missing the copilots that wield them.**

> Tool agents do what you ask. Copilot agents notice what you need. The copilot calls the tools.

That asymmetry is what Ovo exists to fix.

---

## 1. The Two Kinds of Agent

### 1.1 Tool Agents

A **tool agent** is an agent you summon for a specific task.

- You phrase a prompt.
- It executes.
- It returns a result.
- It stops.

The interaction shape is **request → response**. The agent is a strong arm with no memory of why you needed it.

**Strengths**:
- Excellent at well-specified tasks (write this function, summarize this paper, generate this image)
- Composable into pipelines
- Easy to evaluate (did the output match the spec?)
- The current state of the art in LLM products is here — billions of dollars optimizing this shape

**Weaknesses**:
- Requires you to know what you want
- Requires you to translate that want into a prompt
- Requires you to context-switch into the tool's surface
- Costs full mental load every time

**Canonical examples**:
- **OpenClaw**, **Hermes**, **Claude Code** — strong general-purpose tool agents
- **GitHub Copilot** in suggest mode — completes the next token when you ask
- **Cursor** in chat mode — answers when prompted
- **ChatGPT** / **Claude.ai** — text in, text out

### 1.2 Copilot Agents

A **copilot agent** is an agent that runs *alongside* you while you work.

- It observes your context — what's on your screen, what you typed, what app you opened.
- It infers intent — what are you trying to accomplish, even if you haven't named it.
- It anticipates — it prepares the next thing before you ask.
- It surfaces — it makes a suggestion you can accept, reject, or ignore.
- It learns — it adjusts based on what you did.
- It does not stop. It keeps observing.

The interaction shape is **ambient → anticipatory → reactive**. You don't summon a copilot; it is already there.

**Strengths**:
- Zero prompting overhead — you don't have to articulate what you need
- Surfaces things you didn't know you needed
- Works across applications (your whole screen, not just an editor)
- Accumulates context over time (it learns *you*, not just the current task)

**Weaknesses**:
- Trust is harder to earn (it sees everything)
- Failures are more visible (the wrong suggestion at the wrong time is worse than no suggestion)
- Architecturally much harder (observation + reasoning + acting + learning, all continuous)
- Hardly anyone has built one that works

**Canonical examples** (or partial examples):
- **Cursor** in Tab-complete mode — anticipates your next code, in the IDE only
- **Granola** — listens to meetings, takes notes, in meetings only
- **Rewind** — records everything for later recall, but doesn't *act* — passive
- **Microsoft Recall** — records everything, no anticipation, killed by privacy backlash
- **GitHub Copilot Workspace** — closer to copilot, but still ticket-bound
- **Personal AI** — claims to be a digital twin, struggles to deliver
- **Ovo** — the copilot we wish existed, so we are building it

> Notice: **every copilot example above is bound to one application or one mode.** None of them are general-purpose desktop copilots. That's the space.

### 1.3 The Critical Asymmetry

> The world has 10,000 tool agents and ~3 copilot agents that almost work.

Builders gravitated to tool agents because:
1. The interaction shape is easier to reason about
2. Eval is straightforward
3. LLM APIs are tool-shaped (prompt in, completion out)
4. The cost of mistakes is bounded (a bad chat answer is forgettable)

Builders avoided copilot agents because:
1. The interaction shape is harder (continuous observation + intent inference)
2. Eval requires longitudinal study
3. Building requires OS-level integration (screen capture, accessibility)
4. The cost of mistakes is high (the wrong proactive nudge feels invasive)

This asymmetry **leaves the most valuable space underbuilt**. Anyone who works at a computer all day wants a copilot far more than they want yet another chat window.

---

## 2. Why Copilot Agents Are The Future

Five forces converge to make copilot agents inevitable.

### 2.1 Tool agents are commoditizing

The price of "good LLM that completes a task" is falling toward zero. Every framework, every IDE, every product is shipping a tool agent. The marginal value of the 10,001st tool agent is approximately nothing.

The marginal value of the **first copilot that actually works** is enormous.

### 2.2 Humans don't want to keep prompting

Prompting is work. Writing a good prompt requires:
- Knowing what you want (often you don't)
- Translating it into words an LLM understands
- Re-prompting when the output isn't quite right
- Context-switching from your current task into the AI's UI

The dream of AI was never "I will type into a chat box all day." The dream was "the AI just helps."

> The chat box is to AI what the command line is to computing — powerful, primitive, and ultimately the worst interaction shape for most people.

Copilots are the GUI for AI.

### 2.3 The bottleneck is intent, not capability

In 2026, the constraint on AI usefulness is no longer model capability. Frontier models can do most tasks a person at a computer needs.

The constraint is **getting the right intent + context to the model at the right moment**.

That's an observation problem. That's a copilot problem.

### 2.4 Context windows are wide enough now

Five years ago, "always-on agent that knows everything you've ever done" was infeasible — context windows were 4k tokens. Today they are 1M+. The technical preconditions for an agent that holds your whole working context are met.

### 2.5 Local-first AI is finally credible

Privacy used to kill copilot ambitions: "you mean your AI watches my screen and sends my data to a server?" Now:
- Capable local models (Llama, Qwen, Mistral) can power copilots without cloud
- Even when using cloud LLMs, BYOK + local KG keeps user data on user devices
- macOS Keychain, Apple Silicon NPU, Secure Enclave all give us trustworthy primitives

The privacy objection is now an architecture choice, not a structural blocker.

---

## 3. The Copilot Calls the Tools

This is the most important sentence in this document, so we'll repeat it:

> **The copilot calls the tools.**

A well-built copilot does not try to be a tool. It does not generate code itself. It does not draft contracts itself. It does not write SQL itself.

It observes that you're about to need code, contract, or SQL — and it **calls a tool agent** (Claude Code, OpenClaw, Hermes, etc.) to produce it, then surfaces the result to you.

This is the natural division of labor between the two agent kinds:

```
                    ┌─────────────────────────────────┐
                    │   You (the human)               │
                    │   Working on your computer       │
                    └────────────┬────────────────────┘
                                 │
                       observes & anticipates
                                 │
                    ┌────────────▼────────────────────┐
                    │   Copilot Agent (Ovo)            │
                    │   • Sees your screen             │
                    │   • Infers intent                │
                    │   • Maintains long-term context  │
                    │   • Decides when to act          │
                    │   • Decides which tool to call   │
                    │   • Surfaces results             │
                    │   • Learns from your reactions   │
                    └────────────┬────────────────────┘
                                 │
                       calls when needed
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ┌──────────┐       ┌──────────┐       ┌──────────┐
        │ OpenClaw │       │  Hermes  │       │ Claude   │
        │  (tool)  │       │  (tool)  │       │   Code   │
        └──────────┘       └──────────┘       └──────────┘
```

Tool agents are the muscle. The copilot is the nervous system.

In Ovo, this is concretely:
- `electron/agent-bridge.ts` — abstracts the tool agent choice (Claude Code / OpenClaw / Hermes / Direct API)
- `electron/prompt-engine.ts` — decides *what to ask* the tool agent based on observed context
- `electron/agent-executor.ts` — orchestrates multi-step plans, delegating each step to the right tool

The user doesn't pick "I want Claude to draft this email." The copilot picks. And if the user later prefers a different tool for that kind of task, the copilot learns.

---

## 4. The "Once You Use It, You Can't Stop" Test

There is a single test for whether a product has reached real value:

> **Could the user go back to life without it?**

For most AI products today the honest answer is yes. ChatGPT shut down for a day? You'd use Claude. Cursor goes down? You use VS Code with Copilot. Tools are interchangeable; their absence is annoying, not crippling.

For a copilot done right, the answer is **no**. After a month of having a copilot, you cannot fathom going back to:
- Manually drafting that recurring weekly email
- Re-remembering who "Jamie from the merger thing" was
- Re-explaining your context to a tool agent every time
- Not knowing whether you replied to that client last Tuesday

This is not addiction in the dopamine sense (the social media trap). This is **dependence in the same way you can't go back from electricity**. Once your environment does basic intelligent work for you, doing that work yourself feels barbaric.

That dependence is the product. **Ovo is building toward "I cannot work without it."**

This sets a high bar for quality. A copilot that mostly works, but is wrong 20% of the time, fails this test catastrophically — every wrong move is more memorable than any right one. A copilot that is *quietly right* across hundreds of small judgments earns the slot.

---

## 5. The Principles of a Good Copilot

These are the constraints we accept by being a copilot agent (not a tool agent).

### 5.1 Quiet by default

A copilot that interrupts is a copilot that gets uninstalled. Default mode is **silent observation**. The bar to surface a suggestion is high. The bar to take an action is much higher.

> Tool agents speak when spoken to. Copilots speak when (and only when) it matters.

In Ovo this is: toast verbosity ≠ all-by-default; pending state for non-trivial actions; coalesce duplicate suggestions; respect "do not disturb".

### 5.2 Visible reasoning

The user must be able to see why the copilot did what it did. Black-box copilots are creepy. Glass-box copilots are trusted.

> Every proactive action must traverse Act → Trace → Reflect.
> Act it. Show how. Let the user shape it.

In Ovo this is: the Pipeline timeline; OCR text visible per stage; prompt + response auditable; KG visible.

### 5.3 Teachable from the side

The user must be able to course-correct without writing rules in YAML. The interaction should be in-flow: "never do this again" / "always offer this" / "trust me more here".

> Tool agents are programmed. Copilots are tamed.

In Ovo this is: per-action trust ladder; negative pattern recording from "never_again"; personality drift from accumulated reactions.

### 5.4 Local by default

A copilot that ships your screen to someone else's server is a non-starter for serious use. Local-first is the moat that makes the rest possible.

> If you wouldn't let a human assistant take notes about everything on your screen and upload them to a vendor's cloud, don't let an agent do it either.

In Ovo this is: KG local; OCR local; redaction before LLM; BYO API key; no telemetry.

### 5.5 Composable with tool agents (not competitive with them)

A good copilot grows the entire AI ecosystem. It picks tool agents based on the task, with the user's BYO key. It does not lock you into one model vendor.

> A copilot that only works with one tool agent is a chat client in disguise.

In Ovo this is: 4 backend choices (Claude Code / OpenClaw / Hermes / Direct API); user can switch any time; future plugin system for new backends.

### 5.6 Long memory, short reactions

The copilot should remember everything that matters across months and forget the chatter. It should react in seconds, not minutes.

> A copilot without memory is a goldfish. A copilot with infinite memory is an archive.

In Ovo this is: the knowledge graph (entities, relationships, events with importance scoring); pinned entities; decay of unimportant memories; 5-second OCR loop, 15-second reasoning loop.

---

## 6. Ovo's Place in the Landscape

Mapping the agent landscape:

```
                              GENERAL              SPECIALIZED
                                │                       │
                                ▼                       ▼
   ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ TOOL AGENTS    │  │ ChatGPT, Claude  │  │ Copilot (code),  │
   │ (called)       │  │ Gemini           │  │ Granola (meetings),
   │                │  │ OpenClaw, Hermes │  │ Otter, Mem.ai    │
   │                │  │ Claude Code      │  │                  │
   └────────────────┘  └──────────────────┘  └──────────────────┘

   ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ COPILOT AGENTS │  │ ★★★ OVO ★★★      │  │ Cursor (Tab),    │
   │ (ambient)      │  │ (the gap we fill)│  │ Rewind (passive) │
   │                │  │                  │  │ Granola (specific)
   │                │  │                  │  │                  │
   └────────────────┘  └──────────────────┘  └──────────────────┘
```

The top row (tool agents) is crowded. The bottom-right (specialized copilots) has good products. **The bottom-left (general copilot) is wide open.** That's Ovo.

---

## 7. What Ovo Is Not (So We Stay Honest)

A bunch of things Ovo could become but should not:

- ❌ **Ovo is not another chat window.** If we add a "talk to Ovo" chat surface, we have failed at being a copilot.
- ❌ **Ovo is not a model.** We do not train. We do not host inference. We call tool agents the user already trusts.
- ❌ **Ovo is not a productivity tracker.** We do not measure your hours or judge your output. We just help.
- ❌ **Ovo is not a recording archive.** Rewind already does that. We're about *acting* in the moment, not retrospective search.
- ❌ **Ovo is not anthropomorphic.** We will not name it like a person, give it a face, or pretend it has feelings. It is a competent unobtrusive assistant, not a persona.

The negative space matters as much as the positive. A clear "what we're not" is what lets us avoid the gravitational pull of building yet another chat app.

---

## 8. Open Questions We Take Seriously

We don't have answers yet — but we think about these constantly:

### 8.1 How does a copilot earn trust?

A user installs Ovo. They've never seen it. How does it earn the right to be proactive? Our current answer: **start in observation-only mode, escalate the trust ladder only as the user explicitly authorizes**. But this means early experience is "doing nothing visible," which works against the wow-moment. Tension unresolved.

### 8.2 How does a copilot avoid creating learned helplessness?

If Ovo does too much for the user, do they atrophy? Like calculators and arithmetic. We don't know. We lean on the view that **delegation is human**: humans have always offloaded the routine to assistants, secretaries, tools. The valuable cognitive work is upstream of what a copilot replaces. But we should watch this.

### 8.3 What's the right verbosity?

A copilot speaks too much → annoying. Too little → forgotten. The right level **varies by user, by hour, by app, by current focus state**. This is an unsolved adaptive problem. Currently Ovo offers global verbosity dials; future work is contextual auto-calibration.

### 8.4 What's the moral weight of observing someone's screen?

Even with redaction, blacklists, and pause, Ovo sees a lot. The user gave permission. But they may forget what they permitted. Do we owe them periodic reminders? Periodic exports? We lean toward **yes** but it's not built yet.

### 8.5 What happens when multiple copilots compete for the same screen?

In a few years, there will be many copilot agents — one in your IDE, one in your browser, one in your OS, one shipped by your employer. How do they coexist? Today there's no protocol. We will probably need one.

---

## 9. The Bet

The bet behind Ovo is straightforward:

> Tool agents have already won as a category. Copilot agents have not.
> The first general-purpose copilot agent that genuinely works — quiet, transparent, teachable, local-first, composable — will be one of the most valuable software products of the decade.
>
> We are building toward that.

We may not be the team that gets all the way there. We may be early. We may be wrong about timing. But we believe the **shape** is right, and the **gap** is real, and the **technical preconditions** are now met.

The work, then, is just to build it well.

---

## 10. To Future Contributors and Readers

If you found this document, you probably found Ovo first. So you already get part of this.

What we hope you take away:

1. **The split between tool agents and copilot agents is real and load-bearing.** Treat it as the most important categorization in this space.
2. **Ovo is in the underbuilt slot.** Most of the open opportunity in AI is here, not in chat.
3. **The principles are non-negotiable.** Quiet + Visible + Teachable + Local + Composable. Lose one and we become a worse version of an existing product.
4. **The bar is "you can't go back."** Until users say "I can't work without it," we're not done.
5. **Build for the moment, learn for the long term.** Every interaction is both a service and a data point for becoming a better copilot tomorrow.

If you contribute code, contribute documentation, contribute critique — read this first. The product details will change. The architectural details will change. **This document is what should not change**.

If we ever ship a feature that violates a principle here, ship the principle change first, in this doc, with an argument. Otherwise we're drifting.

---

## See also

- [`PRODUCT_PHILOSOPHY.md`](PRODUCT_PHILOSOPHY.md) — how the principles translate into Ovo's specific product decisions
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how those decisions become code
- [`USE_CASES.md`](USE_CASES.md) — what the copilot looks like in practice (when written)
- [`AI_BACKENDS.md`](AI_BACKENDS.md) — the tool agents Ovo can drive (when written)
- [`PRIVACY.md`](PRIVACY.md) — the trust commitments the copilot model requires
