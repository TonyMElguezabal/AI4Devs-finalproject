# ADR 0008 — The `/admin` reports (JOS-175)

- Status: Accepted (product-owner decision, 2026-10-22); the PRD text that puts the reports in scope is awaiting approval (see *Consequences*)
- Date: 2026-10-22
- Change: `define-admin-reports` (JOS-175, US-40)

## Context

PRD §2.3 kept usage and cost reports out of the MVP and left their contents undefined. `/admin` now has the Administrator gate (JOS-173), the provider administration (JOS-171, JOS-218) and the failed-stage tool (JOS-172), so reports are the next Administrator tool. Before writing report stories, the spike answered which reports are worth building and whether the app records what they need.

The local store records session-level stage attempts with their provider and outcome (`stage_attempts`), scene-level attempts without a provider (`provider_requests`), the scenes with their bindings, warnings and results, and the session facts. It records no money amount and no billed unit (the units go only to the opt-in telemetry), almost never an error code, no scene-stage manual retries, and no history of provider changes. The queries were run on a scratch store filled by stubbed sessions with known behaviour and compared with a call log the stubs wrote (`openspec/changes/define-admin-reports/reports/`).

## Decision

**Seven candidate reports were examined; three are agreed for the first release, three for a later release and one is dropped.** The full definitions (purpose, fields, granularity, period, data source, gaps, example) are in `openspec/changes/define-admin-reports/reports-catalogue.md`.

| Report | Decision |
|---|---|
| R1 Provider usage: attempts, outcomes, success rate, latency, billed units per stage and provider | **Release 1** |
| R3 Failures and retries: failures by stage and outcome, exhausted budgets, manual retries, failure wordings of the session-level stages | **Release 1** |
| R4 Sessions: one row per session with state, scenes, attempts and phase times, and a scene drill-down (which also shows the speed-factor and duration warnings) | **Release 1** |
| R2 Estimated cost: billed units times a price per unit, labelled an estimate, unpriced providers shown as unpriced | **Later**; needs a price per unit on provider profiles |
| R6 Pipeline time: per phase elapsed time and time-limit hits | **Later**; needs the phase start and end instants recorded |
| R7 Provider changes: an audit of active-provider changes and moves | **Later**; needs a change log |
| R5 Pacing warnings as a report | **Dropped**; its data stays in the scene details and in R4's drill-down |

Rules every report follows:

- **Period and granularity.** Aggregates take a period (presets 7 days, 30 days (default), all time, and a custom range) applied to the instant each attempt was sent; R4 uses the session's creation time. Times are shown in the computer's time zone. There is no CSV download.
- **Read-only, local and gated.** A report is a view over the local store: it writes nothing, sends nothing off the device and requires the Administrator password. It never contains an API key, a script, a prompt or instruction, narration text, or a provider's own words in a failure message.
- **Cost is an estimate.** Prices live as an optional parameter of each provider profile (price per unit and currency), edited on `/admin`. Every amount is labelled an estimate; a provider with no price is shown as unpriced, never as zero.
- **Separate from the telemetry (JOS-199).** The telemetry is anonymous, aggregated, off-device and consent-gated; the reports are local and detailed. They share vocabulary and should share the code that derives billed units.
- **Delivery shape for the stories.** Read-only aggregate endpoints under the `/admin` plugin (`GET /admin/reports/{report}` with `from` and `to`), computed on demand from SQLite, with no new table and no background job; a "Reports" section on `/admin` with a period selector.

## Alternatives considered

- **All seven reports in one release.** Rejected: R2, R6 and R7 each need something the app does not record, and R1, R3 and R4 already answer the first questions (which provider, where retries are wasted, which sessions).
- **A fixed price table in the settings files.** Rejected: prices change, differ per profile (two models of one vendor) and need a restart; JOS-218 already gives each profile editable parameters.
- **Reading the telemetry back as the report source.** Rejected: it is opt-in and off-device, so the Administrator could not rely on it.
- **A reporting table filled by a background job.** Rejected: the store is small and single-user, and a second copy of the data would have to be kept in step.

## Consequences

- Follow-up stories are written for R1, R3 and R4 and for the recording gaps they need (the provider on scene attempts, so that per-provider numbers stay exact after a provider move), and for the later reports and their recording needs (price per unit, phase instants, change log). They are in `follow-up-stories.md` and in Linear.
- The PRD change (§2.1 and §2.3: reports in scope for the release that builds them; a new section describing the agreed reports) is in `prd-addendum-draft.md`; no report story may be started before it is approved.
- Per-provider numbers of the scene stages are not exact until the provider is recorded on scene attempts: after a move, earlier failed attempts are attributed to the scene's current provider (shown on the scratch store: eight failed clip attempts counted for the provider the scene was moved to). R1 and R3 state this until the story ships.
- Open: a normalized failure class for video failures (their text can carry the provider's words), a `paused` column, and whether a CSV download is wanted later.
