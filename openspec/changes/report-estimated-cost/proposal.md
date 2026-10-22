## Why

The Administrator can see how much work each provider billed (provider-usage report, JOS-223) and can enter a price per unit on each provider profile (JOS-226), but cannot see what that work cost. The JOS-175 spike agreed an estimated-cost report (catalogue R2, ADR 0008) for a later release once prices exist. This is JOS-227 (follow-up F6).

## What Changes

- New read-only endpoint `GET /admin/reports/estimated-cost?from&to`, behind the Administrator password, computed on demand from the local store with the same period rule as the other reports. One row per stage and provider with: billed units and their unit, failed units (the units of failed attempts, not billed), the price per unit and currency, and the estimated cost, or **unpriced**.
- Estimated cost = billed units (successful attempts only) × the profile's current price per unit. A provider with no price is unpriced: it has no amount and adds nothing to any total. Zero is a price, not unpriced.
- Totals are given per currency. A total says it excludes unpriced providers when the period has one.
- The Sessions report (JOS-225) gains an estimated-cost column per session: the sum of the session's priced successful attempts per currency, and a note when one of its providers is unpriced.
- Every amount is labelled an estimate and shown with its currency. The report contains no key, script, prompt, instruction, narration text or provider failure text.
- PRD: the next version moves R2 from "later" into scope and describes it, **awaiting the product owner's approval**.

## Capabilities

### New Capabilities
- `estimated-cost-report`: the estimated-cost report on `/admin` (per stage and provider, per-currency totals, unpriced providers, failed units) and the estimated cost per session in the Sessions report.

### Modified Capabilities

None on the base. The `admin-reports` rules (read-only, gated, no content, period) introduced by JOS-223 apply to this report unchanged; the Sessions report requirement (JOS-225) is extended by an added requirement in `estimated-cost-report` rather than modified, since neither is archived yet.

## Impact

- **Backend**: new `estimatedCostReport.ts`; one route added to `adminReportRoutes.ts` (JOS-223); the attempt-row select of `providerUsageReport.ts` returns units for failed attempts too and the run id; the sessions report (JOS-225) adds the per-session cost. Reads the price from `provider_profiles.parameters` and the unit from `BILLED_UNITS` (JOS-226). No migration, no new table, no background job.
- **Frontend**: new `EstimatedCostTable` in the Reports section, sharing its period selector; a cost column in the sessions table; one client call in `api/client.ts`.
- **API**: one new route and a changed sessions-report row in `docs/api-spec.yml` and the generated OpenAPI document.
- **Docs**: `docs/PRD.md`, `docs/api-spec.yml`, `docs/frontend-standards.md`, the readme/development guide `/admin` section.
- **Depends on** JOS-223 (usage report), JOS-225 (sessions report) and JOS-226 (price per unit) being merged; JOS-222 makes the per-provider amounts of the scene stages exact.
- **Out of scope**: currency conversion, price history, vendor invoices, CSV download.
