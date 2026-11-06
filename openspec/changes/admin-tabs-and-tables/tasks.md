## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-270-admin-tabs` from `origin/feature/entrega-3-JAME` with `--no-track` in worktree `../AI4Devs-jos-270-admin-tabs`
- [x] 0.2 Verify the current branch and that it has no upstream

## 1. Frontend: Tabs (TDD)

- [x] 1.1 Write failing tests in `frontend/test/admin-page.test.tsx` for the "tabs" scenarios: first tab, choosing a tab sets the hash, `#providers` on load, unknown hash, Reports requests nothing until selected, 401 from another tab locks the page, arrow keys move between tabs
- [x] 1.2 Implement the tabs in `AdminTools.tsx` (state from `location.hash`, `replaceState`, `hashchange`, `tablist`/`tab`/`tabpanel` roles); keep the `refreshKey` wiring
- [x] 1.3 Add tab styles to `styles/app.css`

## 2. Frontend: Table style, formats and period selector (TDD)

- [x] 2.1 Write failing tests: radios are not full width (a stylesheet-free check on the class/markup), the period selector keeps its four choices and default, `formatInstant` output, `n/a` for not-recorded cells, the unpriced-providers note appears once in the sessions report
- [x] 2.2 Add `frontend/src/format.ts` (`formatInstant`, shared number format) and use it in `ProviderChangesTable`, `SessionsReport` and the other tables
- [x] 2.3 Add `.table-scroll` and `.data-table` to `app.css`; wrap and class every report table (`ReportsSection`, `EstimatedCostTable`, `PipelineTimeTables`, `FailuresTables`, `ProviderChangesTable`, `SessionsReport`)
- [x] 2.4 Exclude radios and checkboxes from the global `input` rule; style `ReportPeriodSelector` as a segmented control
- [x] 2.5 Move the "excludes unpriced providers" note of the sessions report to one footnote

## 3. Frontend: Reports tiles and panels (TDD)

- [x] 3.1 Write failing tests in `frontend/test/reports-section.test.tsx`: summary tiles from loaded reports, `—` for a report that failed, panels open/closed by default
- [x] 3.2 Add the summary tiles and wrap each report in `<details>` in `ReportsSection.tsx`

## 4. Frontend: Active providers and provider rows (TDD)

- [x] 4.1 Write failing tests in `active-providers-section.test.tsx` (one row per stage, source badge) and `provider-profiles-section.test.tsx` (name once, `Active` badge, `Edit` visible, `Test connection` and `Delete` inside `More actions for …`, delete still confirms, Escape closes the menu)
- [x] 4.2 Restyle `ActiveProvidersSection` as a compact grid; keep the select names and the source strings
- [x] 4.3 Rework the rows and the card header of `ProviderProfilesSection` with the `<details>` menu

## 5. Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Existing tests that click `Delete …`, `Test connection …` or `Duplicate …` (`provider-profiles-section`, `provider-connection-test-section`, `video-connector-section`) keep passing unchanged: jsdom does not hide a closed `<details>`, so they reach the menu items; the real open/close behaviour is covered by the new menu tests and by task 8.4
- [x] 5.2 No existing test renders `AdminTools` (the section tests render their section alone), so none assumed one page; `admin-tools.test.tsx` covers the tabs. Fixtures of `reports-section.test.tsx` that answered every report with the usage shape now answer `/estimated-cost` with its own shape, and `n/a` replaces `not recorded`
- [x] 5.3 Run `npm run lint` and `npm run typecheck` in `frontend/`

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test database baseline (counts of `sessions`, `provider_profiles` and the settings rows) using a scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 6.2 Run the targeted `/admin` frontend tests
- [ ] 6.3 Run the full frontend suite and the backend suite with the scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 6.4 Verify the post-test database state and restore it if needed
- [ ] 6.5 Create `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` in this change folder
- [ ] 6.6 Mark this step complete only after the tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

This change adds and changes no endpoint; the check is that the Administrator endpoints the tabs call still answer as before.

- [ ] 7.1 Start the backend with a scratch `DB_PATH` and `PROJECTS_ROOT` and an `ADMIN_PASSWORD`
- [ ] 7.2 `curl` `GET /admin/access` (no password: 401 `password-required`; right password: 200) and `GET /admin/reports/provider-usage` (401 without, 200 with)
- [ ] 7.3 Record the commands and answers in `reports/YYYY-MM-DD-step-7-curl-verification.md`; confirm no data changed

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the frontend and the backend with scratch directories and some sessions and attempts
- [ ] 8.2 Open `/admin`, unlock, and walk the four tabs; check the hash after each and after a reload
- [ ] 8.3 Reports: change the period (including a custom range), check the tiles, open and close panels, scroll the wide table inside its wrapper
- [ ] 8.4 Providers: open the overflow menu, run a connection test against the stub, confirm and cancel a delete
- [ ] 8.5 Take screenshots at 1280 px and 375 px and check that nothing extends past a card (acceptance criterion of JOS-270)
- [ ] 8.6 Check keyboard use of the tabs, the segmented control, the panels and the menu
- [ ] 8.7 Restore the environment; write `reports/YYYY-MM-DD-step-8-e2e-verification.md`

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Update `docs/frontend-standards.md`: the Administrator page rows (tabs and hash), the section/accessible-name table, the overflow menu and the table style classes
- [ ] 9.2 Run `graphify update .`
- [ ] 9.3 Post the result on JOS-270
