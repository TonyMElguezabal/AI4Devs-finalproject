# Define the contents of the /admin reports

Linear-Issue: JOS-175

## Why

PRD §2.3 keeps usage and cost reports out of the MVP, and it was agreed that reports will live on `/admin` in a later release with no contents defined. `/admin` now exists (JOS-173) and holds the provider administration (JOS-171, JOS-218) and the failed-stage tool (JOS-172), so reports are the next Administrator tool. Writing report stories before knowing which reports are worth building, and whether the app records the data they need, would produce stories that cannot be built as written. This spike answers that first: which reports, what each shows, at what granularity and period, and where its data comes from, with the gaps in recorded data named.

## What Changes

- **A report catalogue** (the spike's main output): for each candidate report its purpose, fields, granularity, period, and data source, plus the questions it answers for the Administrator. The candidates are examined against what the local store records today (design Decision 2), and each is either agreed, deferred, or dropped, with a reason.
- **A data inventory with its gaps**, checked against the current code and a populated scratch store, not from memory. The known gaps: scene-level attempts (image, clip) are in `provider_requests`, which records no provider and only a `mode`; the money cost is not stored anywhere (billed units go only to the opt-in telemetry); reasoning and moderation calls have no usage record; moves between providers (JOS-172) are not logged.
- **Throwaway queries** (`poc/`) that compute each agreed report from a scratch store filled by stubbed sessions that mix successes, retries, exhausted failures and warnings, so every report is shown to be computable, or its gap is shown to be real.
- **Decisions** (design Decisions 3 to 7): granularity and period, how cost is estimated (units times a price per unit that the Administrator sets, never an invoice), that reports are read-only views over the local store behind the Administrator gate, how they relate to the opt-in telemetry (JOS-199), and the delivery shape (read-only aggregate endpoints computed on demand, a "Reports" section on `/admin`).
- **A PRD change** (§2.3 moves reports from "out of the MVP" to in scope for the release that builds them; a new section describes the agreed reports) drafted for the product owner's approval, and recorded as ADR 0008.
- **Follow-up stories** with acceptance criteria for the agreed reports and for any recording gap they need, created in Linear after the product owner reviews the list.
- **No product behaviour ships.** No code under `backend/src` or `frontend/src` changes; the queries are throwaway and live in this change's folder.

## Capabilities

### New Capabilities

- `admin-report-definitions`: the guarantees this change establishes about the reports: each agreed report is fully defined and traceable to recorded data or to a named gap, the reports are read-only and behind the Administrator gate, no report exposes a credential or script content, an estimated cost is labelled as an estimate, and the agreed set is in the PRD with a follow-up story each.

### Modified Capabilities

None. No existing spec states a requirement about reports. The `administrator-access` and `app-telemetry` specs are unchanged; the new reports sit behind the first and are separate from the second (design Decision 6).

## Impact

- **Product:** a drafted PRD update (§2.3 and a new reports section) for the product owner's approval; until it is approved the reports stay out of scope.
- **Documentation:** ADR 0008 with the decision and the catalogue; the PRD update; follow-up stories. No change to the standards documents beyond a pointer to the ADR.
- **Repository:** one worktree branch, `feature/jos-175-define-admin-reports`; the throwaway queries and the scratch-store script live under this change's folder and are not production code.
- **Code:** none. A recording gap that a report needs (for example a provider id on scene attempts) becomes a follow-up story, not a change made here.
- **Depends on** JOS-173 (the Administrator gate), JOS-166 (per-stage diagnostics) and JOS-218 (provider profiles, whose parameters can carry a price per unit); all merged.
