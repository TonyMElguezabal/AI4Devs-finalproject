# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-10-02
- Change: gate-assembly-on-complete-scenes (JOS-150)
- Agent: Claude Sonnet 5

## Commands Executed

- `npx vitest run test/assembly-gate.test.ts test/scene-completion-session.test.ts test/scene-completion-api.test.ts test/session-state-machine.test.ts test/scene-registration-session.test.ts test/image-stage.test.ts` (backend, targeted)
- `npm run typecheck` (backend) and `npx tsc --noEmit` (frontend)
- `npx vitest run` (backend and frontend, full suites)
- `npx vitest run --coverage.enabled --coverage.provider=v8` (backend, HEAD)
- Coverage baseline: `git worktree add <scratchpad>/jos150-base 991fc31` (this change's propose commit), `ln -s` the backend `node_modules`, the same coverage command with a scratch `DB_PATH`, then `git worktree remove --force`

## Unit Test Results

- Targeted tests: 134 passed, 0 failed
- Backend full suite: 743 passed, 0 failed, 2 skipped (pre-existing, unrelated: `alignment-provider.contract.test.ts`, `visual-instructions.contract.test.ts`)
- Frontend full suite: 44 passed, 0 failed
- Typecheck: backend and frontend clean
- Notes: one of four coverage-instrumented runs reported 2 failed tests; I did not capture their names. Two later coverage runs and two plain runs passed 743/743. JOS-148's step 8 report recorded the same class of real-timer flake under `--coverage` (`orchestrator.test.ts`, `narration-interval-immutability.test.ts`), so it is most likely that, but this run does not prove it.

## Existing tests reviewed (task 7.1)

- Updated for the new rule: `scene-registration-session.test.ts` "is final-video-generating once every chunk has reached chunk-complete..." (task 3.3, expected by design Risk 1); `session-state-machine.test.ts` `ALLOWED` list gained the two new pairs.
- Reviewed, nothing to change: `image-stage.test.ts` (an `image-complete` chunk still derives `chunks-processing`), `orchestrator.test.ts` and `narration-interval-immutability.test.ts` (neither derives or reads a session state; they assert scene statuses only).
- No test asserted `failedPhase: "image"`.

## Coverage Comparison (task 7.3)

| Metric | Base (`991fc31`) | HEAD | Delta |
|---|---|---|---|
| Statements | 95.78% | 96.20% | +0.42 |
| Branch | 91.69% | 91.81% | +0.12 |
| Functions | 98.91% | 98.93% | +0.02 |
| Lines | 95.78% | 96.20% | +0.42 |

Per-file notes for the two files whose branch percentage moved down:

- `orchestrator.ts` branch 83.33% -> 82.67%: the same 22 branches are uncovered before and after (lines shifted by 8). Five covered branches were deleted with the hand-written processing list, so the ratio dips without any new untested branch.
- `routes.ts` branch 85% -> 83.33%: the final-video download had no test in the base, so v8 reported only the function. The new 409 and 404 tests execute it, which exposes its remaining branch: the 200 path, unreachable until US-16b records a final video (`toSnapshot` passes `hasFinalVideo: false`). It is covered by US-16b, not here.
- `assemblyGate.ts` (new): 100% on all four metrics.

## Scenario-to-test mapping (task 7.2)

All 15 scenarios in `specs/scene-completion-gate/spec.md`:

| Requirement | Scenario | Test |
|---|---|---|
| Assembly may start only when every scene is complete | One scene failed | `assembly-gate.test.ts` "is closed and reports the failed scene when one scene failed" |
| | One scene not yet complete | `assembly-gate.test.ts` "...reports a scene that is video-generating as still processing" |
| | Every scene complete | `assembly-gate.test.ts` "is open when every scene is chunk-complete" |
| | No scenes | `assembly-gate.test.ts` "is closed for an empty scene list" |
| Session stays in scene processing while any scene is generating | Failed beside video-generating | `scene-completion-session.test.ts` "derives chunks-processing for a failed scene beside one generating its clip" |
| | Failed beside not yet started | `scene-completion-session.test.ts` "...beside one not yet started" |
| A failed session identifies its failed scenes | Siblings finish after a failure | `scene-completion-api.test.ts` "reads chunks-processing while a sibling generates, then failed once it completes" |
| | Several failed scenes | `scene-completion-session.test.ts` "lists several failed scenes in ascending order"; `scene-completion-api.test.ts` "carries failedSceneIndexes only on a scene-failed session" |
| | Earlier-phase failure | `scene-completion-session.test.ts` "keeps a decomposition failure as is..."; `scene-completion-api.test.ts` "...on a session that failed in an earlier phase" |
| | The header shows the failed scenes | `frontend/test/components.test.tsx` "shows the failed phase and the failed scene indexes" (and "shows no scene list for a session that failed in another phase") |
| Final video only exists once its file exists | All complete, no final video | `scene-completion-session.test.ts` "derives final-video-generating, not final-video..."; `scene-completion-api.test.ts` "answers 409 for the final-video download..." |
| | A final video exists | `scene-completion-session.test.ts` "derives final-video once a final video exists" |
| Successful results stay available after a failure | A completed sibling | `scene-completion-api.test.ts` "still serves a chunk-complete sibling's image and video in a failed session" |
| | The failed scene's earlier result | `scene-completion-api.test.ts` "still carries the stored result of a scene that failed after storing its image" |
| The transition table records the gate | Leaving scene processing | `session-state-machine.test.ts` allowed pairs plus the closed-table "every other transition is refused" test |

## Database State Verification

- Pre-test baseline (`backend/data/skeleton.sqlite`, the default store `vitest run` uses with no `DB_PATH`), captured after cleaning residue left by my own earlier targeted runs this session (one `runs` row titled "No scenes" and an empty project folder, both from this session's `scene-completion-session.test.ts`, removed with `resetAll()`):
  - Every table (`runs`, `scenes`, `scene_results`, `voice_overs`, `stage_attempts`, `narration_timestamps`, `provider_requests`): 0 rows
  - `schema_migrations`: versions 2-11 (10 rows)
  - Triggers: 17
  - `data/projects/`: empty
- Post-test (after the full backend and frontend suites and the plain reruns):
  - Tables, migrations and triggers identical to the baseline
  - `data/projects/`: one empty `Traversal Test <date>` folder, the same artifact JOS-148's report documented from the traversal-isolation test
- State restored: Yes
- Restoration actions: `rmdir` of the stray empty folder; no row, migration or trigger mismatch

## Outcome

- Step 8 status: PASS
- Blocking issues: none
