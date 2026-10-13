# Step 7 — proof-of-concept experiments (option A), interim

Environment: `poc.vid4you.download` on the real Cloudflare edge (Access gate, Tunnel), host = developer machine (macOS, Docker under Colima, linux/arm64 containers) standing in for the VM. Providers stubbed through `poc/preload.ts`; assembly through real ffmpeg on Debian; `ALLOW_TEST_ENDPOINTS=1` and `quick-scene` used because the decomposition hand-off is not wired (design §1.2, finding 5). Service token `vid4you-poc-smoke`.

| Task | Experiment | Result |
|---|---|---|
| 7.1 | Page and API without credentials | `302` to the Access login on `/` and `/api/health` (before any origin existed, and after) |
| 7.1 | Service token | `200` on `/` (`text/html`) and `/api/health` (`{"ok":true}`) |
| 7.1 | Host exposure | `docker compose ps`: no published port on any of the three containers |
| 7.2 | Stubbed session through the edge | state `final-video`; download `200`, 58,205 B, `video/mp4` |
| 7.3 | SSE held 165 s | heartbeat every 15 s, stream open to the client cap (past the 125 s read timeout) |
| 7.3 | SSE held 970 s (> 900 s idle timeout) | 64 heartbeats at 15 s intervals, stream open until the client's own 970 s cap; the edge never closed it |
| 7.4 | Backend restart between stages | session still `voice-over-complete`, then `final-video`, download `200` 58,205 B; edge healthy 7 s after restart |

## Not exercised
- A restart while a stage is running (stubs finish in about a second).
- 7.5 redeploy, 7.6 real providers, 7.7 promotion check, 7.8 body limit, 7.11 unattended progress, the allowed-identity browser login, the backup and restore drill (6.6).

## Stand-ins
ffmpeg symlinked to `/opt/homebrew/bin`; preload registering assembly plus stub providers; `quick-scene` for the missing hand-off; the developer machine instead of a VM; arm64 instead of the production amd64 image.

## Findings
- With `network_mode: service:backend`, `compose restart backend` also restarts `caddy` and `cloudflared`.
- The account already had an Access application, a Google provider and two policies; the PoC reused the Google provider and left the rest untouched.

## Update 2026-10-13 — option A, restart during a running stage

`POC_STUB_VIDEO_DELAY_MS=45000` keeps the stub video request pending for 45 s, so a session sits in the video stage (`chunks-processing`).

| Experiment | Result |
|---|---|
| `docker kill` of the backend container 6 s into the video stage | The edge answered `502`/`530` and **did not heal**: the backend container was not restarted (a manual kill counts as a manual stop for the restart policy), and `caddy` and `cloudflared`, which share the backend's network namespace, stayed on the dead one. |
| `compose up -d`, then `restart caddy cloudflared` | Edge healthy again. The backend logged `stillPending: 1`, `video inFlight: 1` at boot (`reconcileOnBoot` picked the request up), and the session finished: `final-video`, download `200`, 58,205 B. |
| Request size (7.8) | about 10 MB and about 49 MB accepted; about 51 MB returned `502` at the edge (origin closed mid-upload, so Fastify's `413` is not delivered); about 101 MB returned Cloudflare's `413`. |
| Promotion by tree (7.7) | merge commit with the same content: image FOUND; extra commit: NOT FOUND (fail closed). |

**Finding (option A):** sharing one network namespace between the backend and its connector is a coupling hazard. Whenever the backend container is recreated or restarted on its own, the containers attached to its namespace must be restarted too. `compose restart` and `up` handle it for the three together; a crash restart by the Docker daemon does not. A production compose project needs either separate containers on a bridge network (which needs the `HOST` setting, story S2/S3 area) or the dependents recreated by a supervisor.
