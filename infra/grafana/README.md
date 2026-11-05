# Grafana dashboards

Three dashboards for the telemetry the Vid4You app sends through the relay (`infra/telemetry-relay`) to Grafana Cloud. They are plain JSON in this folder, so a change to a dashboard is a change to the repository.

| File | Answers |
|---|---|
| `dashboards/release-health.json` | Which versions are installed, and how many error records each version reports, by stage. |
| `dashboards/providers.json` | Attempts, retry rate, error rate and latency percentiles per stage and provider, and the estimated cost per final video. |
| `dashboards/usage.json` | App starts, sessions started and final videos (the funnel). |

Counts come only from installs whose user opted in, so they under-count real usage. Builds from `development` are hidden by default (the **Environment** selector).

## Import

1. In Grafana Cloud open **Dashboards → New → Import**, upload one JSON file.
2. Pick the data sources when asked: `DS_PROMETHEUS` is the stack's metrics data source (`grafanacloud-<stack>-prom`) and `DS_LOKI` its logs data source (`grafanacloud-<stack>-logs`). `release-health` needs both; the others need only metrics.
3. Repeat for the other files. Re-importing a file with the same `uid` replaces that dashboard.

Importing is manual on purpose: three dashboards that rarely change don't justify a Grafana API token in CI.

## Where to update the prices

The cost panels in `providers.json` multiply billed units by three constant variables. **The values committed today are placeholders, not real provider prices**; set the real ones before reading any cost number.

In Grafana: **Dashboard settings → Variables**, edit `price_clip_second`, `price_image` and `price_voice_character`. In the repository: change the `query` and `current` values of those variables in `dashboards/providers.json`, and re-import. The cost is an estimate by design: it counts successful calls only, and ignores calls that a provider still bills and per-resolution price tiers.

## Metric and label names the queries rely on

- Metrics: `vid4you_provider_calls_total{stage,provider,outcome}`, `vid4you_provider_call_duration_ms_{bucket,sum,count}`, `vid4you_billed_units_total{stage,provider,unit}`, `vid4you_app_starts_total`, `vid4you_sessions_started_total`, `vid4you_final_videos_total`.
- `provider` is one fixed name per vendor, never a model, an endpoint or an id (`report-stable-provider-name`, JOS-213): `OpenAI` (decomposition), `ElevenLabs` (voice-over and timestamps, apart by `stage`), `Fal.ai` (image), `RunningHub` (video), plus `local` (final video assembly, which calls no provider), `stub` (the offline stub providers) and `unknown` (an identifier nothing maps). Series recorded before this change keep their old values until Grafana's retention removes them; the panels group by `provider` and filter on no value, so a re-import needs no edit.
- Resource attributes appear as `job` (`service.name`), `instance` (`service.instance.id`), `deployment_environment`, and, through the `target_info` metric, `service_version`.
- Error records are logs with `service_name="vid4you"` and `detected_level="error"`; `stage`, `provider`, `error_code` and `service_version` are structured metadata.

These come from Grafana Cloud's default OTLP-to-Prometheus and OTLP-to-Loki translation and have not yet been checked against a live stack (task 8.3). If a panel is empty after import, compare the label names above with **Explore** first.
