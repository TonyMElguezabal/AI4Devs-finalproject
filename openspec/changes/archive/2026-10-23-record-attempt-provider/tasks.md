## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-222-record-attempt-provider` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-222`
- [x] 0.2 Verify the branch is the current branch of that worktree and has no upstream

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the latest migration on `origin/main` is still 20; if another branch merged a 21, renumber and update design.md first.
- [x] 1.2 Confirm design.md § Context still holds: every image and clip write goes through `insertProviderRequest`, and JOS-172 rebinds only `failed` scenes.

## 2. Backend: migration 21 with the backfill (TDD; design Decisions 2, 3)

- [x] 2.1 Write failing tests: a fixture database migrated up to 20 with one scene bound to `A` (image) and `B` (clip), an image row, a clip row, and a second scene with a clip row and no `video_provider`; after `applyMigrationsTo` the image row has `A`, the clip row `B`, the unbound clip row null, and every other column of every row is unchanged.
- [x] 2.2 Add migration 21 (`ALTER TABLE provider_requests ADD COLUMN provider_id TEXT` plus the backfill `UPDATE`). Make 2.1 pass.

## 3. Backend: record and read the provider (TDD; design Decisions 1, 4)

- [x] 3.1 Write failing tests: `insertProviderRequest` for an image attempt stores the scene's `provider`; for a clip attempt the scene's `video_provider`; `getProviderRequest` and `getLatestProviderRequestForScene` return `providerId`.
- [x] 3.2 Write a failing test for AC3: a clip attempt on `A`, the stage moved to `B` with the JOS-172 store function, a new clip attempt; reading both shows `A` then `B`.
- [x] 3.3 Add the subquery to the INSERT, `providerId: string | null` to `ProviderRequestRow`, and one shared row mapper for the two readers. Make 3.1 and 3.2 pass.

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Run the stage-diagnostics, telemetry, image-stage, video-persistence and scene-registration tests; confirm they pass unchanged (AC4). Fix only assertions that compare whole `ProviderRequestRow` objects or the migration list.

## 5. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of the local database (`provider_requests` count, `schema_migrations` max version)
- [x] 5.2 Run the targeted tests from groups 2 and 3
- [x] 5.3 Run the full backend suite (`npm test` in `backend/`) in this worktree with its own `DB_PATH` and `PROJECTS_ROOT`
- [x] 5.4 Verify the post-test database state matches the baseline and restore if needed
- [x] 5.5 Create report `openspec/changes/record-attempt-provider/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark this group complete only after tests pass and the report exists

## 6. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the backend on a copy of a pre-change database; confirm migration 21 applied and the existing rows were backfilled (sqlite query before and after)
- [x] 6.2 Run a session with stub providers through the image and clip stages via curl; confirm each new `provider_requests` row carries its stage's provider
- [x] 6.3 `GET` the session read before and after the upgrade; confirm the stage diagnostics (provider and attempt counts) are identical (AC4)
- [x] 6.4 Test an unknown session id returns the same error as before
- [x] 6.5 Document the commands and responses in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`; remove the test session and database copy

## 7. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 Not applicable: no frontend or API change. Record the reason in the step 6 report.

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 `docs/data-model.md` §3: add `provider_id` (migration 21, recorded from the stage's binding, backfilled, nullable)
- [x] 8.2 Run `graphify update .`
