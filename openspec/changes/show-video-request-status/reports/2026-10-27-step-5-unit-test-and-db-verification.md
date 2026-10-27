# Step 5: unit tests and database verification (show-video-request-status, JOS-200)

- **Baseline.** Tests ran with `DB_PATH` and `PROJECTS_ROOT` pointing at fresh scratch directories. `backend/data` does not exist in this worktree; the checksum of its (empty) file list was identical before and after the runs.
- **Targeted.** Backend `test/video-request-status.test.ts` (11) and `test/stage-diagnostics-surface.test.ts` (15, one new sentinel test) pass. Frontend `test/video-request-status.test.tsx` (10) passes.
- **Updated.** `test/video-provider.test.ts`: the submit result now also carries `sentBody`, so one test states it exactly and the other matches the part it checks.
- **Backend.** `npm run typecheck` and `npm run lint` clean; `npm test`: 169 files passed, 4 skipped; 2265 tests passed, 5 skipped.
- **Frontend.** `npm run typecheck` clean; `npm test`: 10 files, 344 tests passed. `npm run lint` reports 2 errors and 6 warnings, all in files this change does not touch (`ReportsSection.tsx`: setState in an effect; `reports-section.test.tsx`: unused `API_BASE`; hook-dependency warnings in the admin sections). They are on `main` already. The files this change adds or edits lint clean.
- **Database state after.** The scratch databases were discarded; the migration (version 24) applies on a fresh database and on one at version 23, and no real data was touched.
