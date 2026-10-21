# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-10-20
- Change: name-final-video-after-title (JOS-193)
- Agent: Claude

## Commands Executed
- `npx vitest run test/final-video-download.test.ts test/scene-download.test.ts test/download-filename.test.ts` (backend)
- `npx tsc --noEmit` (backend), `npm run typecheck` (frontend)
- `npm test` (backend), `npm test` (frontend)

## Unit Test Results
- Targeted tests: 50 passed, 0 failed, 0 skipped
- Backend full suite: 1750 passed, 0 failed, 5 skipped (119 files passed, 4 skipped)
- Frontend full suite: 258 passed, 0 failed
- Typecheck: clean in both packages
- Notes: run in a fresh worktree with no `backend/.secrets.json`, so provider-dependent tests are not masked by local secrets. One test first failed for a pre-existing reason (see below), not for the change.

## Scenario to test mapping
- Plain title: `download-filename.test.ts` (plain), `final-video-download.test.ts` (names a plain title)
- Non-ASCII title: `download-filename.test.ts` (non-ASCII, NFC, contentDisposition round-trip), `final-video-download.test.ts` (keeps a non-ASCII title)
- Separators and forbidden characters: both files
- Quote and line break: `download-filename.test.ts` (cannot be broken out of), `final-video-download.test.ts` (one header, no quote or newline)
- Dots, spaces, whitespace runs: both files
- Windows reserved name: both files
- Very long title: both files (150 characters over HTTP, 300 in the unit test)
- Distinct titles that sanitise alike: `final-video-download.test.ts`
- Per-scene names unchanged: `scene-download.test.ts`

## Finding outside this change
A project title longer than about 230 bytes cannot be registered at all: the project folder is named `<title> <timestamp>` and the filesystem rejects a name over 255 bytes (`ENAMETOOLONG` from `deriveAndCreateProjectFolder`). The 300-character spec scenario was therefore reduced to 150 characters over HTTP. Not fixed here; worth its own ticket.

## Database State Verification
- Pre-test baseline: `backend/data/` did not exist in the fresh worktree
- Post-test validation: `backend/data/` was created by the test runs (gitignored)
- State restored: Yes
- Restoration actions: removed `backend/data/`

## Outcome
- Step 5 status: PASS
- Blocking issues: none
