#!/usr/bin/env bash
# Generates the synthetic fixture material for define-media-assembly (JOS-182).
# Regenerable by design (design.md Decision 7 / tasks.md 11.4) — nothing here
# depends on a real provider; ffmpeg's own `testsrc`/`sine` sources stand in
# for "a clip and voice-over as a provider would deliver them", varying only
# what §7.2 says actually varies: duration, resolution, frame rate, and
# whether the clip carries its own audio.
#
# Usage: ./generate-fixture.sh <output-dir>

set -euo pipefail
OUT="${1:?usage: generate-fixture.sh <output-dir>}"
mkdir -p "$OUT"

# scene: id, source duration (s), width, height, fps, has-own-audio, target interval (s)
SCENES=(
  "1|3.0|1280|720|24|1|2.4"
  "2|2.0|1920|1080|30|0|3.0"
  "3|4.0|960|540|25|1|4.0"
  "4|2.5|1920|1080|24|0|2.0"
  "5|3.5|1280|720|30|1|3.0"
)

echo "Generating fixture clips into $OUT ..."
for row in "${SCENES[@]}"; do
  IFS='|' read -r id dur w h fps has_audio interval <<< "$row"
  clip="$OUT/scene-${id}-source.mp4"
  if [ "$has_audio" = "1" ]; then
    # Each clip's own tone is a distinct frequency per scene so a spot-check
    # can tell them apart; this "clip audio" must NOT survive assembly.
    freq=$((300 + id * 140))
    ffmpeg -y -hide_banner -loglevel error \
      -f lavfi -i "testsrc=size=${w}x${h}:rate=${fps}:duration=${dur}" \
      -f lavfi -i "sine=frequency=${freq}:duration=${dur}" \
      -c:v libx264 -pix_fmt yuv420p -c:a aac \
      "$clip"
  else
    ffmpeg -y -hide_banner -loglevel error \
      -f lavfi -i "testsrc=size=${w}x${h}:rate=${fps}:duration=${dur}" \
      -c:v libx264 -pix_fmt yuv420p \
      "$clip"
  fi
  echo "  scene $id: ${w}x${h}@${fps}fps, ${dur}s source, own-audio=${has_audio}, target interval=${interval}s -> $clip"
done

# The voice-over: one continuous tone-swept track whose total duration is the
# sum of the target intervals above (2.4+3.0+4.0+2.0+3.0 = 14.4s), so it
# partitions exactly with no gap — the reference every retimed clip must land
# against. A frequency sweep (not a flat tone) makes it possible to tell, by
# ear or by spectrogram, whether it was ever retimed (it must not be).
TOTAL=14.4
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=200:duration=${TOTAL}:sample_rate=48000" \
  -af "vibrato=f=0.1:d=0.3" \
  -c:a aac \
  "$OUT/voice-over.m4a"
echo "  voice-over: ${TOTAL}s -> $OUT/voice-over.m4a"

# Narration intervals partitioning the voice-over, ascending scene order,
# no gaps (§6, §7.3) — derived from the SCENES table above, not invented
# separately, so the two can never drift out of sync with each other.
python3 - "$OUT" <<'PYEOF'
import json, sys
scenes = [
    ("1", 3.0, 1280, 720, 24, True, 2.4),
    ("2", 2.0, 1920, 1080, 30, False, 3.0),
    ("3", 4.0, 960, 540, 25, True, 4.0),
    ("4", 2.5, 1920, 1080, 24, False, 2.0),
    ("5", 3.5, 1280, 720, 30, True, 3.0),
]
out = sys.argv[1]
intervals = []
t = 0.0
for sid, src_dur, w, h, fps, has_audio, interval in scenes:
    intervals.append({
        "sceneId": sid,
        "start": round(t, 3),
        "end": round(t + interval, 3),
        "durationSeconds": interval,
        "sourceDurationSeconds": src_dur,
        "sourceWidth": w,
        "sourceHeight": h,
        "sourceFps": fps,
        "sourceHasOwnAudio": has_audio,
        "speedFactor": round(src_dur / interval, 4),
    })
    t += interval
with open(f"{out}/intervals.json", "w") as f:
    json.dump({"totalDurationSeconds": round(t, 3), "scenes": intervals}, f, indent=2)
print(f"  intervals.json: {len(intervals)} scenes, total {round(t,3)}s")
PYEOF

echo "Done."
