# Step 9 Report — Unit Tests and Database Verification

- Date: 2026-09-29
- Change: assign-narration-intervals (JOS-143)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-143-assign-narration-intervals` at `0392b4a`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`), as the earlier changes' step 9 reports did:

- `sqlite3 data/skeleton.sqlite` for row counts, trigger count, applied migrations and the `scenes` columns, and `ls data/projects` (before and after)
- `npx vitest run test/script-segmentation.test.ts test/split-segmentation.test.ts test/scene-registration.test.ts test/scene-registration-persistence.test.ts test/content-lock.test.ts test/scene-api-surface.test.ts test/decomposition-phase.test.ts test/narration-interval-immutability.test.ts` (targeted)
- `npm test` (full suite), `npm run typecheck`

## Unit Test Results

- Targeted: 182 passed, 0 failed (8 files)
- Full suite: 605 passed, 0 failed, 2 skipped (34 files: 32 passed and 2 skipped, the opt-in contract tests against real providers)
- Type check: exit 0
- Runtime: targeted 2.49 s, full 8.61 s
- Before this change the suite had 571 passed (JOS-142's step 9 report). New tests: 34.

### New tests, by task

| Task | File | Tests |
|---|---|---|
| 2.1 | `script-segmentation.test.ts` | 6: intervals per fragment (pause goes to the earlier one), the cut at the next speech start, exact shared boundaries, 0 to the MP3 duration, duration derived from the interval, multi-sentence fragments |
| 3.1 | `scene-registration.test.ts` | 11: valid partition; gap, overlap, first start not 0, last end after and before the voice-over, empty interval (each: retryable, names the scene, no instruction call, no chunk); duration of 0, -3, NaN and Infinity (non-retryable) |
| 4.1 | `scene-registration-persistence.test.ts` | 8: read-back of both intervals, null for a skeleton scene, migration 9 on a database at version 8 (idempotent), null interval for a pre-existing scene, `locked:` for each column, refusal of a same-value update, locks kept after the test reset |
| 5.1 | `narration-interval-immutability.test.ts` | 3: after completion; after failure, automatic retries, manual retry and correction; second registration refused |
| 6.1 | `scene-api-surface.test.ts` | 5: session read, snapshot, omitted for a skeleton scene, unchanged when a correction body names it, documented in `/docs/json` on responses and on no request body |
| 7.1 | `decomposition-phase.test.ts` | 1: leading silence, an inner 1.5 s pause and trailing silence yield stored intervals `[0, next sentence's first word]` and `[that, voice-over duration]` |

### Review of existing tests (tasks 8.1-8.3)

- 8.1: every hand-built `SegmentedFragment` (`scene-registration.test.ts`, `scene-registration-session.test.ts`, `scene-api-surface.test.ts`, `decomposition-phase.test.ts`) now has a contiguous interval of the old duration from 0, and every `registerDecomposition` call passes the voice-over duration. `scene-registration.test.ts` uses a new helper (`test/fragmentFixtures.ts`) so the overrides that change one fragment's length keep the partition valid. Each test keeps its intent. The segmentation tests that register real fragments (`script-segmentation.test.ts`, `split-segmentation.test.ts`) pass `narration.mp3Duration`, which makes them exact end-to-end proofs of the partition check.
- 8.2: no test counting migrations, triggers or columns needed changes; the tests that list triggers use `arrayContaining`.
- 8.3: no test depended on a scene payload lacking `narrationInterval`.

## Scenario to Test Mapping

| Requirement / scenario | Covered by |
|---|---|
| Interval of a multi-unit fragment | `script-segmentation.test.ts` "takes every interval endpoint from unitBoundaries when a fragment holds several sentences" |
| Pause goes to the earlier fragment | `script-segmentation.test.ts` "gives each fragment the interval between its own boundaries..." |
| Valid partition is registered | `scene-registration.test.ts` "registers a valid partition" |
| Silence before the first word and after the last | `script-segmentation.test.ts` 0-to-MP3-duration test; `decomposition-phase.test.ts` JOS-143 test |
| A gap / an overlap / not starting at 0 / not reaching the end | `scene-registration.test.ts` partition cases |
| Invalid voice-over duration | `scene-registration.test.ts` duration cases |
| Interval persisted and read back | `scene-registration-persistence.test.ts` |
| Direct update refused | `scene-registration-persistence.test.ts` lock tests |
| Retry leaves the interval unchanged | `narration-interval-immutability.test.ts` |
| Second decomposition does not replace intervals | `narration-interval-immutability.test.ts` |
| Interval in the session read | `scene-api-surface.test.ts` |
| Skeleton scene without an interval | `scene-api-surface.test.ts`, `scene-registration-persistence.test.ts` |

## Database State Verification

- Pre-test baseline (default test store), captured after resetting it with `resetAll()` because earlier iterative runs on this branch had already left test residue: `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0, `narration_timestamps` 0; 13 triggers (JOS-142's 11 plus the two new interval locks); migrations 2-9; `data/projects/` empty. The shared local database applies migration 9 as soon as any test on this branch runs, which is the "shared local DB leaks migrations" behaviour noted in design.md's risks.
- Post-test validation: all row counts 0, 13 triggers, migrations 2-9, but one leftover project folder in `data/projects/` (created by `scene-api-surface.test.ts`'s traversal test, which resets at the start of its own `beforeEach`, the pre-existing behaviour JOS-142's report also recorded).
- State restored: Yes, with `resetAll()`; re-verified identical to the baseline (0 rows, `data/projects/` empty).

## Outcome

- Step 9 status: PASS
- Blocking issues: none
- Open: none new
