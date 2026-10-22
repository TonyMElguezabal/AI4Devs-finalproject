# Step 9: unit tests and database verification (JOS-172, move-failed-stage-to-active-provider)

Date: 2026-10-22. Branch `feature/jos-172-move-failed-stage`, on top of `origin/main` at `274f5be8` (JOS-171 and JOS-218 merged, #88 and #89).

## 9.1 Baseline

This worktree is new: before any run, `backend/data/` did not exist, there was no `backend/.secrets.json`, and none of `FAL_API_KEY`, `ELEVENLABS_KEY`, `OPENAI_KEY`, `RUNNINGHUB_API_KEY`, `ADMIN_PASSWORD` or `PROVIDER_KEY_PATH` was set in the environment. There was no default store to snapshot. The verifying runs used a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` in the session scratchpad.

## 9.2-9.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend and frontend | clean (exit 0) |
| `npm test`, backend (scratch store and key file, no key in the environment) | 2022 passed, 5 skipped (148 files passed, 4 skipped) |
| `npm test`, frontend | 299 passed (7 files) |

Tests added: 66. Backend 55: `new-cycle-binding` (8), `failed-stages` (9), `rebind-failed-stage` (8), `move-failed-stage` (14), `move-failed-stage-retry` (5), `admin-failed-stages-route` (11). Frontend 11: `failed-stages-section`. The base counts follow by subtraction: 1967 backend (the JOS-218 final run) and 288 frontend. The shared fixtures are in `backend/test/failedStageFixtures.ts`.

No existing test was changed (task 8.1): the review found none that relies on a retry copying the latest attempt for a stage that has a different binding, on the locked columns being written by anything but registration, or on the `/admin` route list, apart from the chunk-reorder guard below, which was a finding about the new route, not about a test.

Finding while implementing: `scene-api-surface.test.ts` (JOS-144, AC4) refuses any route whose path names `move`, `split`, `merge` or `reorder`. The route was first called `/admin/failed-stages/move`; it failed that guard and was renamed `/admin/failed-stages/to-active-provider` (design Decision 6). The guard itself is unchanged.

Also found: the ticket's example of a video provider admitting 10 to 12 s cannot exist, because JOS-218 refuses a video profile whose shortest duration is above the segmentation lower bound (5 s). The spec, the design tasks and the tests use 5 to 7 s instead (an 8 s interval then gives a requested duration of 7 s, factor 8/7 and the `exceeds-maximum` warning).

**Coverage (task 8.3):** the project has no coverage tool installed and its standard asks for named branches, not a percentage, so none was added. The evidence is the test count and the scenario map below.

## 9.4 Post-test state

`backend/data/` does not exist, no `.secrets.json` was left behind and the scratch store was outside the checkout.

## 8.2 Scenario and acceptance-criterion coverage

failed-stage-move (spec) -> tests
- A failed clip on another provider: failed-stages.test.ts "lists a failed image scene and a failed clip with their scene numbers"; admin-failed-stages-route.test.ts "lists the failed stages ..."; frontend failed-stages-section.test.tsx "lists each failed stage ..."
- A failed stage already on the active provider; a stage that did not fail; a failure with no manual retry: failed-stages.test.ts "does not list a stage already on the active provider", "does not list a stage that has not failed", "does not list a session-level failure that offers no manual retry", "does not list a failed alignment step that bound no provider"
- Move without Administrator access: admin-failed-stages-route.test.ts "Administrator access (AC5)"; frontend "locks the page again when a request is refused with 401"
- Move a failed image stage; the active provider changes after the move: move-failed-stage.test.ts "image: the scene binding is stub-b ...", "keeps the stage where it was moved when the active provider changes again" (no attempt recorded, the state stays failed)
- Manual retry of a moved voice, image and video stage; a moved reasoning (and alignment) stage: move-failed-stage-retry.test.ts (voice, image, video, alignment and reasoning); new-cycle-binding.test.ts (a new cycle takes the binding, for the three session stages)
- Completed results are kept: move-failed-stage.test.ts "a move keeps what is complete (AC3)"; "voice: ... no attempt is recorded"
- A moved clip chooses its duration again (5 to 15 s to 5 to 7 s; an interval beyond the new maximum; only a failed clip with no result changes): move-failed-stage.test.ts "a moved clip chooses its duration again from the new provider (AC4)", "not-failed for ... a scene whose clip is complete"; rebind-failed-stage.test.ts "refuses a scene that is not a failed clip"
- A move is refused when it would not apply (unknown, not failed, already active, retry in progress, not retryable, not usable): move-failed-stage.test.ts "refusals change nothing"; the route tests (404, 409 each, 400)
- Nothing moves automatically: the retries-exhausted scenarios of `active-provider-binding-*.test.ts` (JOS-171), unchanged and green; no code path other than `moveFailedStage` rebinds a stage

active-provider-selection and clip-duration-request (deltas) -> tests
- Manual retry after an explicit move: move-failed-stage-retry.test.ts
- The locks hold again after a move; direct update refused: rebind-failed-stage.test.ts "puts the four locks back ...", "puts the locks back even when the update fails inside it", "is the only code that lifts the locks"; the existing `scene-registration-persistence.test.ts` and `speed-factor` lock tests, unchanged and green

JOS-172 ACs: AC1 = the list tests; AC2 = the retry tests; AC3 = "a move keeps what is complete"; AC4 = the duration tests; AC5 = "Administrator access (AC5)".
