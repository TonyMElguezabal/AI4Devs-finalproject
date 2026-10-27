## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-227-estimated-cost-report` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-227`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree
- [x] 0.3 Rebase onto `origin/main` (`41b03ebd`, 2026-10-27) and reconcile design.md § Context and Decisions 1 and 3 with the merged JOS-223, JOS-226 and JOS-222 code

## 1. Gate

- [x] 1.1 `git fetch`. Confirm JOS-225 (`report-sessions`) is merged and rebase this branch on `origin/main`. (JOS-225, JOS-224 and JOS-229 are merged into `feature/entrega-3-JAME`, not `main`; that branch was merged into this one instead of rebasing, and design.md Context, Decision 1 and Risks now match the merged code.) If it is not, stop and ask. Reconcile design.md Decision 5 with the merged sessions-report row and query, and re-check that `countedAttempts` and the price parameters still match § Context; update design.md first. Keep the scene-attribution flag as R1 reports it.
- [x] 1.2 (PRD drafted as v1.24, `docs/PRD-v1.23.md` kept; **stop until the product owner approves**) Update `docs/PRD.md` (next version, §2.3, §11.4 and a §16 entry) to move R2 into scope as specified here, marked "awaiting the product owner's approval". Stop until the product owner approves.
- [ ] 1.3 Check each adapter vendor's billing rule for failed requests (voice, alignment, reasoning, image, video); record the answer per vendor in design.md Decision 7. If one bills failures, ask the product owner before continuing.

## 2. Backend: shared attempt rows (TDD; design Decision 1)

- [ ] 2.1 Write failing tests that the exported `countedAttempts` returns `units` for failed attempts by the unit rule and the `runId` of each row, and filters by `runIds` without a period.
- [ ] 2.2 Export `countedAttempts` from `providerUsageReport.ts`, add `runId` and the `runIds` filter. Make 2.1 pass; the existing R1 tests pass unchanged.

## 3. Backend: the cost report module (TDD; design Decisions 2, 4)

- [ ] 3.1 Write failing tests for `estimatedCostReport({ from, to })` on a seeded store: billed units × price per row; zero price is priced; no price and no profile are unpriced with `null` cost; failed units shown and not priced; current price used after an edit; one total per currency; `totalsExcludeUnpriced` true only when a row is unpriced; billed units equal R1's for the same period; no rows and no totals for an empty period.
- [ ] 3.2 Implement `backend/src/estimatedCostReport.ts`. Make 3.1 pass.

## 4. Backend: the route (TDD; design Decision 3)

- [ ] 4.1 Write failing route tests for `GET /admin/reports/estimated-cost`: 401 without and with a wrong password; 200 with the shape of Decision 3; 400 for an invalid period; no marker text or stored key in the body; table row counts unchanged after the call.
- [ ] 4.2 Add the route with zod schemas to `adminReportRoutes.ts`. Make 4.1 pass and confirm it is in the generated OpenAPI document.

## 5. Backend: cost per session (TDD; design Decision 5)

- [ ] 5.1 Write failing tests for the sessions report: per-currency estimated cost per session over all its attempts; failed attempts add nothing; `excludesUnpricedProvider` true when a successful attempt ran on an unpriced provider; no amount when nothing is priced.
- [ ] 5.2 Add the fields to the sessions-report module and its response schema. Make 5.1 pass.

## 6. Frontend (TDD; design Decision 6)

- [ ] 6.1 Write failing component tests: `EstimatedCostTable` rows with formatted amounts and currencies, "Unpriced" cells, per-currency totals, the exclusion note shown only when flagged, the "estimate" label and accessible names; `ReportsSection` requests the cost report for the selected period and again on change; the sessions table shows the per-session cost and its note; a 401 locks the page.
- [ ] 6.2 Add `getEstimatedCostReport` and types to `api/client.ts`, the table, the section wiring and the sessions column. Make 6.1 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Update the tests that list `/admin` routes or sections, and the sessions-report and usage-report tests touched by Decisions 1 and 5.
- [ ] 7.2 Map every scenario in `specs/estimated-cost-report/spec.md` and JOS-227 AC1–AC5 to at least one test; list the mapping in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests from groups 2–6.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/report-estimated-cost/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder with stub adapters and `ALLOW_TEST_ENDPOINTS=1`; price the voice provider in USD, one video provider in EUR, one at 0, and leave the image provider unpriced; run sessions with successes and failed clip attempts.
- [ ] 9.2 Without the Administrator password: 401.
- [ ] 9.3 With it: the cost report for the default, all-time and custom periods; compare each row with the spike's R2 query run with `sqlite3` on the same store; check the per-currency totals and the exclusion flag; check the sessions report's per-session cost.
- [ ] 9.4 Error cases: `from` after `to`, a non-date value (400).
- [ ] 9.5 Search the response bodies for the session scripts and failure texts: none present. Confirm the store's row counts are unchanged.
- [ ] 9.6 Delete the scratch store and folder; confirm the default store is untouched. Save `openspec/changes/report-estimated-cost/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Applicability: a new `/admin` table and a sessions column, so this step applies.
- [ ] 10.2 On the scratch store of step 9: the Reports section shows the cost table with priced and unpriced rows, per-currency totals and the exclusion note; the sessions table shows each session's cost and note.
- [ ] 10.3 Change the period; the cost table follows. Remove the voice price on `/admin`; the report shows it unpriced on reload.
- [ ] 10.4 Restore the environment and save `openspec/changes/report-estimated-cost/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/PRD.md`: check the text approved in 1.2 matches what was built.
- [ ] 11.2 `docs/api-spec.yml`: `GET /admin/reports/estimated-cost` (200, 400, 401) and the sessions-report row fields.
- [ ] 11.3 `docs/frontend-standards.md`: the accessible names of the cost table and the sessions cost column.
- [ ] 11.4 `docs/development_guide.md` and the readme's `/admin` section: what the estimate counts, unpriced providers, totals per currency.
- [ ] 11.5 Run `graphify update .`.
