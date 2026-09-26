#!/usr/bin/env bash
# Generates a longer synthetic session (default 40 scenes) purely to expose
# CUMULATIVE drift (design.md Decision 4) — not committed (Decision 7: the
# committed fixture stays minimal; this is regenerable scratch, tasks.md
# 11.4). All scenes share the target shape (1920x1080@30) so this run
# isolates drift from normalisation, which the 5-scene fixture already
# covers separately.
#
# Usage: ./generate-long-session.sh <output-dir> [scene-count]

set -euo pipefail
OUT="${1:?usage: generate-long-session.sh <output-dir> [scene-count]}"
N="${2:-40}"
mkdir -p "$OUT"

python3 - "$OUT" "$N" <<'PYEOF'
import json, random, sys, subprocess, os

out, n = sys.argv[1], int(sys.argv[2])
random.seed(182)  # deterministic — regenerable (tasks.md 11.4)

scenes = []
t = 0.0
for i in range(1, n + 1):
    sid = str(i)
    src_dur = round(random.uniform(1.5, 4.5), 2)
    # keep factors within the recommended 0.5-2.0 range (task 4.3)
    factor = round(random.uniform(0.55, 1.9), 3)
    interval = round(src_dur / factor, 3)
    clip = f"{out}/scene-{sid}-source.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", f"testsrc=size=1920x1080:rate=30:duration={src_dur}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", clip,
    ], check=True)
    scenes.append({
        "sceneId": sid, "start": round(t, 3), "end": round(t + interval, 3),
        "durationSeconds": interval, "sourceDurationSeconds": src_dur,
        "sourceWidth": 1920, "sourceHeight": 1080, "sourceFps": 30,
        "sourceHasOwnAudio": False, "speedFactor": round(src_dur / interval, 4),
    })
    t += interval
    print(f"  scene {sid}: source {src_dur}s -> target {interval}s (factor {round(src_dur/interval,3)}x)")

total = round(t, 3)
with open(f"{out}/intervals.json", "w") as f:
    json.dump({"totalDurationSeconds": total, "scenes": scenes}, f, indent=2)

subprocess.run([
    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", f"sine=frequency=200:duration={total}:sample_rate=48000",
    "-c:a", "aac", f"{out}/voice-over.m4a",
], check=True)

print(f"Done: {n} scenes, total {total}s")
PYEOF
