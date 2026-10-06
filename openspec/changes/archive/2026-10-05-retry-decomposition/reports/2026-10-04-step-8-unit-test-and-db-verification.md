# Step 8 — Unit tests and database verification (retry-decomposition, JOS-156)

Date: 2026-10-04. Branch: `feature/jos-156-retry-decomposition`.

## Existing tests reviewed (task 8.1)

| Area | Result |
| --- | --- |
| Decomposition and timestamps phases (JOS-139, 140, 144) | Unchanged and passing. The steps gained an optional claimed-attempt parameter and record a `decomposition` attempt; no assertion depended on the absence of one. |
| Launch gate (JOS-152) | Unchanged and passing. `launch-gate.test.ts` resets the launcher registry, so the new registration is tested in `decomposition-retry.test.ts`. |
| Phase progress (JOS-168) | Unchanged and passing. No derivation rule changed (design Decision 6); tests pin it. |
| Session API surface (JOS-137) | Added the route tests. The "no route names the voice-over or narration" check still passes. |
| Scene API surface | **Updated**: its path-name check matched "position" inside `decomposition`. The check now ignores that word and keeps its intent (`scene-api-surface.test.ts`). |
| Frontend `phaseActions` test (JOS-168) | **Updated**: "offers no action for any phase" now excludes a failed, retryable decomposition, which offers retry. A not-retryable decomposition failure test keeps its "no button" expectation. |
| JOS-155 | Not merged yet. Its groups 3-12 are unimplemented, so nothing of it is affected. |

## Scenario coverage (task 8.2)

| Spec scenario | Test |
| --- | --- |
| Retry accepted | `decomposition-retry.test.ts` Acceptance; `session-api-surface.test.ts` 200 |
| Retry refused after a not-retryable failure | `decomposition-retry` refusals; route 409 `not-retryable` |
| Session already has chunks | `decomposition-retry` refusals; route 409 `already-registered` |
| Session not failed in decomposition | `decomposition-retry` refusals (not failed, voice-over failure); route 409 |
| Two retries at once | `decomposition-retry` "two calls made back to back"; route 409 `retry-already-pending` |
| Unknown session or a body | route 404 (unknown and malformed id), 400 (two bodies) |
| Alignment unavailable, then retried | `decomposition-retry-steps` timestamps step |
| Native timestamps were unusable | `decomposition-retry-steps` native-unusable test |
| Reasoning provider failed, then retried | `decomposition-retry-steps` division step |
| Fragments reconstruct the same script | `decomposition-retry-steps` (prompts join to the script) |
| A failed division is recorded | `decomposition-attempts.test.ts` |
| A retried division is recorded in a new cycle | `decomposition-attempts`; `decomposition-retry-steps` cycle test |
| Voice untouched on a timestamps retry / division retry | `decomposition-retry-steps` AC3 table (4 cases, success and failure) |
| Cycle for the timestamps step | `decomposition-retry` "step the retry schedules" |
| Retry during a pause | `decomposition-retry` launcher and pause tests |
| Division retry in progress | `decomposition-retry` derived state tests |
| The retry fails again | `decomposition-retry` derived state: failed with the new cause |
| Button on a failed decomposition / No button otherwise | `components.test.tsx` "Decomposition section offers a retry", `phaseActions` tests |
| A held retry is published (added after the E2E pass) | `decomposition-retry.test.ts` "An accepted retry is published to live subscribers" (held and sent) |
| Continue a held retry from the page (added after the E2E pass) | `components.test.tsx` "SessionHeader pause and continue while decomposing" |

Ticket ACs: AC1 (timestamps step) = `decomposition-retry-steps` timestamps tests. AC2 (division step) = division tests. AC3 (voice-over never touched) = the AC3 table, which checks the voice stub received nothing and the MP3 hash, the `voice_overs` row and the native file are unchanged.

## Coverage (task 8.3)

No coverage tool is configured in either package, so line coverage cannot be compared. Test counts instead: backend 1179 passed and frontend 91 passed after the E2E pass added four tests (they were 1177 and 89 when this report was first written). No test was removed.

## Runs (tasks 9.2-9.3)

- Targeted: group 2 attempt and sender tests, decomposition and timestamps tests, `decomposition-retry`, `decomposition-retry-steps`, `launch-gate`, `phase-progress`, `session-api-surface`, `components` — all pass.
- Backend `npm run typecheck`: clean. Frontend `npm run typecheck`: clean.
- Backend full suite, main checkout: 65 files passed, 3 skipped; 1176 tests passed, 4 skipped (before the last scene-surface fix: 1 failure, fixed; see above). Frontend: 89 passed.
- Backend full suite in a fresh worktree **without** `backend/.secrets.json`: first run had one failure, `orchestrator.test.ts` "a transient failure consumes 1 + RETRY_BUDGET attempts" (3017 ms). The file passes alone twice (24 of 24) and a second full run passed (65 files, 1177 tests, 4 skipped). It is a timing flake of a scene test under load, unrelated to this change; the worktree was removed afterwards.

## Database state (tasks 9.1, 9.4)

Every test run used an isolated store (`DB_PATH` and `PROJECTS_ROOT` in the scratchpad), because the default `data/skeleton.sqlite` carries an older schema and is wiped by `resetAll`. The default store was captured before the runs and compared after: row counts (`runs`=1, `stage_attempts`=0, `voice_overs`=0, `narration_timestamps`=0, `scenes`=0), 13 applied migrations, 19 triggers, `data/projects/` entries (1) and the SQLite file checksum are identical. No restore was needed. No migration was added: `stage_attempts.stage` has no `CHECK` on its values.
