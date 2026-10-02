#!/usr/bin/env bash
# Speed-factor sweep for define-media-assembly (JOS-182) task 4.1.
# Retimes one clean, motion-heavy source clip (ffmpeg's own `testsrc`,
# already at the target 1920x1080@30fps so no normalisation confound)
# across a range of speed factors, and measures an OBJECTIVE proxy for
# judder/duplication severity via `mpdecimate` (counts near-duplicate
# frames) alongside the kept sample outputs a human can inspect
# (Decision 6: the quality call is subjective, but grounded in evidence).
#
# Usage: ./sweep.sh <source.mp4> <out-dir>

set -euo pipefail
SRC="${1:?usage: sweep.sh <source.mp4> <out-dir>}"
OUT_DIR="${2:?usage: sweep.sh <source.mp4> <out-dir>}"
mkdir -p "$OUT_DIR"

SRC_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FACTORS=(0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.25 1.5 1.75 2.0)

echo "factor,target_dur,actual_dur,total_frames,mpdecimate_dropped,mpdecimate_pct" > "$OUT_DIR/results.csv"
for f in "${FACTORS[@]}"; do
  target_dur=$(python3 -c "print($SRC_DUR/$f)")
  mult=$(python3 -c "print($target_dur/$SRC_DUR)")
  out="$OUT_DIR/factor-${f}.mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" \
    -map 0:v:0 \
    -filter:v "setpts=${mult}*PTS,fps=30" \
    -t "$target_dur" \
    -c:v libx264 -pix_fmt yuv420p \
    "$out"
  actual_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
  total_frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$out")
  dropped=$(ffmpeg -i "$out" -vf mpdecimate -loglevel debug -f null - 2>&1 | grep -c "drop frame" || true)
  pct=$(python3 -c "print(round(100*$dropped/$total_frames,1))")
  echo "$f,$target_dur,$actual_dur,$total_frames,$dropped,$pct" >> "$OUT_DIR/results.csv"
  echo "factor=${f}x  target=${target_dur}s  actual=${actual_dur}s  frames=${total_frames}  near-duplicate=${dropped} (${pct}%)"

  # 4 evenly spaced still frames per factor, for direct visual inspection.
  mkdir -p "$OUT_DIR/frames/factor-${f}"
  ffmpeg -y -hide_banner -loglevel error -i "$out" -vf "select='not(mod(n\,30))'" -vsync vfr "$OUT_DIR/frames/factor-${f}/f%02d.png"
done
