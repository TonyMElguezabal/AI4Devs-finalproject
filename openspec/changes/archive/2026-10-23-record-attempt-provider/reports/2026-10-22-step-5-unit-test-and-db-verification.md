# Step 5: unit tests and database verification (JOS-222)

- **Baseline (5.1):** the worktree has no `backend/data` directory, so there is no local database to alter. Every run used its own scratch `DB_PATH` and `PROJECTS_ROOT` outside the repo.
- **Targeted (5.2):** `test/attempt-provider.test.ts`: 3 tests (migration 21 backfill, image/clip binding stored, attempts on both sides of a provider move). Written first and failing, then green.
- **Full suite (5.3):** `npm test` in `backend/`: 152 files passed, 4 skipped, 0 failed (2093 tests passed, 5 skipped). `tsc --noEmit` clean.
- **AC4 (4.1):** the diagnostics, telemetry, image-stage, video-persistence and scene-registration tests pass unchanged.
- **Found on the way:** the older migration tests build version-1 fixtures without `scenes.provider`, so the backfill checks for that column (design Decision 3).
- **Post-test state (5.4):** no repo database existed before or after; nothing to restore.
