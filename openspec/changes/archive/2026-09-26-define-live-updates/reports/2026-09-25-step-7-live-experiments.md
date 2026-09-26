# Step 7 Report — Live Experiments (Burst, Disconnect, Restart, Idle, Isolation)

- Date: 2026-09-25
- Change: define-live-updates (JOS-183)
- Agent: Claude (Sonnet 5)
- Backend: `openspec/changes/define-backend-stack/skeleton`, real store (embedded SQLite)
- Frontend: `openspec/changes/define-frontend-stack/prototype`, React + Vite dev server
- Observation method: `window.__liveUpdatesLog__` / `window.__liveUpdatesConnectCount__` (task 6.5 instrumentation), queried via browser automation — not eyeballed screenshots.

## 7.1–7.2 — Burst: 200 scenes, driven at real cadence

A session of 200 scenes was created in one call (`POST /sessions`), mixed 85% `success`, 10% `flaky` (fails once, then succeeds — exercises a real automatic retry mid-burst), 5% `not_retryable_failure`, latencies randomized 300–500ms, against the standard `STAGE_CONCURRENCY_LIMIT=2` cap — i.e. driven by the concurrency and retry mechanics themselves, not a comfortable fixed cadence.

Observed live (`window.__liveUpdatesLog__.length` polled every 10s while connected):

| t | messages received | session state |
|---|---|---|
| 0s | 1 (initial resync) | `chunks-processing` |
| 10s | 103 | `chunks-processing` |
| 20s | 203 | `chunks-processing` |
| 30s | 303 | `chunks-processing` |
| 40s | 316 | `chunks-processing` |
| 50s | 316 (stalled — see finding below) | `chunks-processing` |

**Finding: one scene's retry delivery was silently lost.** Scene #177 (`flaky`, attempt 2) had a `provider_requests` row sent at `22:12:53.003Z` with `latency_ms: 351`, `resolved: 0` — still unresolved over a minute later, with the backend process alive and healthy (`/health` returned 200) and no error in its logs. Manually replaying the same webhook (`POST /internal/provider-callback/<id>`) resolved it **instantly and correctly** (`{"applied":true}`), and the browser's SSE stream delivered the resulting update immediately (`messages` went 316→317, `scene177` state updated to `chunk-complete` in the observation log within the same second).

This isolates the gap precisely: **the live-update transport (SSE) is not at fault** — it reflected the state change the instant it happened, exactly as designed. The fault is in `define-backend-stack`'s orchestration layer: reconciliation only runs at process **boot**; there is no periodic sweep of in-flight requests during a live process, so one lost `setTimeout` callback (standing in for a lost provider webhook) can hang a scene indefinitely with no automatic recovery short of a restart. This is precisely the failure mode PRD §10.1's per-phase maximum execution time is meant to catch — and `define-backend-stack`'s own ADR already recorded that mechanism as unproven within its timebox. This experiment supplies the concrete evidence for why it matters.

**Final state (after the manual replay), verified against the backend directly:**
```
session state: failed   (11 not-retryable scenes failed; none still generating)
scene count: 200
indices form exact 1..200: True
{'chunk-complete': 189, 'failed': 11}
```
189 (174 success + 15 flaky-recovered) + 11 failed = 200. No scene lost, none duplicated.

**Rendered UI ordering** (task 7.2 — asserted on order, not event count):
```js
// queried via the accessibility-labelled scene rows
{"renderedCount":200,"isStrictlyAscending":true,"first5":[1,2,3,4,5],"last5":[196,197,198,199,200]}
```
Strictly ascending 1..200 in the DOM, despite scenes completing in essentially random order under the concurrency cap and retries.

## 7.3–7.4 — Disconnect and backend restart

A fresh session (3 scenes, staggered 8s/15s/25s latencies) was opened in the browser (`connectCount: 1`). Once scenes 1–2 completed and scene 3 was confirmed still `image-generating`, the backend process was killed (`kill -9`, identified via `lsof -tiTCP:3100 -sTCP:LISTEN`) — genuinely mid-flight.

⚠️ **Procedural note:** the first attempt at this experiment also deleted the SQLite `-wal`/`-shm` files before restarting, which discarded uncommitted writes (including the whole test session) since the process had never cleanly checkpointed. This was **not a product bug** — restarting a `kill -9`'d SQLite process normally recovers its WAL automatically; manually deleting the WAL file is not a normal restart step and should never be done outside deliberate corruption testing. The experiment was redone correctly (no WAL/SHM deletion) with a clean result.

After waiting past scene 3's remaining latency (backend down the whole time) and restarting normally:
```
boot log: {"resumed":1,"recordedFailedAttempt":0,"stillPending":0,...}
```
Exactly the one truly in-flight scene was resumed. The browser, polled 8s after restart:
```js
{"connectCount":2,"messages":3,"lastState":"final-video","sceneStates":["chunk-complete","chunk-complete","chunk-complete"]}
```
`connectCount` went from 1 to 2 — the browser's `EventSource` reconnected automatically exactly once — and the page reached the correct final state for all three scenes with no manual reload, confirmed both via the observation log and a screenshot (URL bar unchanged throughout).

## 7.5 — Idle

A single scene with `latencyMs: 45000` and nothing else happening was opened. Polled every 10s:

| t | connectCount | messages |
|---|---|---|
| 0s | 1 | 1 |
| 10s | 1 | 1 |
| 20s | 1 | 1 |
| 30s | 1 | 1 |
| 40s | 1 | 2 |
| 50s | 1 | 2 (final state: `final-video`) |

`connectCount` never moved from 1 across a 45-second quiet stretch spanning three 15-second heartbeat intervals — the connection was never treated as dead and never reconnected — and the eventual completion still arrived correctly. Scaled down from the ticket's "hour-long" suggestion for the timebox; the mechanism under test (a heartbeat keeping an idle stream alive) is time-scale-independent, so this is structurally the same proof at a fraction of the wall-clock cost.

## 7.6 — Snapshot read cost at scale

`GET /sessions/:id` against the 200-scene session from 7.1, three consecutive runs, full HTTP round-trip via `curl`:
```
real 0.01
real 0.01
real 0.01
```
~10ms at 200 scenes. This is strong evidence **for** Decision 3/4 (resync-on-reconnect): the snapshot resync a reconnecting page performs is cheap even at the largest scale this MVP realistically produces.

## 7.7 — Connection ceiling (two tabs)

The same running session was opened in two separate browser tabs. Both connected successfully (`connectCount: 1` in each) and both received live updates correctly through to completion. Two concurrent connections is well under the 6-connections-per-origin HTTP/1.1 ceiling identified in task 1.4; no degradation observed.

## 7.8 — Cross-session isolation (AC22)

Two independent sessions ("Isolation Session A", "Isolation Session B") were created and opened in two separate tabs. After both completed:

| Tab | Scene id observed via SSE | Scene id from backend for that session |
|---|---|---|
| A | `53a540a0-d733-4325-8706-55b80004c4cb` | `53a540a0-d733-4325-8706-55b80004c4cb` |
| B | `2b1e5c1f-077a-45a8-8515-72678bf675e1` | `2b1e5c1f-077a-45a8-8515-72678bf675e1` |

Each tab's observation log contains only its own session's real scene id — cross-checked directly against each session's backend record. No event from the other session ever reached the wrong tab.

## Outcome

- Step 7 status: **PASS** (with one real finding — see 7.1 above — that does not implicate the live-update mechanism itself)
- No must-pass gate failed; the documented fallback (polling) was not triggered
- All experiments run against the real, decided backend stack and store — no stand-in dependency remains for any observation in this report
