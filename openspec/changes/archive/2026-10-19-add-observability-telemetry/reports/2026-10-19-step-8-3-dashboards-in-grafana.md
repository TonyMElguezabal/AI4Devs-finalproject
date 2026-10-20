# Task 8.3: dashboards imported into Grafana Cloud and checked against live data

Date: 2026-10-19

## Setup
- Stack `vid4you` (Cloud Free), data sources `grafanacloud-vid4you-prom` and `grafanacloud-vid4you-logs`.
- Telemetry source: the packaged bundle (`poc/local/out/vid4you.cjs`) in stub mode (`POC_MODE=stub`, stub providers and moderator), consent all on, exporting through `https://otel.vid4you.download`. Three short projects were run. One sample error log was sent to the relay with `curl`, because the stub never fails.
- Dashboards imported from `infra/grafana/dashboards/` (Dashboards > New > Import).

## Result
| Dashboard | Panels with data | Notes |
|---|---|---|
| release health | Installs per version (1), Installs reporting (1), Error records per version, Error records by stage, Latest error records | error panels fed by the `curl` sample log (`stage=image`, version `6.5-test`) |
| usage funnel | Sessions started (2), Final videos (2), Sessions reaching a final video (100%), Daily activity, Final videos per version (2) | App starts is 0: see below |
| providers and cost | Attempts, latency percentiles (p50/p95/p99 per stage and provider), cost in range ($1.41), cost per final video ($0.70), Final videos in range (2), Billed clip seconds (10), images (2), voice characters (2831) | cost matches 10 x 0.05 + 2 x 0.03 + 2831 x 0.0003 |

Metric and label names in the queries match what arrives: `vid4you_provider_call_duration_ms_{bucket,count,sum}` (no unit-suffix renaming), `job`, `service_name`, `service_version`, `deployment_environment`, `stage`, `provider`, `unit`, `outcome`.

## Findings and changes
1. **Environment selector**: `development` is hidden by default, so a local run shows "No data" until it is selected. Documented behavior, no change.
2. **Fractional counts** (2.02): `increase()` extrapolates at the window edges. The count panels now use `decimals: 0` (`usage.json`, `providers.json`).
3. **First sample of a series is not counted**: a counter series that first appears already at its final value contributes 0 to `increase()`. App starts stayed 0 in this run, and the first project of a fresh install is under-counted. Consistent with the dashboards' "under-count real usage" note; the queries were not changed.
4. **Not exercised by the stub run**: Retry rate and Error rate panels (no transient or not-retryable outcomes) and real provider failures. The provider "unknown" for the assembly stage is the known open item.
5. Prices in the provider dashboard are still placeholders.
