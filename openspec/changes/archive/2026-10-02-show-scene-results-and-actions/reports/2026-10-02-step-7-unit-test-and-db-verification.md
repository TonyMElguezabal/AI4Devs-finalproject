# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-10-02
- Change: show-scene-results-and-actions (JOS-151)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-151-show-scene-results-and-actions` at `58997cc` plus the uncommitted frontend work of step 4

## Commands Executed

From `backend/` against the default test store (`data/skeleton.sqlite`, `data/projects/`), unless noted:

- `sqlite3 data/skeleton.sqlite "<row counts>"`, trigger count, `schema_migrations` versions, and `find data -maxdepth 2` (pre-test and post-test state)
- `npx vitest run test/scene-image-route.test.ts --reporter=verbose` (targeted, backend)
- `npx vitest run test/components.test.tsx` from `frontend/` (targeted, frontend)
- `npm run typecheck` and `npm test` in `backend` and in `frontend`
- Coverage, backend only, on scratch `DB_PATH` / `PROJECTS_ROOT` (`@vitest/coverage-v8` is already installed): `npx vitest run --coverage --coverage.include=src/routes.ts --coverage.include=src/orchestrator.ts`. The base `10d14e1` (this change's propose commit) was measured in a temporary git worktree, since removed.

## Unit Test Results

- Targeted: `scene-image-route.test.ts` 16 passed; `components.test.tsx` 52 passed.
- Full backend: 725 passed, 2 skipped (the two contract tests that need a real provider), 0 failed (36 files). Type check: exit 0.
- Full frontend: 58 passed, 0 failed (2 files). Type check: exit 0.
- No flaky test, no retry.
- Red phase: before the route existed, the 3 positive route tests failed (the negative ones passed vacuously on a missing route, and became meaningful once it existed). Before `sceneToPayload` changed, 4 of the 6 payload tests failed. Before `sceneActions` existed, the frontend file failed to load, and after it existed 2 old fixtures failed until given `affectedStage: "image"` (task 4.4 extended; see below).

### Coverage (task 6.3)

| Metric | Base `10d14e1` | Head | Change |
|---|---|---|---|
| All measured files, lines | 87.40% | 88.10% | +0.70 |
| All measured files, branches | 83.55% | 84.33% | +0.78 |
| `routes.ts`, lines | 79.16% | 81.59% | +2.43 |
| `routes.ts`, branches | 85.00% | 88.57% | +3.57 |
| `orchestrator.ts`, lines | 94.08% | 94.08% | 0 |
| `orchestrator.ts`, branches | 83.33% | 83.20% | -0.13 |

Nothing meaningful decreased. The `orchestrator.ts` branch figure moved by 0.13 points because the one changed line (`result` in `sceneToPayload`) kept its single ternary while the rest of the file is unchanged; both of its branches are exercised by `scene-image-route.test.ts`. The frontend has no coverage tool installed; every new frontend line (`sceneActions`, `resolveResultUrl`, the new `SceneRow` branches) is exercised by the tests listed below.

## Existing Tests Reviewed (task 6.1)

- Backend: no test asserted the value of `result.imageUrl` (the only `result` assertions are on the scene record, not the payload). Nothing needed to change.
- Frontend: two fixtures set `imageUrl: "scene-1.png"`, updated to the URL shape (task 4.4). Two further fixtures built a `failed` scene with no `affectedStage` and expected the correction form ("shows the correction form on a failed scene", "never renders an editable identifier..."). The backend always sets `affectedStage` on a failed scene, so these fixtures were unrealistic; they now carry `affectedStage: "image"`. The other failed-scene fixtures only assert the row and button names, which are unchanged.

## Scenario to Test Mapping (task 6.2)

All 14 scenarios of `specs/scene-detail-view/spec.md` (rows 1-14) have at least one test; rows 15-17 cover requirement text that no scenario spells out. `RT` = `backend/test/scene-image-route.test.ts`, `FC` = `frontend/test/components.test.tsx`, `LS` = `frontend/test/useLiveSession.test.tsx`.

| # | Requirement / scenario | Test (file, describe > it) |
|---|---|---|
| 1 | Listed in ascending order: out-of-order completion | FC, "SceneList ordering (Decision 6)" > renders scenes in ascending index order regardless of array order |
| 2 | ... a state change arrives | FC, "A live state change reaches the row (JOS-151)" > shows image-complete once a new snapshot reports it, without a remount; LS, "collapsed events per scene" > keeps each scene's latest state |
| 3 | Image route: a scene with a stored image | RT, "A scene's stored image is served read-only" > answers 200, image/png and the file's exact bytes; answers image/jpeg for a stored .jpg |
| 4 | ... a scene of another session | RT, same describe > answers 404 for a scene asked for under another session's identifier |
| 5 | ... a scene with no image yet | RT, same describe > answers 404 for a scene with no stored result; ... when the stored file is missing; ... for an unrecognised extension; ... for a bare provider string |
| 6 | ... a stored path escaping the project folder | RT, same describe > refuses a stored path that escapes the project folder and never reads the outside file |
| 7 | Payload: image stored | RT, "The session read points at a scene's viewable results" > carries result.imageUrl equal to the image route path...; carries the same URL in the live snapshot; never exposes the stored file path |
| 8 | ... failed after its image was stored | RT, same describe > still carries result.imageUrl for a scene that failed after storing its image |
| 9 | ... nothing stored | RT, same describe > has no result for a scene with nothing stored; carries no videoUrl on any scene |
| 10 | Scene details: image available | FC, "Scene details show the available results" > shows the image from the API base plus the result path; shows the image of a scene that failed after storing it |
| 11 | ... clip available | FC, same describe > shows a video player named for the scene when a clip URL is present |
| 12 | ... nothing available | FC, same describe > shows neither an image nor a video player when there is no result |
| 13 | Failed scene: image failure | FC, "A failed scene shows its error, affected stage and only the actions..." > shows the error, the stage 'image', the retry button and the correction form for an image failure |
| 14 | ... clip failure | FC, same describe > shows the error and the stage 'video' and no actions for a clip failure |
| 15 | Actions derived from state and stage (requirement text) | FC, "sceneActions derives actions from state and affected stage" > image failed; video failed; unknown stage; five non-failed states |
| 16 | Route accepts no body and changes nothing | RT, same describe > is documented in the generated OpenAPI with no request body; other methods on the route are not offered |
| 17 | Not-failed scene offers neither action | FC, "sceneActions ..." > offers nothing for a scene in %s; "A failed scene shows..." > shows no affected stage for a scene that has not failed |

## Database State Verification

- Pre-test baseline: the first targeted runs of this step (tasks 2-4) ran before the baseline was captured, so the store held their leftovers (1 run, 2 scenes, one empty project folder). Earlier reports treat an empty store as the baseline, so that is the reference used here:
  - Row counts: `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0, `narration_timestamps` 0
  - Triggers: 17 (as found, before and after)
  - Applied migrations: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
  - `data/`: `projects/` (empty), `skeleton.sqlite`, `-shm`, `-wal`, `store.sqlite`
- Post-test validation (after the full runs and the reset below):
  - Row counts: all 0 (identical to the reference)
  - Triggers: 17 (identical); migrations 2-11 (identical); no schema change by this change
  - `data/`: identical file set; `projects/` empty
- State restored: Yes
- Restoration actions: ran the test-only `resetAll()` once against the default store (`node -e "import('./src/db.ts').then(m => { m.resetAll(); process.exit(0) })"`), which empties the tables and `data/projects/`. No file outside `data/` was touched.

## Outcome

- Step 7 status: PASS
- Blocking issues: none
- Follow-up: the test reset also removes the project folder created by the image-route tests (`Image route <date> <time>`), which is the expected cleanup for `resetAll()`.
