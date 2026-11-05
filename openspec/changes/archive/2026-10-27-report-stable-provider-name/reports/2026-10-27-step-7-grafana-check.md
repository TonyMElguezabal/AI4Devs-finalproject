# Step 7 Report - Grafana check (AC5)

- Date: 2026-10-27
- Change: report-stable-provider-name (JOS-213)
- Agent: Claude

## What was checked
- `infra/grafana/dashboards/providers.json`: every query that uses `provider` groups by it (`sum by (stage, provider, ...)`, `sum by (provider)`, `histogram_quantile(... sum by (le, stage, provider) ...)`) and none filters on a provider value. Nothing in the dashboard needs editing; a re-import shows one series per vendor from the first export after this change is released.
- What the exporter sends was verified in step 6: one series per vendor, `local`, `unknown`, and no stored identifier.

## What was not checked
- The owner's Grafana Cloud stack (data source `grafanacloud-vid4you-prom`) is not reachable from this session, so the dashboards were not re-imported and the panels were not looked at live. This is left for the owner: after a build with this change has run against the stack, open the providers dashboard and confirm one series per vendor (`OpenAI`, `ElevenLabs`, `Fal.ai`, `RunningHub`, `local`).

## Outcome
- Step 7 status: PARTIAL (dashboard queries checked in the repository; live panels left for the owner)
