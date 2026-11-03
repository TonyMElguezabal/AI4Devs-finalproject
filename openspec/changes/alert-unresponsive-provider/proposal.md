## Why

When a provider API stops responding in the middle of a run, nobody is told: the app retries, the sessions of every user on that provider stall, and the Developer finds out from a complaint. Grafana can't tell either, because telemetry reports a provider that does not answer with the same `transient` outcome as an ordinary retryable error (`normalizeOutcome`, `backend/src/telemetry/index.ts:67`). This is JOS-246 (EPIC E17): JOS-257, JOS-258 and JOS-259.

## What Changes

- Provider calls that time out or can't reach the provider are reported to telemetry with a new normalised outcome, `unresponsive`, apart from `transient`. A provider that answers with a retryable HTTP error (e.g. 503) stays `transient`. The application's own retry behaviour is unchanged: only the reported outcome changes.
- The `providers.json` retry-rate panel, which filters on `outcome="transient"`, counts `unresponsive` too, so it shows the same totals as before.
- A new Grafana alert rule, stored as a file in `infra/grafana/alerts/`, fires as **critical** when one provider records 3 or more `unresponsive` calls within 5 minutes. It is routed to the contact point `vid4you-critical`, which emails the Developer. The email address is configured only in Grafana Cloud and is never committed.
- `infra/grafana/README.md` explains how to import the rule and create the contact point, by hand like the dashboards.
- A CI test checks that a stub provider that hangs produces an `unresponsive` provider-call metric at a fake OTLP receiver. A manual test on the live stack fires the alert once and confirms the email arrives, recorded in `reports/`.

## Capabilities

### New Capabilities
- `unresponsive-provider-alert`: the critical alert rule, its threshold and routing, where the rule and the contact point live, and how the alert is verified.

### Modified Capabilities
- `app-telemetry`: the **Provider usage metrics** requirement normalises `outcome` to `success`, `transient`, `unresponsive`, `not-retryable` or `other` (adds `unresponsive`). The **Dashboards declared in the repository** requirement is unchanged in wording, but the providers dashboard's retry rate now includes `unresponsive`.

## Impact

- **Backend**: `backend/src/telemetry/index.ts` (`normalizeOutcome` and its callers); the provider adapters that catch a network failure or a timeout (`imageProvider.ts`, `videoProvider.ts`, `voiceProvider.ts`, `visualInstructions.ts`, `alignmentProvider.ts`) mark that failure as unresponsive; the two places in `db.ts` that call `recordProviderCall` pass the mark on. No migration, no new route, no new attribute key.
- **Infra**: `infra/grafana/dashboards/providers.json` (one query), a new `infra/grafana/alerts/unresponsive-provider.json`, `infra/grafana/README.md`. The relay allowlist (`infra/telemetry-relay/src/allowlist.ts`) already holds `outcome`; no relay change.
- **Tests**: `backend/test` unit tests for the normalisation and the adapters, and one contract test against a fake OTLP receiver.
- **Limits, accepted**: only installs that opted in to provider-usage telemetry are seen; with the 60 s metric export the alert fires about 1–3 minutes after the API stops responding; one user losing their own network looks like a provider outage and can fire the alert.
- **Out of scope**: the other E14–E16 stories (JOS-247 to JOS-256), alerting on any outcome other than `unresponsive`, paging channels other than email.
