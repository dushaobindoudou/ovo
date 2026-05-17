# `docs/assets/` — Visual Assets

This directory holds all visual assets referenced by Ovo's documentation:
README screenshots, demo GIFs, architecture diagrams, blog post images, etc.

## What goes here

### Currently expected (referenced in README)

| Filename | Purpose | Specs |
|---|---|---|
| `demo.gif` | 30-second hero demo at top of README | 800px wide, < 10 MB |
| `screenshot-console.png` | Main console with active pipeline | 1920×1200, retina |
| `screenshot-floating.png` | Floating icon with sticky card open | 1920×1200 |
| `screenshot-toast.png` | Suggestion toast in corner of screen | 1920×1200 |
| `screenshot-memory.png` | Knowledge graph view | 1920×1200 |
| `screenshot-pipeline.png` | Pipeline detail (transparent reasoning) | 1920×1200 |
| `screenshot-privacy.png` | Settings privacy panel | 1920×1200 |

### Nice to have

- `logo.svg` — vector source for the Ovo logo
- `social-preview.png` — 1280×640 for GitHub Social Preview / X cards
- `architecture-diagram.svg` — vector version of the README ASCII art
- `wechat-qr.png` — WeChat community group QR code

## Want to contribute screenshots?

See [`docs/GOOD_FIRST_ISSUES.md`](../GOOD_FIRST_ISSUES.md) — issue #6 is specifically about contributing screenshots. Great way to make your first PR!

## Capture tips

### macOS native screenshot
```
Cmd+Shift+5 → window or selection → save to ~/Desktop
```

### GIF recording
- **[Kap](https://getkap.co/)** (free, open-source) — recommended
- **[GIPHY Capture](https://giphy.com/apps/giphycapture)** (free, App Store)
- Export with: 800px wide, 12 fps, optimized

### Image optimization
- **PNG**: [TinyPNG](https://tinypng.com/) — usually 60-70% size reduction
- **GIF**: [ezgif.com/optimize](https://ezgif.com/optimize) — `--lossy 80` setting works well

### Conventions
- All images committed at **1:1 retina resolution** (1920×1200 for typical screenshots)
- File names: `lowercase-with-hyphens.png`
- No personal data visible (no real emails, names, API keys)
- Demo data should look realistic but not contain anyone's actual content

## Commit conventions

Use the `docs` scope for image-only commits:

```
docs: add console + memory panel screenshots for README
docs: replace placeholder demo.gif with 30s tutorial recording
```
