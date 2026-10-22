# Follow-up stories: the /admin reports (JOS-175)

All stories sit under the E11 epic (JOS-169), are post-MVP, assigned to the product owner's account, and depend on the PRD change of `prd-addendum-draft.md` being approved. Definitions of the reports are in `reports-catalogue.md`; the decisions are in ADR 0008. Estimates are relative (S, M, L).

## Release 1

### F1 — Record the provider on scene attempts (S) [JOS-222]

> As an Administrator, I want each image and clip attempt to record the provider it ran on, so that the per-provider reports stay exact after a provider change or move.

1. **Given** a scene whose image or clip attempt is sent, **When** the attempt is recorded, **Then** the provider the attempt ran on is stored with it.
2. **Given** a database from before this change, **When** the application starts, **Then** every existing attempt row is given the scene's bound provider for its stage (image or clip), and nothing else changes.
3. **Given** a scene moved to another provider (JOS-172), **When** the earlier and the later attempts are read, **Then** each shows the provider it ran on.
4. **Given** the existing diagnostics and telemetry, **When** they read an attempt, **Then** they behave as before.

Data: `provider_requests` gets a `provider_id` column (a migration with the backfill). Dependencies: none. Unblocks F2 and F3 exactness.

### F2 — Provider usage report on /admin (L) [JOS-223]

> As an Administrator, I want a provider-usage report on `/admin`, so that I can see which provider is reliable and fast for each stage.

1. **Given** sessions with attempts in the last 30 days, **When** the Administrator opens "Reports" and the usage report, **Then** it lists each stage and provider with attempts, successes, transient and not-retryable failures, timed-out attempts, success rate, median and 95th-percentile latency, and billed units with their unit.
2. **Given** the period selector (7 days, 30 days by default, all time, custom range), **When** the period changes, **Then** only attempts sent in it are counted.
3. **Given** a provider with no attempt in the period, **When** the report is shown, **Then** it is not listed.
4. **Given** native timestamps were used, **When** the report is shown, **Then** those attempts are not counted as an alignment provider call.
5. **Given** a person without the Administrator password, **When** they request the report, **Then** it is refused.
6. **Given** the report, **When** it is read, **Then** it contains no key, script, prompt, instruction or provider text.
7. **Given** F1 is not yet built, **When** the report shows image or clip rows, **Then** it says that attempts follow the scene's current provider.

Data: `stage_attempts`, `provider_requests`, `scenes`, `runs`, `voice_overs` (queries in `poc/queries.sql`). Endpoint `GET /admin/reports/provider-usage?from&to`; the "Reports" section and its period selector are built here and reused by F3, F4. Dependencies: JOS-173; F1 for exact scene-stage rows.

### F3 — Failures and retries report on /admin (M) [JOS-224]

> As an Administrator, I want a failures report, so that I can see where retries are wasted and which stages fail most.

1. **Given** failed attempts in the period, **When** the report is shown, **Then** it lists per stage the failed attempts by outcome.
2. **Given** session-level stages, **When** the report is shown, **Then** it lists the retry budgets exhausted, the manual retries and the most frequent failure wordings with their counts.
3. **Given** scenes that are failed now, **When** the report is shown, **Then** it counts them by failed stage (image or clip).
4. **Given** a video failure whose text carries the provider's own words, **When** the report is shown, **Then** that text is not shown.
5. **Given** a person without the Administrator password, **When** they request it, **Then** it is refused.

Data: `stage_attempts`, `provider_requests`, `scenes`. Dependencies: F2 (the Reports section and period selector); F1 for exact per-provider attribution.

### F4 — Sessions report on /admin (M) [JOS-225]

> As an Administrator, I want a list of sessions with their state and cost drivers, and a drill-down to a session's scenes, so that I can find the sessions that failed or took long.

1. **Given** sessions created in the period, **When** the report is shown, **Then** each has its title, creation time, state (final video ready, failed in a phase, in progress), whether it is paused, scenes, failed scenes, attempts, seconds to the voice-over and seconds to the final video.
2. **Given** a session, **When** the Administrator opens its drill-down, **Then** each scene shows its status, image and clip providers, image and clip attempts, requested duration, speed factor, duration warning and speed-factor warning.
3. **Given** a session that failed before producing scenes, **When** the report is shown, **Then** it appears with its failed phase and no phase times.
4. **Given** a person without the Administrator password, **When** they request it, **Then** it is refused.
5. **Given** the report, **When** it is read, **Then** it shows no script, prompt, instruction or narration text.

Data: `runs`, `scenes`, `stage_attempts`, `provider_requests`, `voice_overs`. Dependencies: F2 (the Reports section).

## Later release

### F5 — Price per unit on provider profiles (S) [JOS-226]

> As an Administrator, I want to enter a price per unit and a currency on each provider, so that the cost report can estimate what a session cost.

1. **Given** a provider profile, **When** the Administrator edits it, **Then** an optional price per unit and a currency can be entered, validated (a non-negative number, a known currency code), and saved with the other parameters.
2. **Given** a profile with no price, **When** it is read, **Then** it is unpriced, and nothing else changes.
3. **Given** the unit of the profile's stage (voice character, audio second, request, image, clip second), **When** the form is shown, **Then** it names that unit.

Dependencies: JOS-218.

### F6 — Estimated cost report on /admin (M) [JOS-227]

> As an Administrator, I want an estimated cost per provider and per session, so that I can see what the work cost.

1. **Given** providers with a price, **When** the cost report is shown, **Then** each amount is billed units times the price, labelled an estimate, with its currency.
2. **Given** a provider with no price, **When** the report is shown, **Then** it is shown as unpriced and is not added to a total as zero; a total says it excludes unpriced providers.
3. **Given** a session in the Sessions report, **When** its cost is shown, **Then** it sums its priced attempts and notes any unpriced provider.
4. **Given** failed attempts, **When** the report is shown, **Then** only successful attempts are billed, and the failed units are shown separately.
5. **Given** a person without the Administrator password, **When** they request it, **Then** it is refused.

Dependencies: F2, F4, F5; confirm each vendor's billing rule (successful attempts only) before shipping.

### F7 — Record the phase instants and report the pipeline time (L) [JOS-228]

> As an Administrator, I want to see how long each phase takes and how often a time limit hit, so that I can tune the limits.

1. **Given** a session, **When** a phase starts and ends, **Then** its start and end instants are recorded (decomposition, scenes, and the existing voice-over and assembly).
2. **Given** existing sessions, **When** the report is shown, **Then** a phase with no recorded instant shows no time instead of an estimate.
3. **Given** the period, **When** the pipeline-time report is shown, **Then** it gives per phase the elapsed seconds (per session and aggregated) and the attempts that timed out, finished late or were superseded.
4. **Given** a person without the Administrator password, **When** they request it, **Then** it is refused.

Data: a migration for the instants. Dependencies: F2.

### F8 — Record provider changes and report them (M) [JOS-229]

> As an Administrator, I want a log of provider changes, so that I can see when the active provider changed and when a failed stage was moved.

1. **Given** the Administrator changes a stage's active provider, **When** it is saved, **Then** a log entry records the time, stage, previous provider and new provider.
2. **Given** the Administrator moves a failed stage (JOS-172), **When** it is moved, **Then** a log entry records the time, session, stage, scene if any, the previous and the new provider.
3. **Given** the log, **When** the report is shown, **Then** it lists the entries in the period, newest first.
4. **Given** a person without the Administrator password, **When** they request it, **Then** it is refused.

Data: a new log table. Dependencies: JOS-171, JOS-172, F2.
