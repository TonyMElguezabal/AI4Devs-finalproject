# Step 9 Report - Unit Tests and Database Verification

- Date: 2026-10-12
- Change: define-production-deployment (JOS-194)
- Agent: Claude (Sonnet 5.5)
- Base: `origin/feature/entrega-2-JAME` at `2fa63dc`, in a fresh worktree (`../AI4Devs-jos-194`), no `.secrets.json`, no `backend/data`

This spike changes no product code, so the suites are run to establish what CI will meet, not to validate a change.

## Commands Executed

- `npm ci` in `backend/` and `frontend/` (fresh checkout)
- `DB_PATH=<tmp>/s.sqlite PROJECTS_ROOT=<tmp>/projects NODE_ENV=test npx vitest run` (backend, macOS arm64, Node 26.4.0, three full runs)
- `npx vitest run test/orchestrator.test.ts` with the same variables (three runs, file alone)
- `npm run typecheck` in `backend/` and `frontend/`; `npx vitest run` in `frontend/`
- The backend suite in `node:26.4.0-bookworm-slim` (Linux aarch64) under Colima: first without ffmpeg, then with ffmpeg installed (two runs), then with ffmpeg and `docs/PRD*.md` available (two runs)

## Unit Test Results

| Environment | Run | Files | Tests | Result |
|---|---|---|---|---|
| macOS, isolated temp dirs | 1 | 87 passed, 1 failed, 3 skipped | 1438 passed, 1 failed, 4 skipped | `orchestrator.test.ts > a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle` timed out in `waitFor` |
| macOS | 2 | 88 passed, 3 skipped | 1439 passed, 4 skipped | green |
| macOS | 3 | 88 passed, 3 skipped | 1439 passed, 4 skipped | green |
| macOS, `orchestrator.test.ts` alone | 3 runs | 1 file | 24 passed each | green |
| Linux, **no ffmpeg** | 1 | 6 failed | 26 failed, 1413 passed | voice-over phase reports "ffprobe is not installed" |
| Linux, ffmpeg, no `docs/` | 2 | 1-2 failed | 1-3 failed | `providerConfig.test.ts` reads `../../docs/PRD-v1.4.md`, absent from the copy (harness artifact); plus orchestrator timing flakes |
| Linux, ffmpeg and `docs/` | 1 | 88 passed, 3 skipped | 1439 passed, 4 skipped | green |
| Linux, ffmpeg and `docs/` | 2 | 87 passed, 1 failed, 3 skipped | 1438 passed, 1 failed | `orchestrator.test.ts > a transient failure consumes 1 + RETRY_BUDGET attempts, then fails` timed out |
| Frontend (macOS) | 1 | 2 passed | 162 passed | green; typecheck clean |

Typecheck: `backend` and `frontend` clean.

Skipped: three provider contract files (`voice-provider`, `alignment-provider`, `visual-instructions` `.contract.test.ts`), which need real credentials and skip without them.

## Findings for the CI follow-up story (task 8.2)

1. **Tests default to `data/skeleton.sqlite` and `data/projects` relative to the working directory.** CI must set `DB_PATH` and `PROJECTS_ROOT` to temporary directories, or every file shares one store in the workspace (`fileParallelism: false` already serialises them).
2. **`ffprobe` must be on `PATH`.** The voice-over phase measures audio with `ffprobe` (`voiceOverPhase.ts:114`); without it 26 tests across 6 files fail on a plain Node image. The CI job must install ffmpeg. (Separately, `ffmpegAssemblyTool.ts` hard-codes `/opt/homebrew/bin`; the tests that touch it use the stub, which is why they do not fail on Linux.)
3. **`providerConfig.test.ts` reads `docs/PRD-v1.4.md`**, so the whole `docs/` tree must be checked out, and the test is pinned to the previous PRD version (the PRD is now 1.5).
4. **`orchestrator.test.ts` is timing-sensitive.** Different tests in that file timed out in 1 of 3 macOS full runs and 1 of 2 clean Linux full runs; the file alone passed 3 of 3. Until it is fixed the CI job needs a single retry of that file or a looser `waitFor`; it must not be silently ignored.
5. **No `.secrets.json` is needed**: every suite passes or skips without one, which is the condition CI will have.
6. **Node version is not declared** (`engines` absent); the run used 26.4.0 as installed locally, and CI should pin the same.

## Database State Verification

- Pre-test baseline:
  - Worktree `backend/data`: absent. `backend/.secrets.json`: absent.
  - Temporary store directories: 0 files, 0 project folders (created empty for each run).
  - Main checkout dev store `backend/data/skeleton.sqlite`: last modified 2026-10-04 22:39 (not used by these runs).
- Post-test validation:
  - Worktree `backend/data`: still absent. `git status`: no tracked change.
  - Main checkout dev store: modification time unchanged (2026-10-04 22:39).
  - Temporary stores live under the session scratchpad and are disposable.
- State restored: Yes (nothing to restore; every run used isolated paths).
- Restoration actions: none.

## Outcome

- Step 9 status: PASS, with the five findings above recorded as input to the CI story rather than fixed here.
- Blocking issues: none for the spike. The `orchestrator.test.ts` timing flake and the ffmpeg-on-PATH requirement are CI preconditions.
