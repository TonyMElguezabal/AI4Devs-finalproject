## Context

Telemetry records every finished provider call on `vid4you_provider_calls_total{stage, provider, outcome}` (`app-telemetry`, Provider usage metrics). It does so from two places in `backend/src/db.ts`:

- stage-attempt completion, which passes the attempt's outcome (`success`, `transient`, `not-retryable`, …) to `recordProviderCall`;
- `insertProviderRequest` → `reportProviderRequest` (`db.ts:2380`), for image and clip requests, which passes the request mode (`success`, `transient_failure`, `not_retryable_failure`, …).

`normalizeOutcome` (`backend/src/telemetry/index.ts:67`) folds those into `success`, `transient`, `not-retryable` or `other`. Three facts from the code shape this design:

1. **A timed-out attempt is never reported.** `timeOutAttempt` (`db.ts:1747`) is a plain `UPDATE … SET outcome = 'timed-out'` and calls no telemetry. The `timed-out` case in `normalizeOutcome` is reached by no caller today.
2. **The adapters lose the cause.** When `fetch` throws (time limit reached, DNS failure, connection refused or reset), each adapter returns `{ kind: "failed_transient", reason: "<text>" }`. The image adapter (`imageProvider.ts:139`) and the voice adapter (`voiceProvider.ts:84`) are examples. Only the free-text reason says the provider never answered.
3. **The dashboard depends on the old value.** The retry-rate panel in `infra/grafana/dashboards/providers.json` filters on `outcome="transient"`.

The metric reader exports every 60 s (`telemetry/index.ts:199`). Only installs with `providerUsage` consent export anything. The relay forwards only allowlisted attribute keys, and `outcome` is already one of them.

## Goals / Non-Goals

**Goals:**
- Report every provider call that got no answer as `outcome="unresponsive"`, from both recording paths, and from timed-out attempts, which are not reported today.
- Fire a critical email alert when one provider has 3 or more of these calls within 5 minutes.
- Keep the providers dashboard's numbers unchanged.
- Prove the path from the adapter to the exporter in CI.

**Non-Goals:**
- Changing retry behaviour, retry delays, time limits or any stored outcome. `stage_attempts.outcome` and `provider_requests.mode` keep their values, so the `/admin` failures report is untouched.
- Alerting on anything other than `unresponsive`. Other channels (Slack, paging).
- Marking a refused connection to the decomposition or alignment providers as `unresponsive` (D7; follow-up ticket).
- Seeing installs that declined provider-usage telemetry.
- The E14–E16 stories.

## Decisions

### D1. Mark "no answer" structurally at the adapter, not by matching the reason text
Each adapter's `catch` around `fetch` adds `unresponsive: true` to the `failed_transient` it already returns. A failed `fetch` means the provider never answered; any `Response`, whatever its status, means it did. This is the whole rule, so it can't drift from the spec.

*Alternative considered*: matching the reason text ("could not be reached", "did not answer within"). Rejected because a reworded message would silently stop the alert.

*Alternative considered*: a new stored mode `unresponsive_failure`. Rejected because it changes data that the failures report and the retry policy read, and it needs a migration for a telemetry-only need.

### D2. Carry the mark to telemetry in memory only
The mark travels with the in-memory call result to the point that records it:
- For image and clip requests, `insertProviderRequest` takes an optional `unresponsive` flag and passes it to `reportProviderRequest`.
- For stage attempts, the completion path passes it alongside the outcome.

Nothing new is written to the database. `normalizeOutcome(raw, { unresponsive })` returns `unresponsive` when the flag is set, or when `raw` is `timed-out`; otherwise it behaves as today.

Hand-off per adapter, traced in task 2.1:

| Adapter | Where its failure is recorded | Hand-off |
|---|---|---|
| fal image | `finishImageAttemptAsync` → `recordAndReleaseImageAttempt` → `insertProviderRequest` (`orchestrator.ts`) | the `ImageGenerationResult` is in scope; pass `outcome.unresponsive` |
| RunningHub video | the poll failure and the submit failure, both calling `insertProviderRequest` (`orchestrator.ts`) | the poll/submit result is in scope; pass its `unresponsive` |
| ElevenLabs voice | `finishFailure` → `recordAttemptOutcome` → `completeStageAttempt` (`voiceOverPhase.ts`, `retry/stageAttemptRecorder.ts`) | add `unresponsive` to `AttemptReport` and to `completeStageAttempt`'s outcome, read by `reportStageAttempt` |
| OpenAI reasoning, ElevenLabs alignment | through `createDecompositionFailure`, `SegmentStoredResult` and `ObtainResult` before `completeStageAttempt` | **not marked in this change** (D7) |

The `error_code` fallback isn't used: every marked path has an in-memory hand-off.

### D7. Decomposition and alignment are covered by their time limit only
Decided with the owner during apply. Carrying the mark through the decomposition failure types (`createDecompositionFailure`, `SegmentStoredResult`, `ObtainResult`) would change the decomposition phase's own failure model for a telemetry-only need. These two stages run once per session, before any scene work, and both have a stage time limit. A provider that hangs is therefore still reported as `unresponsive` through D3 (timed-out attempts). Only a connection that is refused outright, before the time limit, stays `transient` for these two stages. That gap is tracked as JOS-260 under JOS-246.

### D3. Report timed-out attempts from `timeOutAttempt`
When `timeOutAttempt` actually changes a row (`changes > 0`), it records one provider call with outcome `timed-out`. The latency is `finished_at − sent_at`, and the stage and provider are looked up the way the completion path already does. The update itself is the only place a timeout is decided, once (JOS-185 Decision 3), so the metric can't be double-counted.

A late result that arrives later becomes `late-success` or `superseded`. Neither is reported again as a provider call, so the call that got no answer in time is counted exactly once.

### D4. The alert rule: one query, per-provider threshold, any install
The query is `sum by (provider) (increase(vid4you_provider_calls_total{outcome="unresponsive", deployment_environment!="development"}[5m])) >= 3`. It is evaluated every minute with a pending period of 0, has severity label `critical`, and the stages appear in the annotation. Counting over all installs means a provider outage that hits several users fires quickly. The cost of that choice is a known false positive: one user whose own network is down. Requiring 2 or more installs was rejected, because then an outage that hits a single user would never alert.

The rule is exported as Grafana's alert-rule provisioning JSON in `infra/grafana/alerts/unresponsive-provider.json`. It references the contact point by name only. The contact point `vid4you-critical` and its email address are created by hand in Grafana Cloud. This matches the dashboards: no Grafana token in CI, and no address in the repository.

### D5. Keep the retry rate unchanged
The retry-rate panel filters on `outcome=~"transient|unresponsive"`. That is the only panel that filters on `transient`. The error-rate panel filters on `not-retryable` and is untouched.

### D6. CI test runs in-process with in-memory exporters
The per-stage time limit is a constant (`PER_PHASE_MAX_TIME_SECONDS`), and the OTLP endpoint is fixed at build time (`BUILD.telemetryEndpoint`). A spawned server can't be pointed at a fake receiver or made to time out quickly without new configuration that exists only for this test. Instead, the test:
- uses `setTelemetryExportersForTest` with the OpenTelemetry in-memory exporters;
- calls the real fal adapter with a `fetchFn` that never resolves and a short `callTimeoutMs`, through the real store's `insertProviderRequest`;
- times out a real voice-over attempt with `timeOutAttempt`.

This covers the adapter, the store and the normalisation, up to the exporter. The relay and Grafana are covered by the manual live test (tasks group 6).

## Risks / Trade-offs

- [One user's network outage fires a critical alert] → Accepted and documented in the README. The alert names the provider, so the first check is whether other installs report it too.
- [An install that declined telemetry is invisible] → Accepted; this follows from the consent design (`app-telemetry`).
- [Alert latency of 1–3 minutes from the 60 s export plus 1 minute evaluation] → Accepted for an email alert.
- [Timed-out attempts start appearing in the provider metrics, so attempt counts rise for releases that include this change] → Expected: they were missing before. Noted in the README and the release notes.
- [Grafana Cloud's OTLP-to-Prometheus translation keeps label names but has never been checked live (`infra/grafana/README.md`; report-stable-provider-name step 7 left it to the owner)] → The live alert test (tasks group 6) is the first real check of `outcome` on the stack. If the label differs there, the rule's query is fixed before archiving.
- [An adapter whose `catch` also wraps response parsing would mark a malformed answer as unresponsive] → Only the `catch` directly around `fetch(...)` sets the mark. Each adapter gets a unit test for a 503 answer that stays `transient`.

## Migration Plan

No data migration. Ship it in a normal release, then:
1. Create the contact point `vid4you-critical` in Grafana Cloud.
2. Import `alerts/unresponsive-provider.json`.
3. Re-import `providers.json`.

To roll back, delete the rule in Grafana. Older app versions never send `unresponsive`, so the rule stays silent for them.

## Open Questions

- None blocking. If the live test shows Grafana Cloud renames `outcome` or `deployment_environment`, the rule query changes. The threshold doesn't.
