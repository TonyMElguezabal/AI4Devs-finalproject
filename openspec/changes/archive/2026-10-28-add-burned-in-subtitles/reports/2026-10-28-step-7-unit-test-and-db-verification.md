# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-10-28
- Change: add-burned-in-subtitles (JOS-237)
- Agent: Claude Sonnet 5.5

## Commands Executed
All with `DB_PATH` and `PROJECTS_ROOT` pointing at fresh scratch folders; the worktree has no `backend/data` and no `.secrets.json`, so no local state can mask a failure.
- `npx vitest run test/subtitles.test.ts test/subtitle-assembly.test.ts test/assembly-subtitles.test.ts` (written first: failed on the missing modules)
- `FFMPEG_PATH=<pinned darwin-arm64 b6.0> npx vitest run test/subtitles-real-ffmpeg.test.ts`
- `npx vitest run test/packaging-*.test.ts test/server-runtime-load.test.ts`
- `npx vitest run` (full backend suite, default Homebrew ffmpeg)
- `npm run lint` and `npm run typecheck` in `backend/`; `npx vitest run` in `frontend/` (regression only)

## Unit Test Results
- New tests: `subtitles.test.ts` 41, `subtitle-assembly.test.ts` 9, `assembly-subtitles.test.ts` 9, packaging 2 (one changed expectation, one new), `subtitles-real-ffmpeg.test.ts` 5 (run with libass: all pass; skipped without it, like on the Homebrew build).
- Full backend suite: 188 files passed, 5 skipped (193); 2541 tests passed, 10 skipped, 0 failed; 93 s. The skips are the real-ffmpeg files that need a particular ffmpeg, including this change's five.
- Frontend suite: 16 files, 457 tests passed.
- Backend lint: 0 errors, 0 warnings. Type check: clean in both packages.
- Flaky behaviour: none observed.

## 6.1 Existing tests reviewed
`subtitles` is optional on `AssemblyInput` and `burnSubtitles` optional on `buildMuxArguments`, so every existing call is unchanged. The assembly-phase, rebuild, pause and `narration-edits` tests pass without edits. **One intended edit:** the `buildRuntimeEnvironment` expectation in `packaging-runtime-env.test.ts` gained `SUBTITLE_FONT_PATH`.

## Database State Verification
- No database is touched by this change; every run used scratch paths.
- Pre-test baseline (main checkout `backend/data`): 0 entries in `projects/`, 7 SQLite files, newest file mtime 1793033202.
- Post-test: identical (0, 7, 1793033202). The worktree still has no `backend/data`.
- State restored: not needed.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
