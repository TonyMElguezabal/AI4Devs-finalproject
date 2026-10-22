## Context

ADR 0008 and the catalogue (`openspec/changes/define-admin-reports/reports-catalogue.md`, R2) define the estimated cost as R1's billed units times a price per unit carried by each provider profile; the spike sketched it in `poc/queries.sql` (R2). This change stands on three stories that are proposed but not merged when it is written:

- **JOS-223** (`report-provider-usage`): `providerUsageReport.ts` runs one SQL select that returns one row per counted attempt in `[from, to)` (`stage`, `provider_id`, normalized `outcome`, `latency_ms`, `unit`, `units`) and aggregates in TypeScript; `adminReportRoutes.ts` holds `GET /admin/reports/provider-usage` inside the `/admin` child plugin; the frontend has `ReportsSection` and `ReportPeriodSelector`. Units are filled for successful attempts only.
- **JOS-226** (`add-provider-price-per-unit`): `parameters.pricePerUnit` (number ≥ 0) and `parameters.priceCurrency` (ISO 4217, upper-case) on `provider_profiles`, both or neither; `BILLED_UNITS` per stage in `providerTypes.ts`. No price history.
- **JOS-225** (sessions report, not proposed yet): one row per session created in the period.
- **JOS-222** (`record-attempt-provider`) makes the scene-stage attribution exact; until then R1's attribution note applies here as well.

## Goals / Non-Goals

**Goals:**
- R2 exactly as the catalogue defines it, from the same attempt rows as R1, so units in both reports always agree.
- Unpriced is visible and never silently zero; totals never mix currencies.
- A cost per session in the Sessions report.

**Non-Goals:**
- Currency conversion, a single app-wide currency, price history, vendor invoices or reconciliation, CSV, charts.
- Changing how attempts, units or prices are recorded.

## Decisions

### 1. Reuse R1's attempt-row select; extend it with failed units and the run id

The select in `providerUsageReport.ts` is exported (`selectCountedAttempts({ from, to, runIds? })`) and changed to return `units` for every counted attempt (not only successes) plus `run_id`. R1 then sums `units` where the outcome is a success, which gives the numbers it gives today; its tests pin that. `estimatedCostReport.ts` uses the same rows, so billed units are identical in both reports by construction.
*Alternative:* a second select in the cost module. Rejected: two copies of the counting rules would drift.
*Alternative:* add cost columns to the usage report. Rejected: the catalogue keeps R1 and R2 separate, and the usage table is already wide.

### 2. Price lookup in TypeScript, from the current profile

One read of `provider_profiles` (`id`, `label`, `parameters`) per request; `pricePerUnit` and `priceCurrency` are read from the parsed parameters. A row is priced when both are present; zero is priced. An id with no profile (for example the image sentinel `stub-image-provider`) is unpriced. The amount is `billedUnits × pricePerUnit` as a JS number, not rounded in the API; the frontend formats it with `Intl.NumberFormat(…, { style: "currency", currency })` and the price with up to 6 fraction digits.
*Why TypeScript, not `json_extract` in SQL as in the spike:* the parameters are validated by JOS-226's zod shape, and reusing it keeps one definition of "priced".

### 3. Response shape

```
{ from: string | null, to: string,
  sceneAttemptsFollowCurrentProvider: boolean,
  rows: [{ stage, providerId, providerLabel, unit, billedUnits, failedUnits,
           pricePerUnit: number | null, currency: string | null, estimatedCost: number | null }],
  totals: [{ currency, estimatedCost }],
  totalsExcludeUnpriced: boolean }
```

Rows follow R1's order. `totals` is ordered by currency code. `totalsExcludeUnpriced` is true when any row has `estimatedCost: null`. Query and response are zod schemas, so the route appears in the generated OpenAPI document. The period query schema is the one JOS-223 defined.

### 4. Failed units by the same unit rule

Failed units are the `units` of transient, not-retryable and timed-out rows: the script length for a failed voice attempt, the voice-over's duration for a failed alignment attempt, one request, one image, the requested clip seconds. A failed alignment attempt whose session has no voice-over duration contributes 0. They are shown, never priced.

### 5. Session cost in the Sessions report

The sessions report (JOS-225) calls `selectCountedAttempts({ runIds })` for the sessions on the page (no `sent_at` filter: a session's cost covers all its attempts) and the same pricing function, and adds to each row `estimatedCost: [{ currency, estimatedCost }]` and `excludesUnpricedProvider: boolean` (true when a successful attempt of the session ran on an unpriced provider). The sessions table shows the amounts, labelled an estimate, and the note.
*Alternative:* a separate per-session cost route. Rejected: AC3 asks for the cost in the Sessions report itself, and one request per row would be slower and wider.

### 6. Frontend

`EstimatedCostTable` is a plain `<table>` with a caption ("Estimated cost"), placed in `ReportsSection` under the usage table; the section fetches both reports for the same period. The unpriced cell reads "Unpriced"; totals sit in the table footer, one line per currency, with the exclusion note under them. The words "estimate" and the currency appear in the caption and every amount cell's accessible name.

### 7. Vendor billing rule is checked, not assumed

AC notes ask to confirm that each vendor bills successful attempts only. Task 1.3 checks the pricing pages of the vendors with an adapter (voice, alignment, reasoning, image, video) and records the result in this design; a vendor that bills failed requests is called out in the section's note rather than changing the formula, and the formula change is a follow-up.

## Risks / Trade-offs

- [JOS-225 is not proposed yet; its row shape may differ] → task 1.1 blocks this change until JOS-223, JOS-225 and JOS-226 are merged and reconciles Decision 5 with what JOS-225 built, updating this design first.
- [Changing R1's select to return failed units could change R1's numbers] → R1's own tests and the spike reference comparison run unchanged in this change.
- [Estimates use the current price] → stated in the spec; price history is its own story.
- [Scene stages attributed to the scene's current provider until JOS-222] → the same flag and note as R1.
- [Float sums such as 0.00003 × 1,234,567] → amounts are estimates and shown rounded by the currency's minor unit.

## Migration Plan

None: no schema change. Rollback is reverting the change.

## Open Questions

- Each vendor's billing rule for failed attempts (task 1.3).
- The PRD version that moves R2 into scope must be approved before code (task 1.2).
