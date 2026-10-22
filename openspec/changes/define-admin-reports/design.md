## Context

What the app records today (to be re-verified against the code in task 1.2):

| Source | What it holds | Notes |
|---|---|---|
| `stage_attempts` | one row per attempt of the session-level stages (`voice-over`, `timestamps`, `decomposition`) and of `assembly`: `provider_id` (null for assembly), `outcome` (`scheduled`, `in-flight`, `success`, `transient`, `not-retryable`, `timed-out`), `attempt_trigger` (`initial`, `automatic`, `manual`), `cycle`, `sequence_in_cycle`, `queued_at`, `sent_at`, `finished_at`, `error_code`, `error_message` | the provider is the one each attempt ran on (JOS-172's move rewrites only the binding, not old rows) |
| `provider_requests` | one row per attempt of the scene-level stages: `scene_id`, `stage` (`image`, `video`), `sent_at`, `latency_ms`, `mode` (the outcome in the provider adapter's words), `attempt_number`, `resolved` | **no provider id**: the provider is the scene's binding (`scenes.provider`, `scenes.video_provider`) |
| `scenes` | status, the bound providers, `attempts`, `requested_duration_seconds`, `duration_warning`, `speed_factor`, `speed_factor_warning`, the narration interval, `last_error`; `scene_results` and `scene_video_results` give `committed_at` | |
| `runs` | `created_at`, title, language, `failure` (phase, cause, whether manual retry is offered), the three session-level bindings, `final_video_path`, `paused`; the script is stored | |
| `voice_overs`, `narration_timestamps`, `final_video_builds`, `scene_pause_edits` | narration duration and size, how timestamps were obtained, rebuilt final videos, pause edits | |
| `provider_profiles` (JOS-218) | each provider's label, adapter type and parameters | a price per unit can be a parameter |
| opt-in telemetry (JOS-199) | provider calls, durations and **billed units** (voice characters, images, clip seconds), errors | leaves the device only if the User opted in; **not stored locally** |

What it does not record: a money amount; any billed unit locally; token usage or moderation calls of the reasoning provider; a provider id on a scene's attempts; a log of the Administrator's provider moves; wall-clock durations of the scene-level stages other than the request latency.

The users are one Administrator on their own computer, with a few hundred sessions at most. There is no multi-tenant concern and no need for a data warehouse.

## Goals / Non-Goals

**Goals:**

- A catalogue of reports that is complete enough for the PRD to describe them and for stories to be written and estimated.
- For each report, evidence that it can be computed from recorded data, or a named gap with a follow-up.
- Decisions on granularity, period, cost, privacy and delivery that the stories can rely on.

**Non-Goals:**

- Building any report, endpoint or page.
- Changing what the app records. A gap becomes a follow-up story with its own migration.
- Billing-grade cost accuracy, invoices, budgets or alerts.
- Exporting data off the device (open question), and anything that sends report data to a server.
- Reports about the Users' content (scripts, prompts, narration).

## Decisions

### Decision 1 — The candidate reports, and the recommendation to be reviewed

Each candidate is evaluated for value to the Administrator (does it change a decision: which provider to use, where retries are wasted, what a session cost) and for data readiness (computable today, or needs a recording change).

| # | Report | Measures | Granularity | Data source today | Ready? |
|---|---|---|---|---|---|
| R1 | **Provider usage** | per provider and stage: attempts, successes, transient and not-retryable failures, success rate, request latency (median, 95th percentile), billed units (images, clip seconds, voice characters) | provider × stage | `stage_attempts` (session stages); `provider_requests` joined to `scenes` (scene stages) | yes, with the caveat that scene attempts take the scene's current binding |
| R2 | **Estimated cost** | R1's billed units times a price per unit | provider × stage; session | R1 and a price per unit (open question: where it lives) | needs the price |
| R3 | **Failures and retries** | per stage: failed attempts by outcome and `error_code`, retry budgets exhausted, manual retries, timeouts, the most frequent causes | stage; provider; period | `stage_attempts`; `scenes.last_error` and `provider_requests.mode` | yes |
| R4 | **Sessions** | per session: created, state and failed phase, phase durations, scenes, failed scenes, attempts, estimated cost; drill down to its scenes | session; scene | `runs`, `scenes`, `voice_overs`, `final_video_builds`, `stage_attempts`, `provider_requests` | yes (cost needs R2) |
| R5 | **Pacing warnings** | the speed factors and duration warnings of the scenes: how many scenes exceed the acceptable limit or the maximum duration, the distribution of factors | period; session | `scenes` | yes |
| R6 | **Pipeline time** | time spent per phase (voice-over, decomposition, scenes, assembly) and how many attempts hit a per-phase time limit | phase; period | timestamps on `voice_overs`, `narration_timestamps`, `scene_results`, `scene_video_results`, `final_video_builds` and `stage_attempts` | partly: scene phases have no start stamp other than the first request |
| R7 | **Provider changes** | when the active provider or a stage's binding changed, from and to | event | nothing: `active_providers` keeps only the last choice and `changed_at` | no |

Recommendation for the product owner's review: a first release of **R1, R3, R4 and R5** from today's data (units, not money), a second release that adds **R2** once a price per unit exists, **R6** once the scene phases are timestamped, and **R7** if a move log is wanted (JOS-172's open question). The review decides the final set; the stories follow the decision.

### Decision 2 — Gaps are first-class, and each has a follow-up

Each report states its data source and its gaps. The gaps that matter, and the follow-up each implies:

- **No provider on scene attempts.** `provider_requests` rows carry no provider id, so after a provider move (JOS-172) the attempts before the move are attributed to the new provider. Fix: add `provider_id` to `provider_requests` (a migration; existing rows are backfilled from the scene's binding). Needed for an exact R1 and R3 per provider.
- **No money.** Decision 4.
- **No reasoning usage.** The reasoning and moderation calls are not counted locally. R1 shows the session-level attempts of the decomposition (reasoning) stage; token-level usage is out of scope.
- **No move log.** Needed only for R7.

### Decision 3 — Granularity and period

Every report except R4 aggregates across sessions; R4 is a list of sessions with a drill-down to scenes. Aggregates take a period (`from`, `to`) applied to the instant of each attempt (`sent_at`) or, for session and scene facts, to the session's creation; presets are "last 7 days", "last 30 days" and "all time", and a custom range; the default is the last 30 days. Times are shown in the computer's time zone and stored as stored (UTC). A scene or session is never split across periods: an aggregate counts attempts, a session row shows the session's own totals.

### Decision 4 — Cost is an estimate from units and a price per unit

The app stores no amount. R2 multiplies the recorded billed units by a price per unit that the Administrator enters: the proposal is an optional parameter on each provider profile (`pricePerUnit` with a currency and the unit of its stage: image, clip second, voice character), editable on `/admin` like the other parameters. R2 labels itself an **estimate**, shows which providers have no price (and counts them as unpriced, not as zero), and says which attempts are counted: successful attempts only, because the vendors bill on success, which each vendor's documentation confirms in the follow-up story. Retries that fail are shown as units wasted at no charge, with a note that a failed call may still be billed by some vendors.

**Alternative:** a fixed price table in the settings files. Rejected as the proposal because prices change, differ per profile (two models of one vendor) and JOS-218 already gives each profile editable parameters. Open question for the product owner.

### Decision 5 — Read-only, local, behind the gate, no content

Reports are views over the local store: they write nothing and send nothing off the device. They sit behind the Administrator gate (JOS-173) like every `/admin` tool. No report shows an API key, a script, a prompt, an instruction, a path outside the project name, or an error message that a provider returned verbatim: failure causes are the application's own wording and the stored `error_code`. A session is identified by its id and title (the Administrator owns the install).

### Decision 6 — Separate from the telemetry

The opt-in telemetry (JOS-199) is anonymous, aggregated, off-device and consent-gated; the reports are local, detailed and always available to the Administrator. They share vocabulary (stages, outcomes, billed units) and should share the code that derives billed units, so the two cannot disagree, but neither depends on the other being enabled.

### Decision 7 — Delivery shape for the stories

Read-only aggregate endpoints under the `/admin` plugin (`GET /admin/reports/{report}` with `from` and `to`), computed on demand from SQLite by queries, with no new tables and no background job; the data is small. A "Reports" section on `/admin` with a period selector and one table or chart per report. The stories decide indexes if a query is slow on a large store (not expected). Cost depends on the price parameter (Decision 4).

## Risks / Trade-offs

- **An estimate read as an invoice.** → Labelled an estimate on the page and in the PRD; unpriced providers are shown as such.
- **Per-provider numbers wrong after a move.** → Decision 2's follow-up migration; until it ships, R1 and R3 note that scene attempts follow the scene's current binding.
- **A report nobody uses.** → The recommendation starts small (R1, R3, R4, R5) and the product owner picks.
- **The queries pass on stubbed data but not on a real store.** → The proof of concept also runs against any real store the product owner provides, read-only (task 4.4), and the findings are recorded.

## Migration Plan

None for this change: it ships no code and no schema change. The recording gaps are follow-up stories with their own plans.

## Open Questions

For the product owner (task 1.1): which of R1 to R7 are wanted and in which release; whether cost is wanted and where the price lives (profile parameter proposed); the default period (30 days proposed); whether a CSV download is wanted; whether a session's report should stay after the session is deleted (no deletion exists today); whether the pipeline time report (R6) justifies timestamping the scene phases; whether a provider move log (R7) is wanted.
