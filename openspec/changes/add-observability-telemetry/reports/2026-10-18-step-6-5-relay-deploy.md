# Task 6.5: relay deployed and verified in Grafana Explore

Date: 2026-10-18

## What was done
- Grafana Cloud stack `vid4you` on the Cloud Free plan (no card on file).
- Worker secrets `GRAFANA_OTLP_URL` and `GRAFANA_OTLP_AUTH` set by the product owner with `wrangler secret put`.
- `wrangler deploy` in `infra/telemetry-relay`: `vid4you-telemetry-relay` live on the custom domain `otel.vid4you.download` (2.8 KiB, `RATE_LIMITER` 60 requests/60s).

## Result
| Step | Outcome |
|---|---|
| `POST https://otel.vid4you.download/v1/metrics` with one counter `vid4you_relay_test_total{stage="image"}` | first runs: 401 (upstream Grafana rejected the stored credentials); after the auth secret was re-set: **200** |
| Grafana Explore, data source `grafanacloud-vid4you-prom`, query `vid4you_relay_test_total` | one series, value 1, labels `job="vid4you"`, `service_name="vid4you"`, `service_version="6.5-test"`, `stage="image"` |

## Notes
- The relay returns upstream status unchanged, so the 401 was diagnosed as a credential problem, not a relay bug.
- OTLP resource attributes arrive as Prometheus labels `service_name` / `service_version`, and `job` is derived from `service.name`. Task 8.3 checks the dashboards use these names.
- A token value was pasted into the session chat once; it was to be rotated after the test.
