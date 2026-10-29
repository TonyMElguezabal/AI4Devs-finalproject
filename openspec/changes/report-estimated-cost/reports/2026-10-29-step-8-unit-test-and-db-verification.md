# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-10-29
- Change: report-estimated-cost (JOS-227)
- Agent: Claude Opus 5.5

## Commands Executed
- `DB_PATH=<scratch>/test.sqlite PROJECTS_ROOT=<scratch>/projects npx vitest run test/counted-attempts.test.ts test/estimated-cost-report.test.ts test/estimated-cost-report-route.test.ts test/sessions-report-cost.test.ts test/sessions-report test/provider-usage test/failures-report test/admin-reports-route.test.ts test/provider-price test/provider-types` (backend, targeted, groups 2–5)
- `npx vitest run test/estimated-cost-table.test.tsx test/reports-section.test.tsx test/sessions-report.test.tsx` (frontend, targeted, group 6)
- `DB_PATH=<scratch>/test.sqlite PROJECTS_ROOT=<scratch>/projects npx vitest run` in `backend` (full), with `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY` and `RUNNINGHUB_API_KEY` unset
- `npx vitest run` in `frontend` (full)
- `npm run typecheck` and `npm run lint` in `backend` and `frontend`

There is no `backend/.secrets.json`, no settings override and no vendor key in the environment.

## Unit Test Results
- Targeted backend: all pass. New: `counted-attempts.test.ts` (4), `estimated-cost-report.test.ts` (7), `estimated-cost-report-route.test.ts` (5), `sessions-report-cost.test.ts` (4). The R1 tests (`provider-usage-*`) and the failures-report tests run unchanged and pass, so exporting and extending the shared reader did not change their numbers (design Risks).
- Targeted frontend: 52 pass. New: `estimated-cost-table.test.tsx` (5), three in `reports-section.test.tsx`, one in `sessions-report.test.tsx`.
- Full backend: 192 files passed, 5 skipped; 2561 tests passed, 10 skipped, 0 failed.
- Full frontend: 17 files, 466 tests passed, 0 failed.
- Typecheck: clean in both packages. Lint: backend clean; frontend 0 errors and the 7 `exhaustive-deps` warnings already on the base (no new effect was added; the cost request joins the existing effect of `ReportsSection`).
- Review of existing tests (task 7.1): `sessions-report-route.test.ts` pins the full row and gained `estimatedCost: []` and `excludesUnpricedProvider: false`; `reports-section.test.tsx` stub answers `/estimated-cost` and the password test expects six requests; `sessions-report.test.tsx` fixtures gained the two fields and the column lists gained "Estimated cost". No other existing test changed.

## Scenario and AC mapping (task 7.2)
| Spec scenario / AC | Test |
|---|---|
| Priced provider (AC1) | `estimated-cost-report.test.ts` "prices billed units, shows failed units unpriced…"; route "answers 200 with the period, the rows, the totals and the exclusion flag"; frontend "shows each row with units, price and an amount in its currency…", "labels every amount an estimate with its currency…" |
| Price of zero | "treats a price of zero as priced" |
| Current price is used | "uses the price stored now" |
| Empty period | "has no rows and no totals for an empty period"; frontend "shows nothing for an empty period, where the usage report already says there was no activity" |
| Provider without a price (AC2) | "leaves a provider with no price, and an id with no profile, unpriced and out of the totals"; frontend "'Unpriced'" cells |
| Attempt on a provider with no profile | same test (`no-such-profile`) |
| Total with an unpriced provider (AC2) | same test (`totalsExcludeUnpriced: true`); frontend "gives one total line per currency and the exclusion note only when flagged" |
| Two currencies | "gives one total per currency, ordered by code, and never adds currencies together" |
| Every provider priced | same test (`totalsExcludeUnpriced: false`); frontend note hidden when not flagged |
| Failed and successful clip attempts (AC4) | "prices billed units, shows failed units unpriced…" (2 failed + 1 success); "bills the same units as the provider-usage report"; `counted-attempts.test.ts` "gives failed attempts their units by the unit rule" |
| Session with priced and unpriced providers (AC3) | `sessions-report-cost.test.ts` "notes an unpriced provider of a successful attempt", "sums the priced successful attempts per currency…"; frontend "shows each session's cost per currency, labelled an estimate…" |
| Failed attempts add nothing to a session (AC3) | "sums the priced successful attempts per currency…" (two failed clips), "ignores an unpriced provider whose attempts all failed", "shows no amount when nothing priced succeeded" |
| Requested without the Administrator password (AC5) | route "is refused with 401 without the Administrator password and with a wrong one"; frontend "locks the page, once, when only the estimated-cost request is answered 401" |
| No secret and no content | route "contains no script, instruction, failure text or stored key, and changes no table" |
| Invalid period | route "answers 400 when from is not before to, or is not a date-time" |

## Coverage (task 7.3)
No coverage tool is installed or configured in either package (`@vitest/coverage-v8` is absent), so the module coverage could not be compared with the propose commit, as for `report-sessions`. Instead every exported function of `estimatedCostReport.ts` (`providerPricing`, `totalsPerCurrency`, `estimatedCostReport`, `sessionCosts`) and of the extended reader (`countedAttempts`, `countedAttemptsOfRuns`, including the empty list) has a named test above, and every branch of `EstimatedCostTable.tsx` (empty, priced, unpriced, totals, exclusion note on and off) and of the sessions cost cell (amounts, note, none) is covered.

## Database State Verification
- Pre-test baseline: default store `backend/data/` absent in this worktree; `backend/.secrets.json` absent; no settings override.
- Post-test state: `backend/data/` still absent; every run used the scratch `DB_PATH` and `PROJECTS_ROOT`.
- Restore needed: no.

## Final Status
- Step 8 status: PASS (coverage comparison not possible, recorded above)
- Blocking issues: none
