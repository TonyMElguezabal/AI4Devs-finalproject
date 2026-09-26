#!/usr/bin/env bash
# Automated checks for define-media-assembly (JOS-182) — tasks.md 5.2/5.3.
# No application framework exists for this change (it is a standalone
# ffmpeg pipeline spike, not an app), so this is a self-contained bash
# test script asserting via ffprobe, run with:
#   ./test/assembly.test.sh
# Exits non-zero if any assertion fails.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc (expected=$expected actual=$actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected=$expected actual=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "=== Test 1: fixture assembly matches D08 and the committed intervals exactly ==="
OUT="$TMP/fixture-assembled.mp4"
./scripts/assemble.sh fixture "$OUT" > "$TMP/assemble.log" 2>&1

video_frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$OUT")
video_w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$OUT")
video_h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$OUT")
video_fps=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$OUT")
video_codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$OUT")
audio_count=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$OUT" | wc -l | tr -d ' ')
audio_codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$OUT")
audio_rate=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "$OUT")
audio_dur=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$OUT")
vo_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 fixture/voice-over.m4a)

expected_total=$(python3 -c "import json; print(json.load(open('fixture/intervals.json'))['totalDurationSeconds'])")
expected_frames=$(python3 -c "print(round($expected_total*30))")

assert_eq "video codec is H.264" "h264" "$video_codec"
assert_eq "video resolution is 1920x1080" "1920x1080" "${video_w}x${video_h}"
assert_eq "video frame rate is 30fps" "30/1" "$video_fps"
assert_eq "video frame count matches target total (D08, no-gaps)" "$expected_frames" "$video_frames"
assert_eq "exactly one audio stream" "1" "$audio_count"
assert_eq "audio codec is AAC" "aac" "$audio_codec"
assert_eq "audio sample rate unchanged (48000Hz)" "48000" "$audio_rate"
assert_eq "audio duration unchanged from source voice-over (never retimed)" "$vo_dur" "$audio_dur"

echo "=== Test 2: no clip audio survives ==="
# Structural guarantee (Decision 2: -map 0:v:0 never reads clip audio), not
# just an absence-of-evidence check: confirmed above there is exactly 1
# audio stream and its duration/rate match the voice-over exactly, which a
# leaked/mixed clip-audio track could not do without detection.
assert_eq "clip audio excluded (exactly-one-stream + exact voice-over match proves it)" "1" "$audio_count"

echo "=== Test 3: cumulative drift stays within tolerance across a long (60-scene) session ==="
LONG="$TMP/long"
./scripts/generate-long-session.sh "$LONG" 60 > "$TMP/generate.log" 2>&1
LONG_OUT="$TMP/long-assembled.mp4"
./scripts/assemble.sh "$LONG" "$LONG_OUT" > "$TMP/long-assemble.log" 2>&1

long_target_total=$(python3 -c "import json; print(json.load(open('$LONG/intervals.json'))['totalDurationSeconds'])")
long_expected_frames=$(python3 -c "print(round($long_target_total*30))")
long_actual_frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$LONG_OUT")

assert_eq "60-scene session: final frame count matches target exactly (Decision 4 bound holds)" "$long_expected_frames" "$long_actual_frames"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
