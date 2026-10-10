# Step 5 — Unit test and DB verification (JOS-162, keep-project-files-locally)

## Scope expansion note (task 1.1)

The gate check found JOS-157 and JOS-158 both merged into `feature/entrega-2-JAME` since this change was proposed. Their corrections still only reach the store (`image_instruction`/`instruction`/`video_instruction` columns), never the project folder, so per task 1.1 the corrected-instructions file was folded into this change's scope (design.md Decision 5, proposal.md, spec.md all updated before any code).

## AC/scenario → test map

| spec.md scenario | PRD AC | Test |
|---|---|---|
| Script stored at session creation | AC1 | `test/persistence.test.ts` — "Script file written at session creation (JOS-162, Decision 1)" |
| Generated texts stored at chunk registration | AC1 | `test/scene-registration.test.ts` — "Generated texts file written at chunk registration (JOS-162, Decision 2)" |
| Media results stored | AC1 | `test/project-files-ac-pinning.test.ts` — "AC1 — every media result lands in the project folder" (new, full pipeline to disk); already covered per-stage by `voice-over-persistence.test.ts`, `video-persistence.test.ts`, `assembly-persistence.test.ts`, `narration-timestamps-persistence.test.ts` |
| Corrected instruction stored | — (§10.3, folded in via task 1.1) | `test/corrected-instructions-persistence.test.ts` — all 6 tests |
| Old session consulted | AC4 | `test/project-files-ac-pinning.test.ts` — "AC4 — a session of any age is still consultable" (new, route-level) |
| Same title, same minute | AC3 | `test/persistence.test.ts` — "project folder naming" (pre-existing) |
| Same title, different minute | AC3 | `test/persistence.test.ts` — new test added (scenario had no prior coverage) |
| Image delivered as a link | AC5 | `test/image-stage.test.ts` — pre-existing download test, extended with the local-path assertion |
| Clip delivered as a link | AC5 | `test/video-stage.test.ts` — pre-existing download test, extended with the local-path assertion |
| Link no longer reachable | AC5 | `test/image-stage.test.ts` / `test/video-stage.test.ts` — pre-existing failed-download tests |
| Project files never expire / never deleted | AC2 | `test/project-files-ac-pinning.test.ts` — "AC2 — unchanged after boot recovery" (new) + `test/persistence.test.ts` — rmSync allow-list source check (new) |

Every scenario in `specs/project-files/spec.md` has at least one test.

## Task 4.1 — existing tests reviewed for the new project-folder files

`test/content-lock.test.ts`'s three assertions that count a fresh project folder's contents (`filesIn`) did not expect `script.txt`; updated to include it. `test/session-consultation.test.ts` and `test/scene-registration-*.test.ts` don't count folder contents, so nothing there needed a change.

## Task 4.3 — coverage not decreased

Diff since the propose commit (`8bc41ca`) touches only test files additively: 2 new test files (`corrected-instructions-persistence.test.ts`, `project-files-ac-pinning.test.ts`), and in the 5 modified test files no existing `describe`/`it` block was removed — only 3 expected-value updates (`content-lock.test.ts`, to include the new `script.txt`) and 2 added assertions (`image-stage.test.ts`, `video-stage.test.ts`). Test count went from 1413 to 1419 (backend) plus the 159 frontend tests (unchanged, no frontend code touched).

## Task 5.1/5.4 — default store untouched

Baseline: `backend/data/` does not exist in this worktree (never created). All unit test runs in this session used `DB_PATH=/tmp/jos162-test.sqlite` and `PROJECTS_ROOT=/tmp/jos162-test-projects` (isolated from `data/skeleton.sqlite`/`data/projects`, per the convention `tasks.md`'s intro states). Confirmed after the full run: `backend/data/` still does not exist — the default store was never touched.

## Task 5.3 — typecheck and full test suite

No `backend/.secrets.json` present in this checkout.

- `backend`: `npm run typecheck` — clean. `npx vitest run` (isolated `DB_PATH`/`PROJECTS_ROOT`) — **1419 passed, 4 skipped** (0 failed).
- `frontend`: `npm run typecheck` — clean. `npm test` — **159 passed** (0 failed).

One `orchestrator.test.ts` timing test (`a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle`) was observed to fail once under full-suite load and pass immediately on an isolated re-run and on two subsequent full-suite re-runs; pre-existing flakiness unrelated to this change (it asserts on a `setTimeout`-based `waitFor` against real timers).
