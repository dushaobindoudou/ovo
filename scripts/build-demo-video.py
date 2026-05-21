#!/usr/bin/env python3
"""Compose Ovo demo slides (screenshot + caption bar) for the README hero.

Pillow does the layout + caption burn-in (the local ffmpeg build lacks
drawtext/libfreetype); ffmpeg then crossfades the composed frames into a
GIF + MP4. See scripts/build-demo-video.sh for the ffmpeg half.

Usage: python3 scripts/build-demo-video.py <en|cn> <out_dir>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAW = Path(__file__).resolve().parent.parent / "docs" / "assets" / "raw"

# Canvas / layout (even numbers — h264 needs even dims + yuv420p)
CANVAS_W = 1562
TOP = 36
SHOT_BOX = (1466, 860)          # screenshot fits inside this box
GAP = 30
CAP_H = 98
BOTTOM = 20
CANVAS_H = TOP + SHOT_BOX[1] + GAP + CAP_H + BOTTOM   # 1044
BG = (11, 14, 20)               # matches the dark UI chrome
CAP_COLOR = (236, 239, 245)
ACCENT = (10, 132, 255)         # systemBlue, the brand color

# Story order + captions. Each entry: (raw filename, caption)
SLIDES = {
    "en": [
        ("1.png",  "Ovo watches your screen and prepares the next steps — before you ask"),
        ("2.png",  "Accept, reject, or teach it once — Ovo remembers your preference"),
        ("5.png",  "A built-in knowledge graph remembers people, projects & everything it sees"),
        ("6.png",  "Every action is logged and auditable — no black box"),
        ("4.png",  "See what's coming next, and what Ovo already did for you"),
        ("7.png",  "Privacy-first: pause anytime, blacklist apps, bring your own LLM key"),
        ("3.png",  "Always one glance away — a calm companion that runs 100% on your machine"),
    ],
    "cn": [
        ("1-cn.png", "Ovo 看着你的屏幕，在你开口前就备好下一步"),
        ("2cn.png",  "接受、拒绝，或教它一次 —— Ovo 记住你的偏好"),
        ("3cn.png",  "随时在身边，一瞥即达 —— 所有数据 100% 在你电脑上"),
    ],
}

FONT_CANDIDATES = [
    ("/System/Library/Fonts/PingFang.ttc", 0),
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/STHeiti Light.ttc", 0),
]


def load_font(size):
    for path, idx in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def wrap(draw, text, font, max_w):
    """Greedy wrap into <=2 lines; works for CJK (per-char) and Latin (per-word)."""
    if draw.textlength(text, font=font) <= max_w:
        return [text]
    tokens = text.split(" ") if " " in text else list(text)
    sep = " " if " " in text else ""
    lines, cur = [], ""
    for tok in tokens:
        trial = (cur + sep + tok).strip(sep) if cur else tok
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = tok
    if cur:
        lines.append(cur)
    return lines[:2]


def compose(raw_name, caption, out_path):
    shot = Image.open(RAW / raw_name).convert("RGBA")
    shot.thumbnail(SHOT_BOX, Image.LANCZOS)
    shot = rounded(shot, 16)
    # 1px hairline border for definition
    bordered = Image.new("RGBA", (shot.width + 2, shot.height + 2), (0, 0, 0, 0))
    ImageDraw.Draw(bordered).rounded_rectangle(
        [0, 0, bordered.width - 1, bordered.height - 1], 17, outline=(255, 255, 255, 38), width=1)
    bordered.paste(shot, (1, 1), shot)
    shot = bordered

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), BG + (255,))
    sx = (CANVAS_W - shot.width) // 2
    canvas.paste(shot, (sx, TOP), shot)

    draw = ImageDraw.Draw(canvas)
    font = load_font(38)
    cap_top = TOP + SHOT_BOX[1] + GAP
    max_w = CANVAS_W - 200
    lines = wrap(draw, caption, font, max_w)
    line_h = font.getbbox("Ag国")[3] + 10
    block_h = line_h * len(lines)
    y = cap_top + (CAP_H - block_h) // 2
    # small accent dot to the left of the first line
    for i, line in enumerate(lines):
        w = draw.textlength(line, font=font)
        x = (CANVAS_W - w) // 2
        if i == 0:
            r = 7
            draw.ellipse([x - 28, y + line_h // 2 - r, x - 28 + 2 * r, y + line_h // 2 + r], fill=ACCENT)
        draw.text((x, y), line, font=font, fill=CAP_COLOR)
        y += line_h

    canvas.convert("RGB").save(out_path, "PNG")
    return out_path


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    variant, out_dir = sys.argv[1], Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    slides = SLIDES[variant]
    for i, (name, cap) in enumerate(slides):
        p = out_dir / f"{variant}_{i:02d}.png"
        compose(name, cap, p)
        print(f"  ✓ {p.name}  ({name})")
    print(f"canvas={CANVAS_W}x{CANVAS_H}  frames={len(slides)}")


if __name__ == "__main__":
    main()
