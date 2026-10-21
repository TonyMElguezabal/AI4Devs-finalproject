# JOS-199 step 9 — packaging check (task 9.1)

Date: 2026-10-18. Platform: macOS arm64, Node v26.4.0.

## What was run
- Built the single executable with `openspec/changes/define-production-deployment/poc/local/build.mjs` (146.9 MB, SEA).
- Local OTLP receiver on `127.0.0.1:4318`, `VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:4318`, all three consent flags on (`PUT /telemetry/consent`).
- Run 1: executable, grant consent, SIGTERM. Run 2: executable, start, SIGTERM. Run 3: the same bundle (`out/vid4you.cjs`) under `node` with a preload that throws an uncaught error containing `/Users/someone/secret/file.txt` after 8 s.

## Result: pass
| Check | Outcome |
|---|---|
| OpenTelemetry packages bundle and start inside the SEA executable | yes, no runtime errors |
| Metrics arrive (`POST /v1/metrics`) with `vid4you_app_starts_total` | yes, flushed on SIGTERM |
| Error record arrives (`POST /v1/logs`) | yes, `exception.message` = `packaging check failure in [path]` |
| Path scrubbed (`someone` absent from every received body) | yes |
| Rotating log file written | yes, `<data dir>/logs/vid4you.log`, 11 lines |
| Process exits 1 after the uncaught error | yes |

## Finding
The PoC builder cuts `server.ts`'s bootstrap and runs its own `entry.ts`, so telemetry never started in the packaged app. `entry.ts` now calls `initTelemetry()`, `installProcessErrorHandlers()`, `startUpdateCheck()` and the SIGINT/SIGTERM shutdown, as `server.ts` does. The real packaging story must keep these calls in its entry point.

## Not covered
The error record came from the bundle under plain `node`, not the executable, because a SEA ignores `NODE_OPTIONS` (no way to inject the failure). The executable path was proven for metrics and the log file; the handler code is identical.
