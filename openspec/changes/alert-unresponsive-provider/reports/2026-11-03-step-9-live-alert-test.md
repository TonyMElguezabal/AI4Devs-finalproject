# Step 9 Report - Live Grafana Alert Test

- Date: 2026-11-03
- Change: alert-unresponsive-provider (JOS-246: JOS-258, JOS-259)
- Agent: Claude (Opus 5.5), with the owner in Grafana Cloud (stack `vid4you`)
- Commit: `03459c81`

## Setup (task 9.2, by the owner)
- Contact point `vid4you-critical` (email) created in Grafana Cloud. The address is not in the repository.
- Rule imported with the README `sed` + `curl` command into folder `fjt7jw`, group `vid4you-critical`, evaluation interval 1 m. Contact point shown on the rule: `vid4you-critical`.
- The first import used data source `grafanacloud-usage` (also of type Prometheus, but it holds the stack's billing metrics). It was re-sent with `PUT` and `grafanacloud-prom`, with the header `X-Disable-Provenance: true` so the group interval could be edited in the UI. The README now names the right data source and the header.
- `providers.json` re-imported. The token was deleted afterwards.

## Run 1: `USE_STUB_VOICE_PROVIDER=hang` (18:47–18:52)
Real server on a scratch store, projects folder, key and settings (`{"maxTimeSeconds":{"voice":3}}`), `VID4YOU_CHANNEL=uat`, default endpoint `https://otel.vid4you.download`, consent on through `PUT /telemetry/consent`, retry delays 1 s. Four sessions, about 70 s apart.
- Only session 1 ran. Its 4 voice-over attempts timed out by 18:47:24. Sessions 2–4 stayed `scheduled`: the `hang` stub never settles, so it keeps its voice-over slot after the timeout. This is a limit of the stub only; the real adapters abort their request at the call time limit.
- Explore shows the series at a flat 4 from its first export. **The alert did not fire**: Grafana Cloud stores the series from its first value (4) without a zero before it, so `increase()` sees no rise. Recorded in design.md (Risks) and the README limits.

## Run 2: `USE_STUB_VOICE_PROVIDER=success-after-limit` (18:53–18:59)
Same setup; the stub answers 2 s after the 3 s limit, so every attempt is first marked `timed-out` and its slot is then freed. 16 sessions, one every 15 s.
- Each session had 2 attempts that timed out (attempt 1 then `late-success`, attempt 2 then `superseded`) and attempt 3 `success`: 32 unresponsive calls between 18:54:01 and 18:57:52.
- Explore, `vid4you_provider_calls_total{outcome="unresponsive", deployment_environment="uat"}`: the series rises from 4 to 32. Series labels: `instance` and `service_instance_id` (one per app process).
- Rule: **Firing** for `{provider="stub", stage="voice-over"}`; reduce B = 29.2 at the evaluation shown, threshold C = 1. Data source `grafanacloud-vid4you-prom`, interval 1 m, pending 0 s, label `severity=critical`.
- **Email received** by the owner.
- The server log has no export error, and the session script appears in it nowhere.

## Labels (task 9.4)
`outcome` and `deployment_environment` exist under these names (the `deployment_environment="uat"` query returns the series; equality on `outcome` matched). No rule change needed. The README note "not yet checked against a live stack" is updated for the metric labels; the Loki names remain unchecked.

## Resolve
Expected about 5 minutes after the last call (18:57:52), when the 5-minute window no longer holds 3 calls. Confirmed by the owner: see Outcome.

## Cleanup
- Both servers stopped; port 3199 is free. The scratch store, projects folder, settings and key are deleted.
- No temporary rule copy was used.

## Outcome
- Step 9 status: PASS for fire, routing, email and labels; resolve: pending the owner's confirmation
- Finding: calls before an install's first export are not counted (run 1); accepted for this change, follow-up to be decided by the owner
