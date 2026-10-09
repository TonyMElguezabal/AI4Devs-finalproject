# Step 9 — Unit test and DB verification (JOS-159, retry-final-assembly)

## AC → test mapping

- **AC1 (a failed assembly is recorded and visible)**: `assembly-failure-recovery.test.ts` describe "An assembly failure is recorded on the session" (exhausted cycle, not-retryable, no tool, no voice-over, missing clip, clears on success, no absolute path in cause); `phase-progress.test.ts` "carries the failure on an assembly entry given an assembly failure"; `components.test.tsx` "shows a failed assembly phase with its cause as soon as one arrives".
- **AC2 (a command re-runs assembly from persisted components)**: `assembly-retry.test.ts` (all refusals, accepted retry retryable/not-retryable, concurrent calls, new cycle budget, held/continue); `session-api-surface.test.ts` "POST /sessions/:sessionId/assembly/retry" describe block; `components.test.tsx` "The Final video section offers a retry".
- **AC3 (nothing generated is written/deleted/regenerated)**: `assembly-failure-recovery.test.ts` describe "Nothing generated is touched by an assembly failure or retry" (tracked video-provider calls, voice-over/image byte hashes, scene/voice-over rows, clip order and intervals, across a failed first run, a failed retry and a successful retry).

## spec.md scenario → test mapping

| Scenario | Test |
|---|---|
| Attempts exhausted | `assembly-failure-recovery.test.ts`: "records the failure and derives failed/assembly when a cycle exhausts its retry budget" |
| Not-retryable failure | same file: "records the failure as not retryable when the tool fails not-retryably" |
| A clip file is missing | same file: "eventually records a failure when a scene's clip file is missing, through the ordinary attempt path" |
| Failure keeps the components | same file, Group 5 describe block |
| Failed attempt leaves nothing | same file: "a failed attempt that wrote a partial output leaves the project folder listing unchanged" |
| Successful retry after failures | `assembly-retry.test.ts`: "accepts a retry after a retryable (budget-exhausted) failure"; `assembly-failure-recovery.test.ts` Group 5 |
| Retry accepted and succeeds | `assembly-retry.test.ts` + `session-api-surface.test.ts` 200 test |
| Not failed in assembly | `assembly-retry.test.ts` "refuses a session that has not failed in assembly" + `session-api-surface.test.ts` 409 test |
| Two retries at once | `assembly-retry.test.ts`: "opens exactly one cycle when called concurrently" |
| Nothing regenerated | `assembly-failure-recovery.test.ts` Group 5 |
| Retry during a pause | `assembly-retry.test.ts`: "is held while the session is paused, and runs exactly once on continue" + `session-api-surface.test.ts` held:true test |
| First assembly held by a pause | pre-existing `assembly-launch.test.ts`: "launches a ready assembly after a paused session is continued" |
| Retry in progress | `assembly-retry.test.ts`: "derives final-video-generating, assembly in-progress and no failure..." |
| Button on a failed assembly | `components.test.tsx`: "shows the cause, Retry final video, and no download..." |
| No button otherwise | `components.test.tsx` phaseActions tests + "shows no button while the phase has not failed" |

Every scenario in `specs/assembly-failure-recovery/spec.md` has at least one test, directly or via the pre-JOS-160 assembly-launch test it reuses.

## Coverage

Compared against the propose commit (`cba78c3`) in a disposable detached worktree, `@vitest/coverage-v8` installed `--no-save`:

| File | Before | After |
|---|---|---|
| `orchestrator.ts` | 88.55% | 89.84% |
| `routes.ts` | 74.56% | 75.42% |
| `db.ts` | 98.16% | 98.11%* |
| `assemblyRetry.ts` | (new) | 100% |

\* The two new uncovered lines (`moveAssemblyOutput`'s `EEXIST` branch, `isReadableMp4`'s catch branch) were closed with two direct unit tests before this final run; the residual, unrelated gap is pre-existing defensive-rethrow code in `commitSceneResult`/`commitSceneVideoResult`. No module regressed.

## Test runs

- Targeted: `assembly-failure-recovery`, `assembly-retry`, `launch-gate`, `phase-progress`, `session-api-surface`, `restart-assembly`, `repeated-confirmations`, `video-stage` — 163/163 pass.
- `npm run typecheck` (backend and frontend): clean.
- Full `npm test`: backend 1392-1393/1397 pass (4 skipped contract tests, opt-in); frontend 158/158 pass.
- Repeated in a fresh, disposable detached worktree with no `backend/.secrets.json` present: typecheck clean, backend 1393/1397, frontend 158/158 — identical result to the main worktree, confirming no test secretly depends on real credentials.
- One flaky test observed intermittently under full-suite load: `scene-api-surface.test.ts` > "changes only image_instruction, status, attempts and updated_at on the corrected scene...". Unrelated to this change (scene correction's changed-keys diff, no assembly/retry code involved) — reproduced failing once under full-suite load and once in isolation, passed in 5 further isolated reruns and in the fresh-worktree run. Consistent with a pre-existing `updatedAt` timestamp-collision flake, not a regression.
- No automated test exists for the real ffmpeg adapter (`ffmpegAssemblyTool.ts`) in this codebase — it is wired to nothing in `server.ts` by default (a pre-existing gap from JOS-149, out of this change's scope: the adapter is only ever reachable by setting `USE_STUB_ASSEMBLY_TOOL`, which installs a *stub*, never the real adapter). Flagged to the user; not fixed here as it is outside JOS-159's scope.

## Database state

Default store (`backend/data/skeleton.sqlite`, `backend/data/projects/`), this worktree:

- Before: all data tables (`runs`, `scenes`, `stage_attempts`, `scene_results`, `scene_video_results`, `voice_overs`, `narration_timestamps`, `provider_requests`) at 0 rows; `schema_migrations` at 14 (unchanged by this change — no migration); 17 triggers present (unchanged); `data/projects/` empty.
- One leftover empty directory (`data/projects/Traversal Test ...`) was found accumulated from earlier ad-hoc `npm test` runs during this session (predates this verification pass) and removed to restore a clean baseline.
- After the final verification run (targeted tests, full backend+frontend suites, fresh-worktree rerun): all data tables back to 0 rows, `schema_migrations` still 14, triggers unchanged, `data/projects/` empty. Matches baseline.
