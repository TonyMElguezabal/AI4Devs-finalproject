# Step 9 — Manual endpoint testing with curl (retry-decomposition, JOS-156)

Date: 2026-10-04. Branch: `feature/jos-156-retry-decomposition`.

## Setup

The server has no stub switch for the alignment and reasoning providers, and the change adds none (they are test-only concerns). A scratch harness outside the repository (scratchpad `harness.ts`) built the real app with `buildApp()`, installed file-controlled stub providers through `setDecompositionDependencies`, held image generation, seeded four sessions and listened on `127.0.0.1:3199`. It used a scratch store (`DB_PATH`) and scratch projects folder (`PROJECTS_ROOT`) under the scratchpad. The real routes, the real orchestrator and the real scheduler ran.

| Session | Seeded state |
| --- | --- |
| A | Stored MP3, alignment failed (transient), no timestamps |
| B | Stored MP3 and timestamps, instruction request failed (transient) |
| C | Same as B, then paused |
| D | Divided: has chunks |

## Results

| Step | Request | Result |
| --- | --- | --- |
| 10.1 | `GET /health` | 200 `{"ok":true}` |
| 10.2 | `POST /sessions/A/decomposition/retry` | 200 `{"ok":true,"held":false}`; `GET /sessions/A` then `chunks-processing`; MP3 SHA-256 unchanged (`e468ddbe…a3bec1`) |
| 10.3 | `POST /sessions/B/decomposition/retry` | 200; `chunks-processing`; 2 chunks; B has one `timestamps` attempt before and after |
| 10.4 | retry again on B (chunks) | 409 `already-registered` |
| 10.4 | retry on D (chunks, never failed) | 409 `already-registered` |
| 10.4 | unknown id | 404 `session-not-found` |
| 10.4 | malformed id `not-an-id` | 404 `session-not-found` |
| 10.4 | body `{"script":"x"}` | 400 `Unrecognized key(s) in object: 'script'` |
| 10.4 | retry on paused, failed C | 200 `{"ok":true,"held":true}`; state `chunk-decomposing` |
| 10.4 | second retry on C while held | 409 `retry-already-pending` |
| 10.4 | `POST /sessions/C/continue` | 200; `chunks-processing`; 2 chunks |
| 10.4 | `GET /docs/json` | route documented with responses 200, 404, 409 |

Recorded attempts (`stage, cycle, sequence, trigger, outcome`):

- A: `timestamps 1·1 initial transient`, `timestamps 2·1 manual success`, `decomposition 2·2 initial success`. The timestamps step shares the instance, so the division that follows it is the second try of cycle 2 and, as the first try of its own step, is `initial`.
- B and C: `timestamps 1·1 initial success`, `decomposition 1·2 initial transient`, `decomposition 2·1 manual success`. No new `timestamps` row.

The four MP3s in the scratch projects folder still share one hash after all retries.

## Observations

- No route in the app has an OpenAPI `summary`, so the new route has none either.
- A refused retry on a session that never failed (D) reports `already-registered` because the chunks check comes first, as designed.

## Cleanup

The server was stopped. The scratch store and folder live in the scratchpad. The default store `backend/data/skeleton.sqlite` has the same checksum as the step 8 baseline and `data/projects/` is unchanged.
