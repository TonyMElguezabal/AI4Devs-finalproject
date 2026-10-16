# Design — Add observability and telemetry to the packaged application

## Context

ADR 0007 makes Vid4You a local executable, built as a Node single executable application. It runs on the user's laptop, and every push to `main` publishes it as a GitHub Release (stories L6/L7). There is no server of ours to monitor. What we can watch is:
- the pipeline, through the GitHub Actions run history;
- the copies running on users' machines, through what they report.

Product-owner answers (2026-10-15):

| Topic | Answer |
|---|---|
| Launch target | GitHub Release, per ADR 0007. No hosted instance. |
| Signals | Local log files, plus three remote signals: errors, provider usage and cost, product usage. |
| Stack | OpenTelemetry SDK → Grafana Cloud. |
| Ingest auth | A relay Worker keeps the token. The binary carries no secret. |
| Consent | Opt-in prompt on first launch, one toggle per signal. |
| Alerts | None. Dashboards only. |
| Updates | An in-app notice with a download link. No silent update. |

These facts come from the code on `feature/entrega-2-JAME` (`e7ffb645`):
- Logging is Fastify's built-in Pino logger to stdout (`server.ts:44`). Nothing is written to disk.
- Provider calls are recorded in **two** places:
  - `completeStageAttempt` (`db.ts:1306`, table `stage_attempts`), for voice-over, narration timestamps, decomposition and assembly. Its `UPDATE … WHERE outcome = 'in-flight'` already refuses a second completion.
  - `insertProviderRequest` (`db.ts:1679`, table `provider_requests`), for the image and clip stages. It has 13 call sites in `orchestrator.ts` and `provider.ts`.
- The provider for images and clips lives on the scene (`scenes.provider`, `scenes.video_provider`). The provider for voice is on the run (`runs.voice_provider_id`). The requested clip length is `scenes.requested_duration_seconds`, and the script is `runs.script`.
- `redactPaths` (`orchestrator.ts:495`) only matches POSIX paths, so it misses Windows paths.
- Backend constraints (`docs/backend-standards.md`):
  - pure-JS dependencies only;
  - erasable TypeScript only, so no enums and no parameter properties;
  - no credential and no script text in any log.
- The packaging stories L1–L9 are not implemented yet. The data folder, version, channel and release tag don't exist in the code. CORS is `origin: true` and there's no Origin/Host guard (L3).

## Goals / Non-Goals

**Goals:**
- Local rotating log files that a user can attach to a bug report.
- Opt-in, per-signal telemetry carrying no user content, sent through a relay to Grafana Cloud.
- Dashboards for release health, providers and cost, and the usage funnel, stored in the repository.
- A launch-time update notice for the app's own channel.

**Non-Goals:**
- The build and release pipeline itself. That is L6/L7: building executables, pre-release vs release, and tree-hash promotion. This change only reads the version, channel and tag that L6 bakes in.
- Push alerts (email, Slack). Product-owner decision; add Grafana alert rules later if needed.
- Distributed traces. The latency histogram answers "which provider is slow", and traces add an exporter and spans to every call. The relay already accepts `/v1/traces`, so we can add them later without changing the relay.
- Silent auto-update. That waits for signing (L8).
- Monitoring a hosted backend. There isn't one.
- Remote log shipping. Logs stay local, and only error records go out, behind the `errors` toggle.

## Decisions

### D1 — Manual OpenTelemetry instrumentation, JSON over HTTP, logs and metrics only
We use `@opentelemetry/api`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-logs`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/exporter-logs-otlp-http` and `@opentelemetry/resources`. They are all pure JS.
- **Rejected: `@opentelemetry/sdk-node` with auto-instrumentations.** It patches modules through `require`/`import` hooks, which never fire inside a single-executable bundle. It would also capture HTTP spans we don't need.
- **Rejected: protobuf encoding.** The relay has to inspect attributes (D6), and JSON lets it do so without a protobuf decoder in the Worker.

A `MeterProvider` with a `PeriodicExportingMetricReader` exports every 60 s. A `LoggerProvider` with a `BatchLogRecordProcessor` handles error records. Both are created lazily the first time any signal is on (D3), and both flush on `SIGINT`/`SIGTERM`.

### D2 — One `telemetry` module is the only door
`backend/src/telemetry/` exposes plain functions:
- `recordProviderCall({ stage, provider, outcome, latencyMs, billedUnits? })`
- `recordError({ stage?, provider?, errorCode?, message, stack? })`
- `recordProductEvent(name)`
- `getConsent()` / `setConsent()`

Each function checks the matching consent flag first and returns immediately when it's off. Call sites never touch the OpenTelemetry API directly. Tests swap the exporters for the SDK's in-memory exporters through `setTelemetryExportersForTest`, following the existing `setVoiceOverLogger` / `setAssemblyTool` seam pattern.

### D3 — Consent lives in the store; the flag is checked at record time
A migration adds a single-row table `telemetry_settings`:
- `errors`, `provider_usage` and `product_usage` as `INTEGER` 0/1;
- `answered_at`;
- `install_id`, a ULID generated in the migration using the existing `util/ulid.ts`.

We keep it in the store rather than a JSON file because the data folder (L2) doesn't exist yet. The store already follows the user's `DB_PATH` and survives upgrades, and migrations are the established pattern.

Consent is checked on each `record*` call against an in-memory copy, which `setConsent` refreshes. That makes a change apply immediately without a restart. A metric that is turned off stops getting new points. Its last cumulative value may still be exported once by the next periodic export, which is acceptable because it was collected under consent.

### D4 — Provider metrics hook into the two recording functions, not their 13+ callers
- `completeStageAttempt` becomes `UPDATE … RETURNING stage, provider_id, run_id, sent_at, finished_at`. It calls `recordProviderCall` only when a row was updated, so the existing guard also prevents double counting.
- `insertProviderRequest` calls `recordProviderCall` after its insert. It looks up the scene's provider and requested duration, and uses the latency it was given.

Outcome normalisation lives in one place: `in-flight` never reaches it; `success`/`late-success` → `success`; `transient`/`transient_failure`/`timed-out` → `transient`; `not-retryable`/`not_retryable_failure` → `not-retryable`; everything else (`superseded`, `cancelled`) → `other`. A `not-retryable` result also calls `recordError` (spec: Error reports).

Hooking `db.ts` couples persistence to telemetry, but that is two lines in two functions, against 13 call sites that would otherwise each need to remember to report. The guard that already prevents double completion is reused for free.

Billed units, counted on success only (an approximation of what providers bill):
- `video` uses `scenes.requested_duration_seconds`;
- `image` counts 1;
- `voice-over` uses `length(runs.script)`.

### D5 — Local log file: Pino multistream to a size-rotated file, written by us
`buildApp` gets a `loggerInstance`: Pino with `pino.multistream([stdout, rotatingFile])`. `pino` becomes a direct dependency; it is already installed with Fastify. The rotating file stream is about 30 lines in `telemetry/logFile.ts`:
- on each write, if the file would pass 10 MB, rename `vid4you.log.4`→`.5` … `vid4you.log`→`.1` and reopen;
- the folder is `join(dirname(DB_PATH), "logs")`, so it moves with the store when L2 lands.

**Rejected: `pino-roll` and other Pino transports.** They run in worker threads that load modules by path, which fails inside a single-executable bundle.

In tests (`NODE_ENV=test`), logging stays off as it is today.

### D6 — Relay: a Cloudflare Worker that filters JSON and forwards with Basic auth
`infra/telemetry-relay/src/index.ts`:
1. Accept only `POST` on `/v1/logs|metrics|traces`. Anything else gets `404` or `405`.
2. Accept only `content-type: application/json`, else `415`.
3. Reject a `content-length` or body over 256 KB with `413`.
4. Apply `env.RATE_LIMITER.limit({ key: clientIp })` (the Workers Rate Limiting binding, 60 requests per 60 s); over the limit gets `429`.
5. Parse the JSON and remove every resource, scope, data-point and log-record attribute whose key isn't on `ALLOWED_ATTRIBUTE_KEYS`.
6. `fetch(env.GRAFANA_OTLP_URL + path)` with `Authorization: Basic <env.GRAFANA_OTLP_AUTH>`, and return the upstream status with an empty body.

`ALLOWED_ATTRIBUTE_KEYS` is one exported constant in `infra/telemetry-relay/src/allowlist.ts`. The backend test imports the same file, so a new attribute the app sends without updating the relay fails a test instead of disappearing silently in production.

The secrets `GRAFANA_OTLP_URL` and `GRAFANA_OTLP_AUTH` are set once with `wrangler secret put`. The token is a Grafana Cloud access-policy token with only the `metrics:write`, `logs:write` and `traces:write` scopes.

Tests use Vitest calling the exported `fetch` handler with a fake `env` and a stubbed global `fetch`. That's enough for a stateless handler; `@cloudflare/vitest-pool-workers` isn't needed.

**Rejected: embedding a write-only token.** Product-owner decision: the token couldn't be rotated without a release.

**Rejected: a self-run OpenTelemetry Collector.** It needs a host.

### D7 — Relay deploy workflow
`.github/workflows/telemetry-relay.yml` runs on `push` to `main` with `paths: infra/telemetry-relay/**`, plus `workflow_dispatch`. It runs `npm ci`, `npx vitest run`, then `npx wrangler deploy` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. The route `otel.vid4you.download/*` is declared in `wrangler.jsonc` as a custom domain. This is the only workflow this change adds; the app's own build and release workflow is L7's.

### D8 — Build identity from one config module
`backend/src/config/build.ts` exports `BUILD`:
- `version`: `process.env.VID4YOU_VERSION ?? "0.0.0-dev"`;
- `channel`: `"development" | "uat" | "production"`, from `VID4YOU_CHANNEL`, any other value → `development`;
- `releaseTag`: `VID4YOU_RELEASE_TAG ?? null`;
- `repository`: `"TonyMElguezabal/AI4Devs-finalproject"`;
- `telemetryEndpoint`: `VID4YOU_TELEMETRY_ENDPOINT ?? "https://otel.vid4you.download"`.

L6's bundler replaces these at build time with esbuild `define`. Until L6 lands, everything runs as `development`. Development can still send telemetry when a developer opts in; it is labelled `deployment.environment=development`, and the dashboards filter it out by default.

### D9 — Update check in the backend, one call per launch
`telemetry/updateCheck.ts` starts at boot, without blocking `listen`, when `BUILD.channel !== "development"` and `BUILD.releaseTag` is set:
- `production`: `GET https://api.github.com/repos/<repo>/releases/latest`;
- `uat`: `GET …/releases?per_page=20`, taking the first entry with `prerelease: true`.

It uses `AbortSignal.timeout(5000)` and keeps the promise in memory. `GET /app/update` awaits it and returns the stored result.

"Newer" means the tag is different, not semver-greater, because L7 names UAT pre-releases by tree hash. A launch without network, or a rate-limited API (60 requests per hour per IP when unauthenticated, which is far above one call per launch), returns `available: false` with one local log line.

The check is done in the backend rather than the page so there's one call per launch however many tabs are open, the logic is unit-testable, and the page keeps calling only its own origin.

### D10 — Frontend: native `<dialog>` for consent, a banner for updates
- `TelemetryConsentDialog.tsx` is a native `<dialog>` opened with `showModal()` when `GET /telemetry/consent` says `answered: false`. It has three labelled checkboxes, all unchecked, a privacy sentence and a Save button.
- A "Privacy" button in `TopBar.tsx` reopens it.
- `UpdateBanner.tsx` calls `GET /app/update` once on load. It is dismissed into component state only, so it comes back on the next launch.

There is no new dependency. Labels follow the accessible-naming convention in `docs/frontend-standards.md`.

### D11 — One path scrubber, shared
`backend/src/util/redactPaths.ts` replaces both:
- POSIX paths, `/\S+` (the existing behavior);
- Windows paths, `[A-Za-z]:\\\S+` and `\\\\\S+`.

It also replaces `os.homedir()` and the user name. `orchestrator.ts` drops its local copy and imports this one, so the user-facing cause strings gain Windows redaction too. `recordError` applies it to both message and stack.

### D12 — Dashboards as committed JSON, imported manually
`infra/grafana/dashboards/{release-health,providers,usage}.json` use datasource variables (`${DS_PROMETHEUS}`, `${DS_LOKI}`), so they import into any stack. The estimated-cost panel multiplies the billed-unit counters by per-provider prices held as dashboard constant variables, and one row says the prices are estimates to be updated when providers change.

Importing is manual and documented in `infra/grafana/README.md`. Automating it, with a Grafana API token in CI, isn't worth it for three dashboards that rarely change.

### D13 — Metric names
- `vid4you_provider_calls_total{stage,provider,outcome}`
- `vid4you_provider_call_duration_ms` (histogram buckets: 1 s, 5 s, 15 s, 30 s, 60 s, 120 s, 300 s, 600 s, 1200 s)
- `vid4you_billed_units_total{stage,provider,unit}` with `unit` ∈ `clip_seconds|images|voice_characters`
- `vid4you_app_starts_total`, `vid4you_sessions_started_total`, `vid4you_final_videos_total`

Resource attributes: `service.name=vid4you`, `service.version`, `deployment.environment`, `os.type`, `host.arch`, `service.instance.id=<install_id>`. Those keys, plus the metric labels above and `error.code`, `exception.message`, `exception.stacktrace`, `stage` and `provider`, make up the full allowlist.

## Risks / Trade-offs

- **Until L3 lands, any website can call `PUT /telemetry/consent` on `127.0.0.1` and switch telemetry on.** Mitigation: L3 must ship before any release containing this change (proposal Impact). The data sent is already scrubbed, so the damage is limited to anonymous counts and scrubbed errors.
- **The single-executable bundle may break an OpenTelemetry package at runtime** (dynamic `require`, `process.versions` checks). Mitigation: no auto-instrumentation (D1), and a task builds the L6 proof-of-concept bundle (`poc/local/build.mjs`) and checks that one export reaches a local receiver.
- **The install ID as a resource attribute means one series per install.** This is fine for the free tier at MVP scale. `ponytail:` the ceiling is the series limit of Grafana Cloud's free tier; if installs grow, drop `service.instance.id` from metrics and keep it only on logs.
- **Billed units approximate cost.** Failed calls that providers still bill, and per-resolution price tiers, are not counted. The dashboard labels the value an estimate.
- **Hooking `db.ts` couples persistence to telemetry** (D4). This is accepted as two calls guarded by the existing completion check, and every `record*` function is a no-op when consent is off.
- **The rate limit is per IP.** Users behind one NAT share a bucket, but 60 requests per minute is far above one export per minute per install.
- **A malicious client can still send fake but well-formed telemetry through the relay.** The allowlist and size cap limit what it can inject. That is accepted for anonymous MVP telemetry.

## Migration Plan

1. The store migration adds `telemetry_settings` with everything off and `answered_at` NULL. Existing stores get the prompt on their next launch. Rollback: the table is ignored by older builds and dropping it is safe.
2. One-time setup:
   - create the Grafana Cloud stack and access-policy token;
   - `wrangler secret put` the two secrets;
   - add `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` to GitHub;
   - push the relay to deploy it;
   - import the dashboards.
3. A release with this change requires L3. L6/L7 make version, channel and tag real, and that turns on the update check.

## Open Questions

- **The Linear ticket.** It needs to be filed, and the branch renamed to `feature/jos-<n>-…` if the team prefers ticket-numbered branches.
- **Who owns the Grafana Cloud stack and Cloudflare deploy token** (the product owner's account?). This is needed before task group 6 can deploy.
- **The PRD addendum wording for the privacy note.** It is drafted in task group 9 for product-owner approval.
