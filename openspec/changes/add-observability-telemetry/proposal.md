# Add observability and telemetry to the packaged application

Linear-Issue: JOS-199

## Why

ADR 0007 (JOS-194) ships Vid4You as a local executable for macOS and Windows. Every push to `main` publishes a GitHub Release (story L7), and the app then runs on laptops we can't see. Once a release is out we have no way to tell whether it crashes, which provider is slow or failing, what a final video costs, or whether anyone has updated. The only record is the Pino output on the user's terminal, which is gone when the window closes. A user who hits a problem has nothing to attach to a bug report. Nothing tells a user that a newer build exists either, so a fix published to `main` only reaches people who check the Releases page themselves.

The product owner decided the shape on 2026-10-15:

- Telemetry is built on OpenTelemetry and stored in Grafana Cloud.
- A relay holds the ingest token, so the executable carries no secret.
- Telemetry is opt-in, with one toggle per signal.
- Monitoring is dashboards only, with no push alerts.
- A new release is announced in the app; it doesn't install itself.

## What Changes

- **Local log files.** The backend writes its structured log to rotating files in the data folder, next to the store, with no consent needed. A user can attach these files to a bug report.
- **Telemetry consent.** On first launch the page asks once, with three toggles that all start off:
  - crash and error reports;
  - provider latency and usage;
  - anonymous product usage.
  
  The choice is kept in the store, can be changed later from the page, and is exposed through `GET/PUT /telemetry/consent`. Nothing is sent and no exporter is started for a signal the user hasn't turned on.
- **Telemetry signals.** These use the OpenTelemetry JS SDK with manual instrumentation and the OTLP/HTTP exporters, all pure JavaScript and bundle-safe:
  - **Errors:** unhandled exceptions and rejections, plus every attempt that ends `not-retryable`. Each one is sent as an OTel log record carrying the stage, provider, error code, the scrubbed message and the stack.
  - **Provider usage:** emitted from the two places that record provider calls. `completeStageAttempt` covers voice-over, timestamps, decomposition and assembly; `insertProviderRequest` covers images and clips. It records attempt counts and latency per stage, provider and outcome, plus billed-unit counters (clip seconds, images, voice characters) that the dashboard turns into an estimated cost.
  - **Product usage:** counters for app started, session started, final video reached and the version running.
  
  Every signal carries the app version, channel, OS, architecture and a random install ID. Script text, titles, file paths, credentials and provider response bodies are never sent, and one shared scrubber enforces this.
- **Telemetry relay.** A Cloudflare Worker at `otel.vid4you.download` accepts OTLP/HTTP from the app without a secret. It caps payload size, rate-limits per client IP, drops any attribute not on an allowlist, and forwards the rest to Grafana Cloud with the ingest token, which is a Worker secret. The Worker is declared in the repository and deployed by a GitHub Actions workflow.
- **Dashboards as code.** Grafana dashboard JSON lives in the repository and covers:
  - release health: errors per version and adoption;
  - providers: latency, retry and error rate, estimated cost per final video;
  - usage funnel.
  
  It is imported into Grafana Cloud the same way every time.
- **Update notice.** On launch the backend asks the GitHub Releases API for the newest build on its own channel: the latest pre-release for UAT, the latest release for production. If that build differs from the running one, the page shows "A new version is available" with a download link. There's no silent update; that waits for signing (story L8).
- No change to any session, stage or retry behavior.

## Capabilities

### New Capabilities

- `app-telemetry`: local log files; the per-signal opt-in consent and its API; which signals exist, what they may and may not contain, and when they are sent; dashboards declared in the repository.
- `telemetry-relay`: the ingest endpoint the app sends to. It needs no client secret, enforces size, rate and attribute limits, keeps the backend token server-side, and is deployed from the repository.
- `update-notice`: the launch-time check for a newer build on the app's own channel and how the page presents it.

### Modified Capabilities

None. `backend-foundation`'s logging and credential rules still hold unchanged. The new specs build on them: a credential is never logged and never sent, and neither is script text.

## Impact

- **Backend:**
  - new `telemetry/` modules: consent, signals, scrubber, log files;
  - hooks in `completeStageAttempt` and `insertProviderRequest` (`backend/src/db.ts`);
  - process-level error handlers in `server.ts`;
  - migration for a `telemetry_settings` row;
  - routes `GET/PUT /telemetry/consent` and `GET /app/update`.
  
  New pure-JS dependencies from `@opentelemetry/*`.
- **Frontend:** a first-launch consent dialog, a settings entry to change it, and an update banner.
- **Infrastructure in the repository:**
  - `infra/telemetry-relay/` (Worker + `wrangler.jsonc`);
  - `infra/grafana/dashboards/*.json`;
  - `.github/workflows/telemetry-relay.yml`.
- **External systems:**
  - a Grafana Cloud stack (free tier) and its write-only access-policy token;
  - Cloudflare Workers on the existing `vid4you.download` zone;
  - GitHub repository secrets for the Cloudflare deploy token.
- **Product:** a consent prompt and a privacy note are new user-facing behavior. A PRD addendum is drafted for product-owner approval before the first release that ships it.
- **Depends on:**
  - **L3**, the Origin/Host guard. Without it, any website could call `PUT /telemetry/consent` on `127.0.0.1` and switch telemetry on, so L3 must ship before a release containing this change.
  - **L6/L7**, the build and release channels. The version, channel and release tag shown by the update notice come from the build. Until then the app reports `development` and the update check is off.
- **Risk:** the OpenTelemetry Node SDK's automatic instrumentation relies on module-loading hooks that don't work inside a single-executable bundle, so only manual instrumentation is used. The packaged build must be checked to confirm it still exports.
