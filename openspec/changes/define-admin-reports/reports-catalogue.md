# Report catalogue: the `/admin` reports (JOS-175)

Status: reviewed with the product owner on 2026-10-22 (release split below). Evidence: `reports/2026-10-22-step-3-queries.md`; the queries are in `poc/queries.sql`.

## Conventions

- **Period.** Every aggregate report takes a period `[from, to)`: presets "last 7 days", "last 30 days" (the default), "all time", and a custom range. It applies to the instant each attempt was sent (`sent_at`); a session's own facts (R4) use its creation time. Times are shown in the computer's time zone.
- **Units.** Billed units are recorded per successful attempt: `voice_characters` (the script's length), `audio_seconds` (the narration's duration, for forced alignment), `images` (1), `clip_seconds` (the requested duration), `requests` (1, for reasoning). Reasoning tokens are not recorded.
- **Providers and stages** are named by their provider-profile label (JOS-218) and the stage names voice, alignment, reasoning, image, video.
- **Read-only, behind the Administrator password, no secrets and no content:** a report never shows a key, a script, a prompt, an instruction, narration text or a provider's own words (design Decision 5).

## Release 1 (agreed)

### R1 Provider usage

- **Purpose, and the decision it supports:** which provider to use for each stage, and whether a provider is reliable and fast enough.
- **Fields (one row per stage and provider):** attempts; successes; transient failures; not-retryable failures; timed-out attempts; success rate; median and 95th-percentile request latency; billed units and their unit.
- **Granularity:** stage × provider. **Period:** as above.
- **Data source:** `stage_attempts` for voice (`voice-over`), alignment (`timestamps`, excluding attempts that used the voice provider's native timestamps) and reasoning (`decomposition`): `provider_id`, `outcome`, `sent_at`, `finished_at`, plus `runs.script` and `voice_overs.duration_seconds` for units. `provider_requests` joined to `scenes` for image and video: `mode`, `latency_ms`, `sent_at`, plus `scenes.provider` / `scenes.video_provider` and `requested_duration_seconds`.
- **Gap:** scene attempts carry no provider id, so after a provider move they follow the scene's current binding. Needs the follow-up "record the provider on scene attempts" (backfill from the binding) for exact numbers.
- **Example row:** `video | stub-b | 12 attempts | 4 successes | 8 transient | 0 | 0 | 33.3 % | 20 ms | 46 ms | 34 clip_seconds` (the 8 transient attempts ran on another provider: the gap above).

### R3 Failures and retries

- **Purpose:** where retries are wasted and which stages fail most.
- **Fields (per stage):** failed attempts by outcome (transient, not-retryable, timed-out); retry budgets exhausted; manual retries; for the session-level stages, the most frequent failure wordings (the application's own sentences) with their counts; scenes currently failed by stage.
- **Granularity:** stage; the failure wordings per stage. **Period:** as above (the "currently failed" count is a state, not a period).
- **Data source:** the same attempt rows as R1 for outcomes; `stage_attempts` (`sequence_in_cycle`, `attempt_trigger`, `error_message`) for budgets, manual retries and wordings; `scenes.status` and `result` for the failed scenes.
- **Gaps:** `error_code` is almost never set, so there is no grouping by code; scene-stage manual retries and exhausted cycles are not recorded (only scenes failed now); a video failure's text can carry the provider's own words, so scene-stage wordings are not shown (a story may add a normalized failure class); provider attribution as in R1.
- **Example row:** `voice | transient 5 | not-retryable 1 | budgets exhausted 1 | manual retries 1 | "the voice provider answered HTTP 503" ×5`.

### R4 Sessions

- **Purpose:** find the sessions that cost the most, failed, or took long, and open one to see its scenes.
- **Fields (one row per session created in the period):** id, title, created, state (final video ready, failed in a phase, or in progress; paused as a flag), scenes, failed scenes, attempts, seconds to the voice-over, seconds to the final video. **Drill-down (one row per scene):** number, status, image and clip providers, image and clip attempts, requested duration, speed factor, duration warning, speed-factor warning.
- **Granularity:** session; scene. **Period:** the session's creation time.
- **Data source:** `runs` (`created_at`, `title`, `failure`), `scenes`, `stage_attempts` (assembly success `finished_at`, session-level attempt counts), `provider_requests` (scene attempt counts), `voice_overs.completed_at`.
- **Gaps:** none for the fields above; the estimated cost per session joins this list once R2 exists.
- **Example row:** `S6 clip exhausted… | 2026-10-17 | final video ready | 2 scenes | 0 failed | 15 attempts | 0.1 s | 18.1 s`.
- The speed-factor and duration warnings (the dropped R5) appear in the scene drill-down at no extra cost.

## Later release (agreed, each needs new recording)

### R2 Estimated cost

- **Purpose:** what a session or a provider cost, as an **estimate** (never an invoice).
- **Fields:** per stage and provider: billed units, price per unit, estimated cost (or **unpriced**, never zero); per session: the sum of its priced attempts and a note when a provider in it is unpriced.
- **Granularity:** stage × provider; session. **Period:** as above.
- **Data source:** R1's billed units times `pricePerUnit` (and a currency), an optional parameter of each provider profile edited on `/admin`.
- **Gaps:** the price parameter does not exist (follow-up: "price per unit on provider profiles"); billed units count successful attempts only, to be confirmed per vendor.

### R6 Pipeline time

- **Purpose:** where the time goes (voice-over, decomposition, scenes, assembly) and how often a time limit hit.
- **Fields:** per phase and per session or in aggregate: elapsed seconds; attempts that timed out, finished late or were superseded.
- **Data source:** `runs.created_at`, `voice_overs.completed_at`, `narration_timestamps.obtained_at`, `scene_video_results.committed_at`, assembly attempts; `stage_attempts.outcome`.
- **Gaps:** the decomposition and scene phases have no start stamp of their own (the scratch query approximates them from the first image request); needs the phase start and end instants to be recorded (follow-up).

### R7 Provider changes

- **Purpose:** an audit of when the active provider and the stage bindings changed.
- **Fields:** time, stage, from, to, kind (active provider changed, or a failed stage moved).
- **Data source:** none today: `active_providers` keeps only the last choice.
- **Gaps:** needs a change log written by the active-provider change and by the failed-stage move (follow-up).

## Dropped

- **R5 Pacing warnings** (speed factors and duration warnings as a report): not selected by the product owner; the data stays in the scene details and in R4's drill-down.
