#!/usr/bin/env bash
# JOS-194 proof of concept — drives one stubbed session to final-video and downloads it.
# Needs the backend started with POC_MODE=stub and ALLOW_TEST_ENDPOINTS=1 (decomposition is not wired on this base, design §1.2).
# Usage: BASE=https://poc.vid4you.download/api ./run-session.sh [outfile]
# Behind Access, also set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token).
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3100}"
OUT="${1:-final.mp4}"
AUTH=()
if [ -n "${CF_ACCESS_CLIENT_ID:-}" ]; then
  AUTH=(-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}")
fi
json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
api() { curl -fsS -m 20 ${AUTH[@]+"${AUTH[@]}"} "$@"; }

ID=$(api -X POST "$BASE/sessions" -H 'Content-Type: application/json' \
  -d '{"title":"PoC session","script":"The harbor is quiet at dusk.","language":"en"}' | json "d['session']['sessionId']")
echo "session=$ID"

for _ in $(seq 1 30); do
  state=$(api "$BASE/sessions/$ID" | json "d['session']['state']")
  [ "$state" = "voice-over-complete" ] && break
  sleep 1
done
[ "$state" = "voice-over-complete" ] || { echo "voice-over did not complete (state=$state)" >&2; exit 1; }

DURATION="${DURATION:-0.990375}"
api -X POST "$BASE/internal/test/quick-scene" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$ID\",\"sceneIndex\":0,\"narrationStartSeconds\":0,\"videoInstruction\":\"harbor\",\"requestedDurationSeconds\":$DURATION}" >/dev/null

for _ in $(seq 1 60); do
  state=$(api "$BASE/sessions/$ID" | json "d['session']['state']")
  echo "state=$state"
  case "$state" in final-video) break ;; *fail*) echo "session failed" >&2; exit 1 ;; esac
  sleep 2
done
[ "$state" = "final-video" ] || { echo "timed out waiting for final-video" >&2; exit 1; }

curl -fsS -m 60 ${AUTH[@]+"${AUTH[@]}"} -o "$OUT" -w "download http=%{http_code} size=%{size_download} type=%{content_type}\n" \
  "$BASE/sessions/$ID/download/final-video"
