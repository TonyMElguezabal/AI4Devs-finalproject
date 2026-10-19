# Step 8 — Unit tests and database verification (JOS-155, retry-voice-over)

Date: 2026-10-19. Worktree: `AI4Devs-jos-155` on `feature/jos-155-complete-retry-voice-over`, created from `origin/feature/entrega-2-JAME` at `7055f0ac`.

## 7.2 — Spec scenario to test map

| Spec scenario | Test |
|---|---|
| Retry after an exhausted cycle | `voice-over-retry.test.ts` > Acceptance (2.2) |
| Retry refused after a not-retryable failure | `voice-over-retry.test.ts` > Refusals (2.1); `session-api-surface.test.ts` 409 not-retryable |
| Session not failed in voice-over | `voice-over-retry.test.ts` (2.1, two cases); `session-api-surface.test.ts` 409 |
| Narration already complete | `voice-over-retry.test.ts` (2.1); `session-api-surface.test.ts` 409 narration-complete |
| Two retries at once | `voice-over-retry.test.ts` (2.1, back to back; second retry); `session-api-surface.test.ts` 409 retry-already-pending |
| Unknown session | `voice-over-retry.test.ts` (2.1); `session-api-surface.test.ts` 404 (two ids) |
| A body is sent | `session-api-surface.test.ts` 400 (two bodies, nothing changes) |
| Same text as the first attempt | `voice-over-retry.test.ts` > Same script (3.1) |
| Bound provider reused / without an adapter | `voice-over-retry.test.ts` > Same provider (3.2, two tests) |
| Failed retry / successful retry delete nothing | `voice-over-retry.test.ts` > Nothing is deleted (3.3, two tests) |
| New cycle after a manual retry | `voice-over-retry.test.ts` > A new cycle (4.1) |
| Retry during a pause | `voice-over-retry.test.ts` > A retry during a pause (4.2) |
| Accepted and running / held | `voice-over-retry.test.ts` > Derived state (4.3, two tests) |
| Button on a failed voice-over / No button otherwise / Refusal shown | `frontend/test/components.test.tsx` > The Voice-over section offers a retry (JOS-155); `phaseActions` tests |

Ticket AC1 (same script) = 3.1. AC2 (same provider) = 3.2. AC3 (nothing deleted) = 3.3.

## 7.1 — Existing tests reviewed

- JOS-168 `phaseActions` tests assumed voice-over never offers a retry: updated.
- JOS-136 and JOS-137 route guards (`voice-over-session-read.test.ts`, `session-api-surface.test.ts`) said no route may name the voice-over or narration: each now exempts `voice-over/retry`, which takes no input and serves nothing.
- JOS-184 (cycles), JOS-152 (held work), JOS-136 (phase): no assumption broken.

## 8.1 / 8.4 — Default store

`backend/data/` did not exist before the run and does not exist after it. Every run used a fresh `DB_PATH` and `PROJECTS_ROOT` under the system temp directory.

## 8.2 / 8.3 — Results

| Run | Result |
|---|---|
| Targeted backend: `voice-over-retry`, `session-api-surface`, `voice-over-session-read`, `voice-over-phase` | 4 files, 116 tests passed |
| Full backend `npm test` | 115 files passed, 4 skipped; 1700 tests passed, 5 skipped |
| Backend `npm run typecheck` | clean |
| Full frontend `npm test` | 3 files, 258 tests passed |
| Frontend `npm run typecheck` | clean |

The worktree has no `backend/.secrets.json`, so these runs are also the run without local credentials required by 8.3.

## 7.3 — Coverage

Not measured: the backend has no coverage provider installed. Every new branch has a test, listed above.

## Not executed here

Manual endpoint testing (step 9) and the browser run (step 10) are recorded in their own reports.
