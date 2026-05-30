# Use Cases

> What does a copilot agent actually *do* for you?
> 10 concrete scenarios where Ovo earns its keep.
>
> For the philosophical context, see [`AGENT_PHILOSOPHY.md`](AGENT_PHILOSOPHY.md).
> For how this is built, see [`ARCHITECTURE.md`](../engineering/ARCHITECTURE.md).

---

## How to read these

Each use case is told as a story:

1. **The user** — a quick persona
2. **The moment** — what's on screen when Ovo notices
3. **What Ovo sees** — the observation in human terms
4. **What Ovo does** — proactive suggestion or action
5. **Before vs. with Ovo** — the time/cognitive load saved
6. **Trust level required** — which tier of the trust ladder this lives at

The point is not to be exhaustive. The point is to make the **shape of help** Ovo provides feel real.

---

## #1 — The Email Reply You Already Have in Your Head

**The user**: PM at a growth-stage startup. ~50 emails a day. Most replies are "yes, let's do Thursday" / "thanks, looking into it" / "looping in <X>".

**The moment**: Gmail open, customer email displayed: *"Hey, are we still on for the demo Thursday at 2?"*

**What Ovo sees**: Customer name (already in KG as `[person] Sarah · 3 prior interactions`). Topic = `demo`. Time = Thursday 2pm. Detected pattern: "user typically responds to scheduling confirmations within ~5 minutes".

**What Ovo does**: Quietly prepares a draft reply: *"Yes, see you Thursday at 2 — sending the calendar link now."* Surfaces it as a non-blocking suggestion with [Accept] [Edit] [Dismiss].

**Before**: ~30 seconds to read, switch to compose, type, send.
**With Ovo**: ~3 seconds to glance and accept.

**Trust level**: Lv.1 (Draft — Ovo prepares but you click to send)

---

## #2 — The Forgotten "Who Was That Again"

**The user**: Solo consultant juggling 5 clients. Inbox just got a reply from someone named "Wei".

**The moment**: New message: *"As I mentioned in our call, the contract draft is attached."*

**What Ovo sees**: KG has 3 different entities named "Wei". Cross-references current email sender's address with KG → identifies Wei Chen, Project: Mooncake. Last interaction: 6 days ago discussing contract terms. There were 2 prior contract drafts attached.

**What Ovo does**: Surfaces a small contextual card: *"Wei Chen — Mooncake project. Last contract draft v2 attached on May 11."* with a link to the prior draft.

**Before**: 3-5 minutes searching email history, opening attachments, reconstructing context.
**With Ovo**: 5 seconds reading Ovo's recap.

**Trust level**: Lv.0 (Show only — pure context surfacing)

---

## #3 — The Meeting Notes You Didn't Take

**The user**: Engineering manager in 6 hours of meetings a day. Notes never get taken.

**The moment**: Zoom call ends. The user closes the window and opens their next app.

**What Ovo sees**: Detected a meeting just ended (Zoom window was foreground for 47 minutes). The user's screen during that time showed shared slides and a Notion doc with decisions being typed (by someone else). Ovo OCR'd the decisions in real time but did not interrupt.

**What Ovo does**: 10 seconds after Zoom closes, surfaces: *"Want me to log a meeting note? I caught 3 decisions: 1) Switch to TanStack Query, 2) Hire one more PM, 3) Move sprint review to Fridays."*

**Before**: Either meticulous note-taking (high cost) or no notes at all (high regret).
**With Ovo**: Glance + Accept → permanent KG memory.

**Trust level**: Lv.2 (Confirm — accepts only after one click, since the summary may be wrong)

---

## #4 — The Snippet You Always Copy

**The user**: Developer who frequently copies the URL of the current GitHub PR into Slack.

**The moment**: Looking at a PR page. About to switch to Slack.

**What Ovo sees**: Pattern recognized — user has done [open PR → open Slack → paste URL] 12 times in the past month, ~8 of which were `dushaobindoudou/ovo` PRs going to channel `#dev-ovo`.

**What Ovo does**: Detects the pattern early enough — when user clicks Slack icon, Ovo silently puts the PR URL on clipboard. Notification toast: *"Copied PR #42 URL to clipboard."*

**Before**: Cmd+L to copy URL, Cmd+Tab to Slack, Cmd+V to paste.
**With Ovo**: Cmd+Tab + Cmd+V (the copy step is automatic).

**Trust level**: Lv.3 (Auto + 5s undo — the action is reversible, the pattern is well-established)

---

## #5 — The Risk You Almost Missed

**The user**: Founder reviewing a contract sent by counterparty.

**The moment**: Reading a PDF in Preview. Page 4 of 12.

**What Ovo sees**: OCR picks up clause text: *"…this agreement shall automatically renew for successive 12-month terms unless either party provides written notice…"*. The user's KG shows they've previously flagged "auto-renew" clauses as problematic on similar deals.

**What Ovo does**: Surfaces a high-priority alert (red border, more visible than normal suggestions): *"⚠ Auto-renewal clause detected (12-month rollover). You've flagged this pattern on 2 prior contracts."*

**Before**: 50/50 chance of missing it; if missed, costs 12 months.
**With Ovo**: The pattern alert catches it.

**Trust level**: Lv.0 (Show only — the user must make the legal decision)

---

## #6 — The Search You're About to Start

**The user**: Engineer debugging a flaky CI test.

**The moment**: Looking at GitHub Actions log. Sees an error: *"Error: connect ETIMEDOUT mysql.example.com:3306"*.

**What Ovo sees**: Error pattern. KG shows: same error appeared in 4 prior pipelines this month. Last time it happened, the fix was bumping the connection timeout in `db.config.ts:14`.

**What Ovo does**: Surfaces a small inline card: *"You hit this same `ETIMEDOUT` 4 times this month. Last fix: bumped timeout in `db.config.ts:14`. Want me to open that file?"*

**Before**: 5-10 minutes searching Slack/notes/git log to remember the prior fix.
**With Ovo**: 2 seconds to confirm → file opens.

**Trust level**: Lv.1 (Draft — Ovo offers to open file, user clicks to open)

---

## #7 — The Person You Should Loop In

**The user**: Designer mid-thread on a Slack message, drafting a reply about technical feasibility.

**The moment**: Typing in Slack: *"I think we can do the animation with..."*

**What Ovo sees**: Current message thread context: animation, feasibility, customer ask. KG has: `Diego (engineer)` who has been mentioned 5 times in animation discussions over past 2 months. Diego is currently online (presence visible in Slack).

**What Ovo does**: Quiet sidebar suggestion: *"Diego has weighed in on animation feasibility 5 times before — want to @ him?"*

**Before**: Either user remembers Diego (rare) or sends the reply without expertise check.
**With Ovo**: A reminder of relevant expertise, at the moment of need.

**Trust level**: Lv.0 (Show only — adding the @ mention is a social act, user decides)

---

## #8 — The Draft You'd Procrastinate

**The user**: Founder who needs to write a tough message: declining a candidate after a great interview.

**The moment**: ATS open, candidate profile shown, "Reject" button hovered over. Browser tab title: *"Send rejection — Maria Lopez · Senior Engineer".*

**What Ovo sees**: Same task pattern from KG: 3 prior rejections in similar role. Founder consistently uses a specific tone (warm, specific, brief). Personality preference: concise + kind.

**What Ovo does**: Prepares a 4-sentence draft matching the founder's style, slot-filled with this candidate's name and the specific positive thing from the interview notes. Surfaces as: *"Draft prepared based on your usual style — review?"*

**Before**: 15-30 minutes of staring, drafting, revising.
**With Ovo**: 2 minutes to read, tweak, send.

**Trust level**: Lv.2 (Confirm — sensitive content, always one-click confirm)

---

## #9 — The Receipt You Should Save

**The user**: Anyone who pays for things online and forgets to file expense receipts.

**The moment**: Browsing an order confirmation email after a purchase on a SaaS site. Price: $49.

**What Ovo sees**: Order confirmation pattern. KG flags: `[concept] business expense — to be reimbursed`. User has historically filed similar purchases under expense category `software`.

**What Ovo does**: Tiny background action: logs the purchase into Ovo's `notes` table with metadata (date, amount, vendor, suggested category). Surfaces: *"Logged $49 from Vendor as software expense — open expense tool?"*

**Before**: Forget to file → month-end scramble.
**With Ovo**: Persistent record, captured at the moment.

**Trust level**: Lv.4 (Fully delegated — logging is harmless; Ovo just does it and notifies)

---

## #10 — The Question You Don't Know to Ask

**The user**: Anyone learning a new domain (reading a research paper, code in an unfamiliar codebase, a new library's docs).

**The moment**: Reading a paper. Encounters: *"…we use a learned soft assignment via Gumbel-Softmax…"*

**What Ovo sees**: User is on a research paper PDF for >3 minutes (genuine reading, not skimming). The phrase "Gumbel-Softmax" appears nowhere in user's KG (= new concept). User's role profile says "engineer with growing ML interest".

**What Ovo does**: Subtle sidebar card: *"Gumbel-Softmax (new to your notes) — quick explainer? Or save for later?"* with [Explain] [Save] [Dismiss].

**Before**: Either the user breaks flow to Google + open Wikipedia + read + return (~5 min), or they skip and the concept silently bounces.
**With Ovo**: 30-second inline explainer, or saved as a study-later entity.

**Trust level**: Lv.1 (Draft — the explainer must be approved, since LLM explanations of academic terms can be wrong)

---

## Across all 10 cases — the common pattern

Notice what's true of every story above:

1. **Ovo doesn't ask the user to type a prompt.** The user is doing their work. Ovo is reading the context.
2. **Ovo doesn't replace human judgment.** Every action is reviewable, reversible, or both.
3. **Ovo's value comes from continuity.** The same KG that knows "Sarah is a customer" knows "Wei drafted a contract" knows "Diego understands animations". A tool agent can't accumulate this.
4. **The time saved is small per moment** (30s-5min) but **the cognitive load saved is huge** (don't have to keep all this in your head).
5. **The trust ladder is per-action-type**. Logging an expense is Lv.4. Sending an email is Lv.2. Flagging a contract risk is Lv.0. One copilot, many levels.

This is what a copilot agent does. It is **not magic**. It is **persistent attention** + **good context** + **the right tool agent at the right moment**.

---

## Use cases we are not pursuing (and why)

Worth being explicit about anti-patterns:

| Idea | Why we're not doing it |
|---|---|
| "Auto-reply to all emails" | Removes too much agency; sets up Ovo to send something cringey in your name |
| "Always-on voice mode" | Different interaction surface, different product, different team |
| "Full automation of multi-app workflows (RPA)" | Belongs to RPA tools (UiPath etc.); we're an in-flow copilot, not a robot |
| "Generate slide decks from meeting transcripts" | Tool-agent territory — let a tool do it on demand; Ovo just notices the moment |
| "Replace Slack / Notion / your favorite app" | We *use* those apps with you; we don't replace them |
| "Predictive AI buddy chat" | Anthropomorphism kills trust; we are a copilot, not a friend |

The negative space is as important as the positive space.

---

## Contributing a use case

Got a moment in your day where Ovo could have helped but didn't?

- Open a [Discussion under Ideas](https://github.com/dushaobindoudou/ovo/discussions/categories/ideas) describing it in the same 6-section format
- Tag it `use-case`
- If it gets traction, we add it here

The 10 above are a starting set. The richer this list, the better Ovo gets at recognizing when to act.

---

## See also

- [`AGENT_PHILOSOPHY.md`](AGENT_PHILOSOPHY.md) — why these are copilot-shaped not tool-shaped
- [`PRODUCT_PHILOSOPHY.md`](PRODUCT_PHILOSOPHY.md) — Ovo's product constitution
- [`ARCHITECTURE.md`](../engineering/ARCHITECTURE.md) — how the pipeline turns observations into suggestions
- [`AI_BACKENDS.md`](../engineering/AI_BACKENDS.md) — which tool agents Ovo can call (when written)
