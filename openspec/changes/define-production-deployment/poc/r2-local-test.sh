#!/usr/bin/env bash
# JOS-194 proof of concept — B+ unknowns 2 and 3 against the REAL R2 bucket, from the local image (no Cloudflare compute).
# Needs the image `vid4you-poc-bplus` and a 0600 env file with R2_ACCOUNT_ID, R2_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
# Usage: ./r2-local-test.sh /path/to/r2.env
# Steps: (1) run a stubbed session on container A with FUSE + Litestream; (2) docker kill -9 it; (3) start a FRESH container B
#        (empty local disk) and check the session and its MP4 are back from R2; prints timings. Names the stand-ins it uses.
set -euo pipefail
ENVFILE="${1:?path to r2.env}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-18081}"
run() { # name
  docker run -d --name "$1" --env-file "$ENVFILE" -e POC_MODE=stub -e ALLOW_TEST_ENDPOINTS=1 \
    --cap-add SYS_ADMIN --device /dev/fuse --security-opt apparmor:unconfined \
    -p "127.0.0.1:$PORT:8080" vid4you-poc-bplus >/dev/null
}
wait_health() { for _ in $(seq 1 90); do curl -fsS -m 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

docker rm -f poc-r2-a poc-r2-b >/dev/null 2>&1 || true
echo "== A: start with FUSE + Litestream"; t0=$(date +%s); run poc-r2-a; wait_health || { docker logs poc-r2-a | tail -30; exit 1; }
echo "A healthy after $(( $(date +%s)-t0 ))s"
BASE="http://127.0.0.1:$PORT" bash "$HERE/run-session.sh" /tmp/poc-r2-a.mp4 | tail -3
ID=$(curl -fsS "http://127.0.0.1:$PORT/sessions" 2>/dev/null | json "''" 2>/dev/null || true)
echo "== A: files visible on the FUSE mount"; docker exec poc-r2-a sh -c 'find /mnt/r2/projects -type f | head -8; du -sh /mnt/r2/projects'
echo "== A: Litestream state"; docker exec poc-r2-a litestream generations -config /app/poc/litestream.yml /var/lib/vid4you/skeleton.sqlite 2>&1 | head -5
sleep 3   # sync-interval is 1 s; give it a moment
echo "== kill -9 A (no graceful shutdown)"; docker kill -s KILL poc-r2-a >/dev/null; docker rm -f poc-r2-a >/dev/null
echo "== B: fresh container, empty local disk"; t1=$(date +%s); run poc-r2-b; wait_health || { docker logs poc-r2-b | tail -30; exit 1; }
echo "B healthy after $(( $(date +%s)-t1 ))s (includes the restore from R2)"
docker logs poc-r2-b 2>&1 | grep -iE "restor|litestream|snapshot|replica" | head -6
echo "== B: database and media recovered?"
docker exec poc-r2-b sh -c 'sqlite3 /var/lib/vid4you/skeleton.sqlite "select state,count(*) from sessions group by state" 2>&1; find /mnt/r2/projects -name "*.mp4" | head -3'
echo "done; container poc-r2-b left running for inspection (docker rm -f poc-r2-b)"
