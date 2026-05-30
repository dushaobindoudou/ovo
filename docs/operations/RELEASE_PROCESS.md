# Release Process

> Step-by-step runbook for shipping a new version of Ovo.
> Target audience: maintainers. Aim for **15 minutes** from "decision to release" to "DMG live on GitHub".

---

## Prerequisites (one-time setup)

### Local
- ✅ `pnpm install` works clean
- ✅ `pnpm typecheck && pnpm lint && pnpm build` all pass
- ✅ `pnpm pack:mac` produces a working DMG locally

### GitHub
- ✅ `main` branch protection on (require PR review)
- ✅ Secrets configured (when ready for signing):
  - `CSC_LINK` — base64-encoded Apple Developer ID cert (.p12)
  - `CSC_KEY_PASSWORD` — cert password
  - `APPLE_ID` — your Apple ID email
  - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from appleid.apple.com
  - `APPLE_TEAM_ID` — your Apple Developer team ID

### Apple Developer ID (recommended; $99/year)
Without signing, every user sees "Ovo can't be opened because the developer cannot be verified" on first launch. Worth the cost from v0.2+ if you're serious about growth.

---

## Release Checklist

### 1. Decide the version

We follow [Semantic Versioning](https://semver.org/):

- **PATCH** (0.2.0 → 0.2.1): bug fixes, no new features
- **MINOR** (0.2.0 → 0.3.0): new features, backward compatible
- **MAJOR** (0.2.0 → 1.0.0): breaking changes, or "we're stable"

Until we hit 1.0.0, we'll be liberal with MINOR bumps for any meaningful new capability.

### 2. Verify CI is green on `main`

```bash
gh workflow view ci.yml --web
```

If CI is red, **stop**. Fix first, then continue.

### 3. Update CHANGELOG.md

Move everything under `## [Unreleased]` into a new section:

```markdown
## [Unreleased]

_Next release will be 0.X+1 — focus on..._

---

## [0.X.0] — YYYY-MM-DD — "<Codename>"

<one paragraph summary of what this release is about>

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...

### Security
- ...
```

Group changes under the [Keep a Changelog](https://keepachangelog.com/) categories. Omit empty sections.

### 4. Bump version in `package.json`

```bash
# Use pnpm for the bump (it edits package.json correctly):
pnpm version <patch|minor|major> --no-git-tag-version

# Or manually edit package.json:
#   "version": "0.X.Y"
```

> **Note**: We use `--no-git-tag-version` because we want the version commit and tag to be separate, controlled steps.

### 5. Commit version + changelog

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to v0.X.0"
```

### 6. Tag the release

```bash
git tag v0.X.0
```

The tag **must** match the pattern `v*` — that's what triggers the release workflow.

### 7. Push commit + tag

```bash
git push origin main
git push origin v0.X.0
```

### 8. Wait for GitHub Actions

Visit https://github.com/dushaobindoudou/ovo/actions

The `release.yml` workflow will:
1. Build arm64 + x64 DMGs in parallel (5-10 minutes)
2. Sign + notarize (if Apple secrets are configured)
3. Create a GitHub Release with the DMGs attached
4. Auto-extract the relevant CHANGELOG section as release notes

If the workflow fails:
- Re-run from the Actions page (transient errors)
- Or fix the issue, delete the tag (`git push --delete origin v0.X.0`), and start over

### 9. Verify the release

- https://github.com/dushaobindoudou/ovo/releases/latest should show your new version
- Download the DMG on a fresh Mac and verify it installs + launches

### 10. Announce

- [ ] X / Twitter post (English) with screenshot or GIF
- [ ] 即刻 post (Chinese) with new features highlighted
- [ ] WeChat group broadcast
- [ ] Discord announcement (if launched)
- [ ] Update Discussions with a "v0.X released" thread
- [ ] Pin the Release in the GitHub repo

---

## Emergency: rollback a bad release

```bash
# Delete the tag remotely (this does NOT delete the GitHub Release)
git push --delete origin v0.X.0

# Delete the GitHub Release via UI: Releases → bad release → Delete

# Revert the version bump if needed
git revert <commit-sha>
git push origin main
```

Bump to a new PATCH version with the fix instead of re-using the same tag.

---

## First release special: v0.2.0

Since this is the **first public release**, take extra care:

- [ ] Test the DMG on **both** Apple Silicon AND Intel Macs
- [ ] Verify the unsigned-build warning in README is accurate ("right-click → Open")
- [ ] Prepare a 30s demo GIF for the Release notes (not just the README)
- [ ] Have the [Show HN draft](https://github.com/dushaobindoudou/ovo/discussions) ready
- [ ] Make sure `good first issue` labels exist on at least 10 issues (use `docs/operations/GOOD_FIRST_ISSUES.md`)
- [ ] Star History Chart will look empty for ~24h — that's fine

---

## Cadence

After v0.2.0:

- **Patch releases**: as needed for critical bugs (within days)
- **Minor releases**: every 2-4 weeks while we're pre-1.0
- **Major release** (v1.0.0): when we have:
  - Signed + Notarized macOS DMG ✅
  - Working auto-update ✅
  - Windows support ✅
  - All P0 issues from `docs/archive/audits/UX_AUDIT.md` resolved ✅
  - >1000 GitHub stars ✅
  - Track record of >30 day mean-time-between-bugs in `BUG_REPORT.md` ✅

---

## See also

- [`CHANGELOG.md`](../../CHANGELOG.md) — all version history
- [`docs/operations/GITHUB_GROWTH_PLAN.md`](GITHUB_GROWTH_PLAN.md) — broader 90-day plan
- [`docs/archive/audits/BUG_REPORT.md`](../archive/audits/BUG_REPORT.md) — historical known issues including release-blockers (C6 signing, C7 auto-update)
