# Security Policy

## Supported Versions

Ovo is in active early development. We provide security fixes for:

| Version | Supported |
|---------|-----------|
| Latest minor release | ✅ |
| Older versions | ❌ |

Please always run the latest release from [GitHub Releases](https://github.com/dushaobindoudou/ovo/releases/latest).

---

## Reporting a Vulnerability

If you discover a security issue, **please do not open a public GitHub issue**. Responsible disclosure protects users while we work on a fix.

### Preferred channel

Email: **security@ovo.local** _(or open a [private security advisory](https://github.com/dushaobindoudou/ovo/security/advisories/new) on GitHub)_

Please include:

1. **What you found** — vulnerability type (e.g. IPC injection, path traversal, prompt injection)
2. **Where** — file path and line number if possible
3. **How to reproduce** — minimal steps or PoC
4. **Impact** — what an attacker could do
5. **Suggested fix** (optional but appreciated)

### Our commitment

- **Acknowledgement within 48 hours**
- **Initial assessment within 7 days**
- **Fix or mitigation plan within 30 days for High/Critical issues**
- **Public disclosure coordinated with you** after the fix ships
- **Credit in release notes** (unless you prefer anonymity)

---

## Scope

### In scope

- Electron main process code (`electron/`)
- Renderer code (`src/`)
- IPC channels and preload bridge (`electron/preload.cjs`)
- Build / packaging configuration (`electron-builder.yml`)
- Data storage (SQLite knowledge graph, preferences, secrets store)
- Default AI backend integrations

### Out of scope

- Third-party AI backends themselves (report to their vendors)
- User's own LLM API key handling _outside_ Ovo
- Issues requiring physical access to an unlocked device
- Social engineering attacks

---

## Known Security Considerations

Ovo is a screen-aware desktop AI. We take privacy seriously:

- 📸 **Screenshots stay local** — captures and OCR happen on the user's machine; nothing uploads to our servers
- 🔑 **API keys via Keychain** — stored encrypted via Electron `safeStorage` (macOS Keychain)
- 🧹 **Sensitive data redaction** — API tokens, JWTs, credit card numbers, ID numbers stripped before LLM calls
- 🚫 **App blacklist** — password managers, banking apps never observed by default
- ⏸ **Hard pause** — user can stop all observation with one click

If you find a gap in any of the above, that is a Critical issue — please report immediately.

See also: [`docs/product/PRODUCT_PHILOSOPHY.md`](docs/product/PRODUCT_PHILOSOPHY.md) section on privacy commitments.

---

## Hall of Fame

Security researchers who responsibly disclose vulnerabilities will be listed here (with permission):

_No reports yet — be the first!_
