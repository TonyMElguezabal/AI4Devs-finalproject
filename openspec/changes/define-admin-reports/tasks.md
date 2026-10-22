# Tasks — Define the contents of the /admin reports

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a gap rather than reported as computable.

This change ships no product code (proposal, design Non-Goals). The mandatory implementation steps (unit tests, curl, browser) are therefore recorded as not applicable, with the check that proves it (no change under `backend/src` or `frontend/src`).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-175-define-admin-reports` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-175`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate: Collect the inputs

- [x] 1.1 Ask the product owner the design's open questions (which reports and in which release; cost and where the price lives; default period; CSV; R6; R7) and record the answers in `design.md` § Execution Record §1.
- [x] 1.2 Re-verify the data inventory of design § Context against the current code and a store migrated to the latest version: every table and column named, which stages record attempts where, what `provider_requests.mode` can hold, and the stored values of `error_code`. Record any drift.
- [x] 1.3 Record what is still undecided at this point, so later conclusions can be traced to what was known.

## 2. Build the scratch store

- [x] 2.1 Write a throwaway script (`poc/seed-scratch-store.ts`) that runs the real server code against a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`, with stubbed providers, and creates sessions that cover: clean runs; transient failures that recover; exhausted retries with a manual retry; a not-retryable failure; a scene whose speed factor exceeds the limit; a clip with the `exceeds-maximum` warning; a provider switch and a JOS-172 move; and attempts across at least two providers and two calendar days.
- [x] 2.2 Run it and record the store's contents (row counts per table) in the report, so the queries are checked against a known shape.

## 3. Draft the catalogue

- [x] 3.1 For R1 to R7, write the full definition in `reports-catalogue.md`: purpose and the decision it supports, fields with their definitions, granularity, period, data source with the columns used, gaps, and an example row.
- [x] 3.2 Write the throwaway SQL (`poc/queries.sql`) for each report the review keeps, and run it on the scratch store (and on a real store, read-only, if the product owner provides one: task 4.4). Compare each result with the counts known from 2.1 and record matches and mismatches in `reports/YYYY-MM-DD-step-3-queries.md`.
- [x] 3.3 Record, per report, one of: computable as defined; computable with a stated caveat; not computable, with the gap and the follow-up it needs.

## 4. Review and decide

- [x] 4.1 Present the catalogue, the recommendation and the evidence to the product owner. Record the decision per report (agreed for release 1, agreed later, dropped) with the reason.
- [x] 4.2 Decide the cost model (design Decision 4) and the period default with the product owner and record them.
- [x] 4.3 Write ADR 0008 (`docs/adr/0008-admin-reports.md`) with the decision, the alternatives and the catalogue of the agreed reports.
- [x] 4.4 No real store was provided by the product owner, so none was queried (the queries ran only on the scratch store). To run them on a real store later: `sqlite3 -readonly` against a copy, with `poc/queries.sql`.

## 5. Product: the PRD change

- [x] 5.1 Draft the PRD text (§2.1 and §2.3: reports move from out of scope to in scope for the release that builds them; a new section describing the agreed reports, their period and granularity, and the estimate label; the privacy rule of design Decision 5) as `prd-addendum-draft.md`, marked as awaiting the product owner's approval.
- [ ] 5.2 Submit it to the product owner and record the outcome. If it is not approved by the end of the timebox, mark every report story as blocked on it.
- [ ] 5.3 Apply the approved text to `docs/PRD.md` as the next version (keep the previous one as `docs/PRD-v<prev>.md`), with a §16 change log entry.

## 6. Follow-up stories

- [ ] 6.1 Write `follow-up-stories.md`: for each agreed report a story with Given/When/Then acceptance criteria, its data source and its dependencies; one story per recording gap the agreed reports need (provider id on scene attempts; a price per unit on provider profiles; a move log and scene-phase timestamps only if agreed); an estimate for each.
- [ ] 6.2 Create the Linear tickets for the agreed stories (assignee jose.elguezabal@gmail.com, label `type:feature` or `Improvement` as fits), under the E11 epic, related to JOS-175.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Not applicable: no code changes. Evidence: `git diff origin/main --stat -- backend/src frontend/src backend/test frontend/test` is empty.

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Not applicable for new code. Run the existing backend and frontend suites once on the branch with scratch paths to show nothing regressed, and confirm that the default store was not touched (the scratch script used scratch paths only). Save `reports/YYYY-MM-DD-step-8-verification.md`.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Not applicable: no endpoint is added or changed. Record the evidence of 7.1.

## 10. E2E Testing with the browser (MANDATORY if applicable)

- [ ] 10.1 Not applicable: no page changes. Record the evidence of 7.1.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/adr/0008-admin-reports.md` and the PRD update are the documentation of this change. Add a pointer to the ADR in `docs/development_guide.md` ("What the Administrator will be able to see") only if the approved PRD changes what a user reads there.
- [ ] 11.2 Run `graphify update .`.
