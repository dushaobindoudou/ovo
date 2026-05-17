#!/usr/bin/env bash
#
# One-shot GitHub repo setup for Ovo
# ─────────────────────────────────────────────────────────────────────────────
# Configures everything that can't be done via git push:
#   • Repo description / homepage / topics
#   • Enable Discussions, disable Wiki
#   • Create 30+ standard labels (idempotent — safe to re-run)
#   • Create 10 good-first-issue seed issues
#
# Required:
#   GH_TOKEN environment variable — a Personal Access Token with scopes:
#     • repo (full control of private repositories)
#     • write:discussion
#
#   Generate at: https://github.com/settings/tokens/new?scopes=repo,write:discussion
#
# Usage:
#   export GH_TOKEN=ghp_xxxxxxxxxxxx
#   bash scripts/setup-github-repo.sh
#
# Safe to re-run: each operation is idempotent (PATCH on existing, POST on new).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="${OVO_REPO:-dushaobindoudou/ovo}"
API="https://api.github.com"

# ─── Pre-flight ──────────────────────────────────────────────────────────────
if [[ -z "${GH_TOKEN:-}" ]]; then
  cat <<EOF
❌ GH_TOKEN environment variable not set.

To get one:
  1. Open https://github.com/settings/tokens/new?scopes=repo,write:discussion
  2. Generate a Personal Access Token (classic)
  3. Run:
       export GH_TOKEN=ghp_xxxxxxxxxxxx
       bash $0

Required scopes: repo, write:discussion
EOF
  exit 1
fi

H=(-H "Authorization: Bearer $GH_TOKEN" \
   -H "Accept: application/vnd.github+json" \
   -H "X-GitHub-Api-Version: 2022-11-28")

echo "🔍 Verifying token + repo access..."
remaining=$(curl -sf "${H[@]}" "$API/rate_limit" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['rate']['remaining'])")
echo "   ✅ Authenticated · $remaining API calls remaining"
echo ""

# ─── 1. Repo About (description / homepage / discussions / wiki) ────────────
echo "📝 Updating repo About..."
curl -sf -X PATCH "${H[@]}" "$API/repos/$REPO" -d '{
  "description": "Open-source proactive AI desktop assistant. Watches your screen, suggests next steps, runs 100% on your machine.",
  "homepage": "https://github.com/dushaobindoudou/ovo#readme",
  "has_discussions": true,
  "has_wiki": false,
  "has_projects": true,
  "has_issues": true,
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "delete_branch_on_merge": true
}' > /dev/null
echo "   ✅ Description, homepage, Discussions enabled, Wiki disabled, squash-merge only"

# ─── 2. Topics ───────────────────────────────────────────────────────────────
echo ""
echo "🏷  Setting topics..."
curl -sf -X PUT "${H[@]}" "$API/repos/$REPO/topics" -d '{
  "names": [
    "ai-assistant","proactive-ai","desktop-app","electron","claude","claude-code",
    "screen-ocr","knowledge-graph","productivity","personal-ai","local-first",
    "privacy-first","macos","react","typescript"
  ]
}' > /dev/null
echo "   ✅ 15 topics set"

# ─── 3. Labels (idempotent — try POST, fallback to PATCH) ───────────────────
echo ""
echo "🏷  Creating / updating labels..."

create_label() {
  local name="$1"; local color="$2"; local desc="$3"
  local payload
  payload=$(python3 -c "import json,sys; print(json.dumps({'name': sys.argv[1], 'color': sys.argv[2], 'description': sys.argv[3]}))" "$name" "$color" "$desc")
  local enc_name; enc_name=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$name")
  if curl -sf -X POST "${H[@]}" "$API/repos/$REPO/labels" -d "$payload" > /dev/null 2>&1; then
    echo "   ✅ created  · $name"
  elif curl -sf -X PATCH "${H[@]}" "$API/repos/$REPO/labels/$enc_name" -d "$payload" > /dev/null 2>&1; then
    echo "   🔄 updated  · $name"
  else
    echo "   ⚠️  failed   · $name"
  fi
}

# Type
create_label "bug" "d73a4a" "Something isn't working"
create_label "enhancement" "a2eeef" "New feature or capability"
create_label "documentation" "0075ca" "Improvements or additions to documentation"
create_label "question" "d876e3" "Further information is requested"
create_label "chore" "cfd3d7" "Maintenance work, dependency bumps, repo hygiene"
create_label "refactor" "c5def5" "Code restructuring without behavior change"
create_label "performance" "f9d0c4" "Performance optimization"
create_label "security" "ee0701" "Security-related issue or fix"
create_label "test" "bfd4f2" "Adding or updating tests"

# Priority
create_label "priority: P0" "b60205" "Blocking — must fix before next release"
create_label "priority: P1" "d93f0b" "High — fix this sprint"
create_label "priority: P2" "fbca04" "Medium — polish layer"
create_label "priority: P3" "0e8a16" "Low — nice to have"

# Status
create_label "triage" "ededed" "Needs triage by a maintainer"
create_label "needs-discussion" "f9d0c4" "Requires discussion before implementation"
create_label "needs-reproduction" "f9d0c4" "Cannot reproduce — please provide more info"
create_label "blocked" "5319e7" "Blocked by another issue or external dependency"
create_label "in-progress" "1d76db" "Actively being worked on"
create_label "wontfix" "ffffff" "This will not be worked on"
create_label "duplicate" "cfd3d7" "This issue or pull request already exists"
create_label "stale" "c5def5" "No activity in 60+ days"

# Community
create_label "good first issue" "7057ff" "Good for newcomers — has clear scope and acceptance criteria"
create_label "help wanted" "008672" "Extra attention is needed"

# Philosophy axis (see docs/PRODUCT_PHILOSOPHY.md)
create_label "philosophy: proactive" "0e8a16" "Strengthens Ovo's ability to act before being asked"
create_label "philosophy: transparent" "5319e7" "Makes Ovo's thinking more visible to users"
create_label "philosophy: teachable" "c2e0c6" "Lets users shape Ovo's behavior"
create_label "philosophy: privacy" "006b75" "Strengthens local-first / privacy commitments"

# Area
create_label "area: electron" "47b3da" "Electron main process"
create_label "area: ui" "bfdadc" "React renderer UI"
create_label "area: agent" "f3a584" "AI backend / prompt engineering"
create_label "area: knowledge-graph" "c2e0c6" "SQLite knowledge graph"
create_label "area: build-release" "1d76db" "Build, packaging, signing, release pipeline"

# ─── 4. Good First Issues ───────────────────────────────────────────────────
echo ""
echo "📋 Creating good-first-issue seed tickets..."

create_issue() {
  local title="$1"; local body="$2"; local labels="$3"
  local payload
  payload=$(python3 -c "
import json, sys
print(json.dumps({
  'title': sys.argv[1],
  'body':  sys.argv[2],
  'labels': sys.argv[3].split(',')
}))
" "$title" "$body" "$labels")
  local result num
  result=$(curl -sf -X POST "${H[@]}" "$API/repos/$REPO/issues" -d "$payload" 2>/dev/null) || {
    echo "   ⚠️  failed · $title"
    return
  }
  num=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('number','?'))")
  echo "   ✅ #$num · $title"
}

DOCS_URL="https://github.com/$REPO/blob/main/docs/GOOD_FIRST_ISSUES.md"

create_issue "Clean up misplaced compile outputs at repo root" \
"## Background
Compiled JS files were accidentally created at repo root: \`/ipc-handlers.js\` and \`/main.js\`. They are now in \`.gitignore\` so they will not be committed again, but old contributors may still have them locally.

## What to do
- \`rm /main.js /ipc-handlers.js\` if they exist
- Verify \`git status\` is clean

## Acceptance
- [ ] Both files removed locally
- [ ] \`git status\` clean

**Full brief**: $DOCS_URL (issue #1)

⏱  ~30 min · 🏷  chore" \
"good first issue,chore,area: build-release"

create_issue "Standardize empty-state copy across panels" \
"## Background
We have 8+ variants of \"no data\" copy scattered across the UI (\`暂无错误\` / \`暂无日志\` / \`(空)\` vs \`（空）\` full-width vs half-width brackets / etc). Need consistent template + a shared \`Empty\` component.

## Acceptance
- [ ] All empty-state copy follows the same template
- [ ] No more mixed full-width \`（）\` vs half-width \`()\` brackets in Chinese copy
- [ ] (Bonus) Create \`src/components/shared/Empty.tsx\` and use in 2+ panels

**Full brief**: $DOCS_URL (issue #2)

⏱  ~1 h · 🏷  ui-consistency" \
"good first issue,enhancement,area: ui"

create_issue "Replace ⚠ emoji icons with lucide AlertTriangle component" \
"## Background
Codebase mixes emoji icons (\`⚠ 📸 🧠\`) with lucide-react icons. Emoji render differently across OS/font and break visual consistency. Start with \`⚠\` as a focused first PR.

## Acceptance
- [ ] Every \`⚠\` emoji in JSX replaced with \`<AlertTriangle size={N} className=\"text-[var(--warning)]\" />\`
- [ ] No spacing regressions
- [ ] Screenshot before/after in PR

**Full brief**: $DOCS_URL (issue #3)

⏱  ~1 h · 🏷  ui-consistency" \
"good first issue,enhancement,area: ui"

create_issue "Reframe BootstrapWizard headline to restraint promise" \
"## Background
Current onboarding headline creates an expectation Ovo will \"really know you\" — which we can't yet deliver. Product philosophy says we should open with a **restraint promise** instead.

## Acceptance
- [ ] Headline changed (e.g. \`Ovo 默认只看不做\`)
- [ ] Subtitle clarifies what Ovo will and won't do automatically
- [ ] Both 中文 and English versions updated

**Full brief**: $DOCS_URL (issue #4)

⏱  ~30 min · 🏷  product-philosophy" \
"good first issue,enhancement,philosophy: transparent"

create_issue "Add tooltips to ConsoleSidebar tabs" \
"## Background
The 4 tabs (\`现在 / 记忆 / 回放 / 设置\`) are abstract — new users don't know what each tab does. Adding native \`title\` attribute tooltips is a quick win.

## Acceptance
- [ ] Each tab has a \`title=\"...\"\` describing its purpose
- [ ] (Bonus) Replace native tooltip with styled component
- [ ] Screenshot in PR

**Full brief**: $DOCS_URL (issue #5)

⏱  ~30 min · 🏷  ui-polish, a11y" \
"good first issue,enhancement,area: ui"

create_issue "Contribute README screenshots and demo GIF" \
"## Background
README has 6 screenshot placeholders + 1 demo GIF placeholder. Real assets would 10× the project's professional appearance on GitHub.

## What's needed
- 6 PNG screenshots at 1920×1200 (retina) saved to \`docs/assets/\`
- 1 demo GIF at 800px wide, <10MB

## Acceptance
- [ ] All 6 screenshots committed under \`docs/assets/\`
- [ ] README image links updated
- [ ] README_CN.md image links updated

**Full brief**: $DOCS_URL (issue #6)

⏱  ~1 h · 🏷  documentation, design" \
"good first issue,documentation"

create_issue "Add splash screen on app launch" \
"## Background
From double-clicking the icon to seeing UI, there's a 1-3 second black screen. A splash screen would make launch feel intentional.

## Acceptance
- [ ] Splash window appears within 500 ms of launch
- [ ] Shows Ovo logo + spinner + tagline
- [ ] Closes when main window's \`ready-to-show\` event fires
- [ ] Frameless, transparent background, centered

**Full brief**: $DOCS_URL (issue #7)

⏱  ~1-2 h · 🏷  ux-polish" \
"good first issue,enhancement,area: electron"

create_issue "Add 5-second undo for accepted suggestions" \
"## Background
When you accept a suggestion, the receipt only shows for 1.1s — too fast to undo. Gmail-style 5-second undo would dramatically improve trust.

## Acceptance
- [ ] Receipt stays for 5 seconds (configurable constant)
- [ ] Receipt has \"撤销 / Undo\" link reverting the accept
- [ ] Auto-dismiss after 5s if no undo

**Full brief**: $DOCS_URL (issue #8)

⏱  ~1-2 h · 🏷  philosophy:teachable" \
"good first issue,enhancement,philosophy: teachable"

create_issue "Create errorTranslator for common error messages" \
"## Background
When an action fails we currently show raw \`error.message\` strings like \`ENOENT\` or \`AppleScript -1743\` — users can't understand or fix these. Need a translator that maps common errors to friendly \"what + why + what to do\".

## Acceptance
- [ ] New \`electron/error-translator.ts\` exports \`translateError()\`
- [ ] At least 10 common patterns mapped to friendly messages
- [ ] Used in \`PendingActionsSection.tsx\` so users see friendly errors
- [ ] At least 5 unit tests

**Full brief**: $DOCS_URL (issue #9)

⏱  ~2 h · 🏷  dx, philosophy: transparent" \
"good first issue,enhancement,philosophy: transparent"

create_issue "Add search to SettingsPanel" \
"## Background
SettingsPanel is one long scrolling page. Hard to find a specific setting like \"blacklist\" without scrolling. A search box would filter visible sections.

## Acceptance
- [ ] Search input at top of SettingsPanel (sticky)
- [ ] Typing filters which sections are visible
- [ ] Highlight matched keywords using \`<mark>\` tag
- [ ] \`Cmd+F\` shortcut focuses search

**Full brief**: $DOCS_URL (issue #10)

⏱  ~1-2 h · 🏷  ux-polish" \
"good first issue,enhancement,area: ui"

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "🎉 GitHub repo setup complete!"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "What was just done:"
echo "  ✅ Repo description, homepage, topics set"
echo "  ✅ Discussions enabled, Wiki disabled"
echo "  ✅ ~30 labels created"
echo "  ✅ 10 good-first-issue tickets opened"
echo ""
echo "Manual steps you still need to do:"
echo "  1. Upload Social Preview Image (1280×640 PNG)"
echo "     → https://github.com/$REPO/settings"
echo ""
echo "  2. Set up Discussions categories (Q&A / Show & Tell / Ideas)"
echo "     → https://github.com/$REPO/discussions"
echo ""
echo "  3. Record 30-second demo GIF for README"
echo "     → use Kap (https://getkap.co/) → docs/assets/demo.gif"
echo ""
echo "  4. (Optional) Set up Apple Developer ID for signed releases"
echo "     → see docs/RELEASE_PROCESS.md"
echo ""
echo "View your repo: https://github.com/$REPO"
