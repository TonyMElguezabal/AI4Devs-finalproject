## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-229-provider-changes-report` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-229` (done by `/opsx:propose`)
- [x] 0.2 Verify it is the current branch of that worktree and has no upstream

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the latest migration on `origin/main` is still 24; if another branch merged a 25, renumber and update design.md first. (Still 24 on `origin/main` and `origin/feature/entrega-3-JAME`; no open branch adds a 25. `feature/entrega-3-JAME` merged into this branch so the PR targets current code.)
- [x] 1.2 Confirm design.md § Context still holds: `setActiveProvider` and `moveFailedStage` are the only callers of `upsertActiveProviderChoice` and of the three rebind functions; the route checks before `setActiveProvider`; `periodOf` is shared in `adminReportRoutes.ts`.

## 2. Backend: migration 25 and the log write (TDD; design Decisions 1, 2)

- [x] 2.1 Write failing tests: a database migrated up to 24 with saved active-provider choices and moved stages gets an empty `provider_changes` table and every other table is unchanged (spec: The log starts empty).
- [x] 2.2 Write failing tests for `recordProviderChange`: both kinds stored with their columns; the CHECK constraints refuse an unknown kind or stage; `resetAll` empties the table.
- [x] 2.3 Add migration 25, `recordProviderChange` and the `resetAll` line in `db.ts`. Make 2.1 and 2.2 pass.

## 3. Backend: log the two kinds of change (TDD; design Decision 3)

- [x] 3.1 Write failing tests through `PUT /admin/providers/:stage`: a change from A to B logs one entry with previous A and new B and their labels (AC1); the first choice over the settings default logs the default as previous; saving the active provider again logs nothing; a refused request (not selectable, not usable) logs nothing.
- [x] 3.2 Write failing tests through the move route: a voice-over move and a clip move each log one entry with session, stage, scene (clip only), previous and new provider (AC2); a refused move logs nothing; a later rename of a provider leaves the entry's label unchanged.
- [x] 3.3 Wrap `setActiveProvider` in `inTransaction` with the log write, and add the log write to `moveFailedStage`'s transaction. Make 3.1 and 3.2 pass.

## 4. Backend: report and route (TDD; design Decision 4)

- [x] 4.1 Write failing tests for `providerChangesReport`: entries in `[from, to)` only, newest first (ties by id); a move carries its session title and scene number, a change carries nulls (AC3).
- [x] 4.2 Write failing route tests: `GET /admin/reports/provider-changes` answers 401 without the password or with a wrong one (AC4); 400 when `from` is not before `to` or not a date-time; 200 with the response schema; table contents unchanged by the call.
- [x] 4.3 Add `backend/src/providerChangesReport.ts` and register the route with Zod schemas, reusing `periodOf`. Make 4.1 and 4.2 pass.

## 5. Frontend: Provider changes table (TDD; design Decision 5)

- [x] 5.1 Write failing component tests: the Reports section shows a "Provider changes" table, newest first, with when, what, stage, session and scene (blank for an active-provider change), from and to; an empty period says there were no provider changes; a 401 locks the page; a network error shows its own message and is cleared when the period changes.
- [x] 5.2 Add the types and client call (`types.ts`, `api/client.ts`), `ProviderChangesTable.tsx`, and the request in `ReportsSection.tsx`. Make 5.1 pass.

## 6. Backend and Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Run the migration, active-provider, failed-stage-move, admin-reports-route and reports-section tests; fix only assertions that list migrations or tables, or count the Reports section's requests.

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the local database (`schema_migrations` max version, `active_providers` rows, `provider_changes` absence)
- [x] 7.2 Run the targeted tests from groups 2 to 5
- [x] 7.3 Run the full backend and frontend suites and lint in this worktree with their own `DB_PATH` and `PROJECTS_ROOT`
- [x] 7.4 Verify the post-test database state matches the baseline and restore if needed
- [x] 7.5 Create report `openspec/changes/record-provider-changes/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark this group complete only after tests pass and the report exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the backend on a copy of the local database; confirm migration 25 applied and `provider_changes` is empty
- [x] 8.2 Change a stage's active provider and back via `PUT /admin/providers/:stage`; save the same provider again; sqlite shows exactly two entries with the right previous and new providers (AC1)
- [x] 8.3 Make a stub-provider session fail a clip, change the active video provider, move the clip via the move route; sqlite shows the move entry with session, scene and providers (AC2)
- [x] 8.4 `GET /admin/reports/provider-changes` for the last 30 days and for a period that excludes them: newest first, then empty (AC3); without the password (401) and with `from` after `to` (400) (AC4)
- [x] 8.5 Restore the active providers changed in 8.2 and 8.3; document commands and responses in `reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`; remove the test session and the database copy

## 9. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Unlock `/admin`, change an active provider in its section, open Reports and confirm the Provider changes table shows the entry with both names; change it back and confirm both entries, newest first; record in `reports/YYYY-MM-DD-step-9-e2e-testing.md`

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/data-model.md`: add `provider_changes` (migration 25)
- [ ] 10.2 `docs/api-spec.yml`: add `GET /admin/reports/provider-changes`
- [ ] 10.3 `docs/PRD.md` v1.23 (keep v1.22 as `docs/PRD-v1.22.md`): §11.4 lists provider changes as built and recorded from this version on; §16 entry
- [ ] 10.4 Run `graphify update .`
- [ ] 10.5 Commit, then (after the user's go-ahead) push and open the PR linking JOS-229; archive the change after merge
