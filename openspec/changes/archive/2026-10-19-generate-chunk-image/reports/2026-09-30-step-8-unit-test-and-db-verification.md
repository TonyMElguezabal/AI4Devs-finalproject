# Step 8 Report — Unit Tests and Database Verification

- Date: 2026-09-30
- Change: generate-chunk-image (JOS-145)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-145-generate-chunk-image` at `f666bf0`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`):

- `node /tmp/jos145-snapshot.mjs data/skeleton.sqlite` (row counts, trigger count, applied migrations) and `find data -maxdepth 2` (before and after)
- `npx vitest run test/image-output-check.test.ts test/image-provider.test.ts test/image-stage.test.ts test/decomposition-phase.test.ts test/orchestrator.test.ts test/scene-registration-session.test.ts test/session-read.test.ts` (targeted)
- `npx vitest run` (full suite), `npm run typecheck`

## Unit Test Results

- Targeted: 113 passed, 0 failed (7 files: the new `image-output-check`, `image-provider` and `image-stage` test files, plus `decomposition-phase`, `orchestrator`, `scene-registration-session` and `session-read`, all touched or reviewed by this change)
- Full suite: 629 passed, 0 failed, 2 skipped (36 files: 34 passed and 2 skipped, the opt-in contract tests against real providers), ~9.4s
- Type check: exit 0

## Scenario-to-Test Mapping (task 7.3/6.4)

Every scenario in `specs/chunk-image-generation/spec.md` has at least one functional test:

| Spec scenario | Test |
|---|---|
| A submitted chunk starts image generation | `image-stage.test.ts` › Launch (AC1) › "launches without User action..." / "sends the chunk's IMAGE instruction..." |
| The state change comes before the provider request | same test — status is read from inside the adapter's own call |
| The session is paused | `image-stage.test.ts` › Launch (AC1) › "sends no request and stays submitted while the session is paused" |
| The recorded provider size is accepted | `image-output-check.test.ts` › "accepts the recorded provider size, 1920x1088..." |
| An under-size image is rejected | `image-output-check.test.ts` (unit) + `image-stage.test.ts` › "counts an under-size image as one failed attempt, then completes on the next attempt" (integration) |
| A portrait image is rejected | same pattern, "counts a portrait image..." |
| Generation succeeds | `image-stage.test.ts` › "stores an accepted image under the project folder..." |
| The success is confirmed twice | `image-stage.test.ts` › "a duplicate success commit leaves exactly one scene_results row..." |
| The provider returns a temporary link | `image-stage.test.ts` › "downloads a temporary-link result to a local file before completing..." |
| The download fails after a successful provider response | `image-stage.test.ts` › "counts a failed download as one failed attempt, then completes on the next attempt" |
| One scene finishes while another is still generating | `image-stage.test.ts` › Independent progression › "a finished scene reaches image-complete while a sibling is still generating" |
| One scene fails while another is still generating | same block › "one scene's failure does not affect a sibling's progression" |
| The first attempt binds the provider | `image-stage.test.ts` › Provider binding (AC4) › "the first attempt binds..." |
| A retry uses the bound provider | same block › "a later attempt does not overwrite an already-bound provider..." |
| The bound provider is unavailable in the running build | same block › "a bound provider with no adapter..." |
| Two sessions each have a chunk with the same identifier | `image-stage.test.ts` › Independent progression › "a result is scoped to its own session's chunk and project folder..." |

Additional coverage beyond the spec's own scenarios, added while reviewing (task 7.1) and closing coverage gaps (task 7.4): `launchImageStage`'s automatic trigger after registration (`decomposition-phase.test.ts`), the `final-video` branch of `deriveSessionState` (`scene-registration-session.test.ts`), boot reconciliation of an interrupted real attempt (`image-stage.test.ts` › Restart reconciliation), the adapter throwing and unreadable image bytes, and direct unit tests for `downloadGeneratedImage`, `sniffImageExtension` and the Fal.ai adapter's HTTP status classification.

## Database State Verification

- Pre-test baseline: every table 0 rows, 13 triggers, migrations 2-9 applied, `data/projects` empty (one stray empty directory from an earlier manual session, `Traversal Test 2026-09-29 23-15`, found and removed before the baseline was captured — harmless residue, not tracked by git)
- Post-test: identical row counts (all 0), 13 triggers, migrations 2-9 — every test's own `resetAll()`/`concurrency.resetAll()` in `beforeEach` left the store clean
- One leftover empty directory reappeared: `data/projects/Traversal Test 2026-09-30 15-13`, created by `session-consultation.test.ts` (pre-existing, untouched by this change — it calls `deriveAndCreateProjectFolder("Traversal Test", ...)` directly to test path-traversal-safe naming) and left behind because no later test's `resetAll()` ran after it in this suite ordering. Removed to restore the exact baseline.
- State restored: Yes

## Coverage (task 7.4, already run in full during group 7)

Base `2af1398` (`feature/entrega-2-JAME`'s tip, the branch's own base) vs this branch's head, `@vitest/coverage-v8@3.2.7` installed locally without saving (matching the pattern prior changes in this repo used), each run on its own scratch database in a temporary directory, base measured in a temporary git worktree then removed.

- No file regressed on any metric.
- Totals improved: lines 95.16% → 95.5%, branches 91.06% → 91.41%, functions 98.7% → 98.88%.
- New files: `imageOutputCheck.ts` 100% lines / 81.81% branches, `imageProvider.ts` 100% lines / 95.83% branches.
- `orchestrator.ts` (the only file with a real percentage drop before gap-closing): 93.15% → 91.71% lines at first (the file grew from 219 to 350 statements), fully recovered to 91.71% → resolved to no regression after closing the two real gaps in this story's own new code (the adapter throwing, unreadable image bytes); final: +0.85pp lines, +4.33pp branches vs base.
- Found and fixed a real bug this comparison surfaced: two tests in `image-stage.test.ts` hardcoded a `data/projects/...` path instead of `resolveArtefactPath`, so they passed only by coincidence against the default store's `PROJECTS_ROOT` and failed under a scratch one.
- Full detail, including which specific lines were closed and which pre-existing/unrelated gaps were deliberately left alone, is in the `JOS-145: Review existing tests, close coverage gaps` commit message.

## Outcome

- Step 8 status: PASS
- Blocking issues: none
