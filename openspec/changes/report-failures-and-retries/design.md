## Context

- The Reports section of `/admin`, its period selector and the route plumbing exist (JOS-223): `backend/src/adminReportRoutes.ts` registers each report inside the `/admin` child plugin, so the Administrator gate answers 401 before any query is parsed, and `periodOf` normalizes and checks `from`/`to`. The pipeline-time report (JOS-228) was added the same way.
- `providerUsageReport.ts` reads the counted attempts of a period from two places: `stage_attempts` for voice, alignment and reasoning (sent, final outcome, a provider other than `elevenlabs-native`; `late-success` counts as success; `superseded` is not counted) and `provider_requests` for image and video (`success`, `transient_failure`, `not_retryable_failure`).
- `stage_attempts` records `cycle`, `sequence_in_cycle` (1 to `MAX_ATTEMPTS_PER_CYCLE`, today 4), `attempt_trigger` (`initial`, `automatic`, `manual`), `queued_at`, `sent_at` and `error_message`. `error_code` is almost never set (spike finding).
- Scenes record no cycle and no manual retry: a manual image or clip retry resets the scene's status in place. A failed scene is `status = 'failed'`; it failed at its image when `result IS NULL`, at its clip when `result IS NOT NULL AND video_result IS NULL` (the same tests `db.ts` uses for the retry and move paths).
- Session-level failure messages are the application's own sentences (the voice adapter deliberately does not copy the response body; the decomposition cause is built by the app). A scene's `last_error` for video can carry the provider's own words (ADR 0008, open question).
- PRD §11.4 already lists this report in the first release; no PRD change is needed.

## Goals / Non-Goals

**Goals:**
- One read-only endpoint and one table that answer the five acceptance criteria of JOS-224.
- Failure counts that agree with the usage report for the same period.

**Non-Goals:**
- Recording scene-stage cycles or manual retries (a separate recording story if wanted).
- A normalized failure class for video failures, or grouping by `error_code`.
- Per-provider failure figures (the usage report already has them).
- The assembly stage: it calls no provider and is not one of the five report stages; its failures appear in the session's own view.

## Decisions

### Decision 1 — Reuse the usage report's attempt reader for the outcome counts

Export `countedAttempts(from, to)` from `providerUsageReport.ts` and count its non-success rows per stage and outcome. Both reports then read exactly the same rows, so the spec's "same counts as the usage report" holds by construction rather than by two SQL queries kept in step.

*Alternative:* a separate SQL `GROUP BY stage, outcome`. Rejected: it duplicates the filters (native timestamps, unsent, superseded, late-success) and would drift the first time one of them changes.

### Decision 2 — Budgets, manual retries and wordings from one `stage_attempts` query

One query over `stage_attempts` for the stages `voice-over`, `timestamps`, `decomposition` in the period (by `sent_at`, or `queued_at` when the attempt was never sent, as the spike did) returns the rows needed for:

- **budgets exhausted:** `sequence_in_cycle = MAX_ATTEMPTS_PER_CYCLE` (imported from `config/providers.ts`, not a literal 4) and outcome `transient` or `timed-out`;
- **manual retries:** `attempt_trigger = 'manual'`;
- **wordings:** failed rows with a non-null `error_message`, grouped by text, top five per stage by count, ties alphabetical.

The same provider filter as Decision 1 applies (`elevenlabs-native` attempts call no provider and are left out). The stage names map with the usage report's mapping (`voice-over`→voice, `timestamps`→alignment, `decomposition`→reasoning).

### Decision 3 — Scene stages report "not recorded" as `null`

For image and video, `budgetsExhausted` and `manualRetries` are `null` in the response, and the table shows "not recorded". This follows the pipeline-time report's convention (`null` counts are "not recorded"), and avoids a zero that would read as "no retries happened".

### Decision 4 — Scene failure text is never selected

The report's queries never read `scenes.last_error`, nor any message column for image or video. AC4 is met by not reading the text at all, rather than by filtering it. A marker test puts a marker in a clip's failure text and checks it is absent from the response.

### Decision 5 — Scenes failed now ignore the period

`failedScenesNow: { image, video }` counts the scenes currently failed, across all sessions, regardless of `from`/`to`: it is a state, not an event, and scenes record no failure instant to place in a period. The table labels it "now".

### Decision 6 — Response shape

```
{ from: string | null, to: string,
  stages: [{ stage, transient, notRetryable, timedOut, budgetsExhausted: number | null, manualRetries: number | null }],
  wordings: [{ stage: "voice" | "alignment" | "reasoning", message, attempts }],
  failedScenesNow: { image: number, video: number } }
```

A stage is listed when any of its numbers is above zero. The route uses Zod for the query and a strict response schema, like the other report routes.

### Decision 7 — Frontend: a separate table component, loaded with the other reports

`ReportsSection.tsx` gets a third request in the same effect (one 401 locks the page once, like the existing two) and its own error state, cleared in `changePeriod`. The table goes in a new `FailuresTables.tsx`, as `PipelineTimeTables.tsx` does, to keep `ReportsSection` short.

## Risks / Trade-offs

- [A session-level message embeds session-specific values (a number, a duration), so near-identical wordings count separately] → Accepted; the top five still shows the dominant causes. A normalized failure class is a later story.
- [A session-level message could someday carry provider text] → The rule is in the spec and ADR 0008; the marker test covers the scene side. If an adapter starts copying response bodies, the wordings must be dropped or normalized for that stage.
- [`countedAttempts` reads all rows of the period into memory] → Same `ponytail:` ceiling as the usage report; move to SQL aggregation if "all time" becomes slow.
- [Scene-stage retries are invisible] → Stated as "not recorded" in the table; the failed-now count gives the current backlog.

## Migration Plan

No migration and no new table. Rollback is reverting the route and the table.

## Open Questions

None.
