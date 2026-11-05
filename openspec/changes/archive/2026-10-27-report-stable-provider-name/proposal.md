## Why

The `provider` label of the telemetry metrics and error records carries whatever identifier the attempt stored: an endpoint path for clips, a model name for images, an internal attempt id for decomposition, two different ids for the one vendor ElevenLabs, and `unknown` for assembly (JOS-213, found in the JOS-203 Grafana check). Since JOS-218 a provider added on `/admin` stores a generated ULID, which would also reach Grafana as-is. Dashboards that group by `provider` cannot be read per vendor without translating identifiers.

## What Changes

- Telemetry reports `provider` as one fixed vendor name per vendor: `OpenAI`, `ElevenLabs`, `Fal.ai`, `RunningHub`, from a code-defined table keyed by the profile's adapter type. Voice-over and timestamps share `ElevenLabs` and stay apart by `stage`.
- The local assembly stage, which has no provider, reports `local` instead of `unknown`. Stub providers report `stub`.
- An identifier with no profile and no fixed entry reports `unknown`; no stored identifier, endpoint path, ULID or admin-typed label is ever sent.
- The vendor name does not follow the admin-editable profile label that the diagnostics screen shows. This is a deliberate departure from the ticket's AC1 wording: the label is free text a person types, so it is neither stable nor fixed content.
- No new attribute key; the relay allowlist and the Grafana panels stay as they are. The panels group by `provider` and filter on no value, so a re-import shows one series per vendor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-telemetry`: adds a requirement that the `provider` label is a fixed vendor name, `local`, `stub` or `unknown`, never a stored identifier.

## Impact

- Backend: `backend/src/db.ts` (`reportStageAttempt`, `reportProviderRequest`), `backend/src/providerTypes.ts` (vendor per adapter type), `backend/test/telemetry-hooks.test.ts`.
- Grafana: `infra/grafana/dashboards/providers.json` unchanged; old series stay until retention ends, nothing to migrate. `infra/grafana/README.md` lists the label values.
- Relay allowlist, API contract and data model: unchanged.
- Linear: JOS-213 (`post-MVP`, `Improvement`), related to JOS-199, JOS-203, JOS-212.
