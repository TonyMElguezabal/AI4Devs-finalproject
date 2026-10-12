#!/bin/sh
# JOS-194 proof of concept — container entrypoint for option B+ (design § Execution Record §3).
# POC_LOCAL=1 skips R2 (FUSE + Litestream) so the image can be exercised without credentials.
set -eu

: "${DB_PATH:?}" "${PROJECTS_ROOT:?}"
mkdir -p "$(dirname "$DB_PATH")"

# Stand-in for a HOST setting: the backend binds 127.0.0.1:3100 only (server.ts:134), the platform routes to 8080.
socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:3100 &

if [ "${POC_LOCAL:-}" = "1" ]; then
  mkdir -p "$PROJECTS_ROOT"
  exec node --import /app/poc/preload.ts /app/backend/src/server.ts
fi

: "${R2_ACCOUNT_ID:?}" "${R2_BUCKET_NAME:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"

mkdir -p /mnt/r2
tigrisfs --endpoint "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" --region auto -f "$R2_BUCKET_NAME" /mnt/r2 &
for _ in $(seq 1 30); do mountpoint -q /mnt/r2 && break; sleep 1; done
mountpoint -q /mnt/r2 || { echo "R2 mount did not come up" >&2; exit 1; }
mkdir -p "$PROJECTS_ROOT"

litestream restore -config /app/poc/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH"

exec litestream replicate -config /app/poc/litestream.yml \
  -exec "node --import /app/poc/preload.ts /app/backend/src/server.ts"
