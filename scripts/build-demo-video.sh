#!/usr/bin/env bash
# Crossfade the Pillow-composed demo frames into a GIF + MP4.
# Run scripts/build-demo-video.py first to produce the frames.
#   ./scripts/build-demo-video.sh [frames_dir]
set -euo pipefail

FRAMES_DIR="${1:-/tmp/ovo-demo}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/assets"
HOLD=2.6          # seconds each slide is held
TRANS=0.55        # crossfade duration
GIF_W=920         # gif downscale width (keeps file size sane)
GIF_FPS=13

build() {
  local variant="$1" n="$2" suffix="$3"
  local inputs=() norm="" chain="" last
  for ((i = 0; i < n; i++)); do
    inputs+=(-loop 1 -t "$HOLD" -i "$FRAMES_DIR/${variant}_$(printf '%02d' "$i").png")
    norm+="[${i}:v]fps=30,settb=AVTB,format=yuv420p,setsar=1[v${i}];"
  done
  last="[v0]"
  for ((i = 1; i < n; i++)); do
    local off out
    off=$(echo "$i * ($HOLD - $TRANS)" | bc -l)
    out="[x${i}]"
    [ "$i" -eq $((n - 1)) ] && out="[out]"
    chain+="${last}[v${i}]xfade=transition=fade:duration=${TRANS}:offset=${off}${out};"
    last="$out"
  done
  chain="${chain%;}"

  echo "▶ MP4 (${variant}, ${n} frames) → demo${suffix}.mp4"
  ffmpeg -y -hide_banner -loglevel error "${inputs[@]}" \
    -filter_complex "${norm}${chain}" -map "[out]" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart -r 30 \
    "${OUT_DIR}/demo${suffix}.mp4"

  echo "▶ GIF (${variant}) → demo${suffix}.gif"
  ffmpeg -y -hide_banner -loglevel error -i "${OUT_DIR}/demo${suffix}.mp4" \
    -vf "fps=${GIF_FPS},scale=${GIF_W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
    "${OUT_DIR}/demo${suffix}.gif"
}

build en 7 ""      # docs/assets/demo.gif + demo.mp4   (English README hero)
build cn 3 "-cn"   # docs/assets/demo-cn.gif + demo-cn.mp4 (Chinese README hero)

echo
ls -lh "${OUT_DIR}"/demo*.gif "${OUT_DIR}"/demo*.mp4
