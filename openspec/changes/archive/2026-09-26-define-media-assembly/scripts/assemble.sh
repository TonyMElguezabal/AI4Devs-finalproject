#!/usr/bin/env bash
# The documented assembly pipeline for define-media-assembly (JOS-182).
# Every filter and encoder flag is explicit here (tasks.md 3.6) — this is
# the single source of truth US-16 implements against, not something a
# later story composes on its own (specs/media-assembly-foundation/spec.md
# "Single documented assembly pipeline").
#
# Decisions this implements (design.md):
#   1. Retime video only via `setpts`; the voice-over is never touched.
#   2. Each clip's own audio is excluded at the INPUT stage (`-map 0:v:0`
#      — the audio stream is never even read), not muted after the fact.
#   3. Every clip is normalised (`scale` + `fps`) to the target output
#      shape before concatenation, since raw provider clips are not
#      guaranteed to match each other or the target.
#   4. Per-clip duration is snapped to the CUMULATIVE target position in
#      frames, not to each clip's own duration independently. Rounding
#      every clip's OWN duration to the nearest frame is a random walk:
#      proven at 200-scene scale (reports/) to drift up to ~122ms — nearly
#      4 frames, far past the ±1-frame tolerance — even though every
#      individual clip stayed within it. Carry-forward frame accounting
#      (this clip's frame count = round(cumulative target end * fps) -
#      previous clip's actual rounded end frame) bounds cumulative drift
#      to ±0.5 frame at every join, by construction, regardless of session
#      length — at the cost of widening a single clip's own worst-case
#      error from ±0.5 to ±1 frame (two independent roundings can partly
#      cancel or add), which is exactly why the tolerance is stated as
#      ±1 frame rather than ±0.5.
#
# Usage: ./assemble.sh <fixture-dir> <output.mp4> [width] [height] [fps]
#   <fixture-dir> must contain intervals.json, scene-<id>-source.mp4 (one
#   per intervals.json scene, in whatever order; this script sorts by
#   sceneId numerically) and voice-over.<ext>.

set -euo pipefail
FIXTURE="${1:?usage: assemble.sh <fixture-dir> <output.mp4> [width] [height] [fps]}"
OUT="${2:?usage: assemble.sh <fixture-dir> <output.mp4> [width] [height] [fps]}"
WIDTH="${3:-1920}"
HEIGHT="${4:-1080}"
FPS="${5:-30}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

VOICE_OVER=$(find "$FIXTURE" -maxdepth 1 -iname "voice-over.*" | head -1)
if [ -z "$VOICE_OVER" ]; then
  echo "no voice-over.* found in $FIXTURE" >&2
  exit 1
fi

# Ascending scene order (spec "Single documented assembly pipeline";
# design.md Decision-adjacent PRD §6/§7.3 no-gaps rule) — read from
# intervals.json, not assumed from filesystem listing order.
# macOS ships bash 3.2 (no readarray/mapfile); word-splitting on the
# python output is safe here since scene ids are plain digits.
SCENE_IDS=($(python3 -c "
import json
with open('$FIXTURE/intervals.json') as f:
    data = json.load(f)
for s in sorted(data['scenes'], key=lambda s: int(s['sceneId'])):
    print(s['sceneId'])
"))

echo "Stage 1/2 — per-clip retime + normalise (Decisions 1-4)" >&2
NORMALIZED=()
CUM_FRAME=0
for sid in "${SCENE_IDS[@]}"; do
  src="$FIXTURE/scene-${sid}-source.mp4"
  # Decision 4: this clip's render duration comes from the CUMULATIVE
  # target end, snapped to the frame grid, minus the previous clip's own
  # rounded end frame — never from this clip's own duration in isolation.
  read -r target_dur render_dur frame_count cum_frame_next <<< "$(python3 -c "
import json
with open('$FIXTURE/intervals.json') as f:
    data = json.load(f)
scene = next(s for s in data['scenes'] if s['sceneId'] == '$sid')
target_dur = scene['durationSeconds']
cum_end_frame = round(scene['end'] * $FPS)
frame_count = cum_end_frame - $CUM_FRAME
print(target_dur, frame_count / $FPS, frame_count, cum_end_frame)
")"
  src_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  # setpts multiplier: compress/expand the clip's own timeline to its
  # render duration (Decision 1) — independent of the output frame rate,
  # which `fps` below applies afterwards.
  mult=$(python3 -c "print($render_dur / $src_dur)")
  out="$WORK/scene-${sid}-normalized.mp4"
  # `-frames:v <exact count>`, not `-t <seconds>`: states the intended
  # frame count directly rather than asking ffmpeg to derive it from a
  # time cutoff — belt-and-suspenders alongside Decision 4's frame math,
  # not itself the fix for the drift traced below (that was the audio
  # codec, not this).
  ffmpeg -y -hide_banner -loglevel error \
    -i "$src" \
    -map 0:v:0 \
    -filter:v "setpts=${mult}*PTS,scale=${WIDTH}:${HEIGHT},fps=${FPS}" \
    -frames:v "$frame_count" \
    -c:v libx264 -pix_fmt yuv420p \
    "$out"
  actual_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
  speed_factor=$(python3 -c "print(round($src_dur / $target_dur, 4))")
  echo "  scene $sid: source ${src_dur}s -> target ${target_dur}s, rendered ${render_dur}s (factor ${speed_factor}x) -> actual ${actual_dur}s" >&2
  NORMALIZED+=("$out")
  CUM_FRAME=$cum_frame_next
done

echo "Stage 2/2 — concatenate (ascending order) + mux voice-over (Decision 2), encode H.264, copy audio" >&2
FILTER_INPUTS=""
CONCAT_REFS=""
i=0
for f in "${NORMALIZED[@]}"; do
  FILTER_INPUTS+=" -i $f"
  CONCAT_REFS+="[${i}:v]"
  i=$((i + 1))
done
VOICE_INDEX=$i

# `-c:a copy`, not `-c:a aac`: re-encoding the voice-over here is exactly
# what Decision 1 forbids ("copied at its native rate"), and it is not a
# theoretical risk — re-encoding an already-AAC voice-over was found, while
# proving Decision 4, to shift its reported duration by ~7-11ms via AAC's
# own encoder-priming delay, which is where the drift chased in that
# decision's own note actually came from once traced to its source (see
# reports/). If a real voice-over ever arrives in a format the container
# can't carry as-is, that transcode must be checked for this exact failure
# mode rather than assumed safe.
# shellcheck disable=SC2086
ffmpeg -y -hide_banner -loglevel error \
  $FILTER_INPUTS \
  -i "$VOICE_OVER" \
  -filter_complex "${CONCAT_REFS}concat=n=${#NORMALIZED[@]}:v=1:a=0[outv]" \
  -map "[outv]" -map "${VOICE_INDEX}:a" \
  -c:v libx264 -pix_fmt yuv420p -c:a copy \
  "$OUT"

echo "Done: $OUT" >&2
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$OUT" >&2
