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

## Alert: provider stopped responding

`alerts/unresponsive-provider.json` is one critical alert rule (alert-unresponsive-provider, JOS-258). It fires when one provider and stage record **3 or more calls that got no answer within 5 minutes**, summed over every install. A call that got no answer is one that timed out, or could not reach the provider at all (`outcome="unresponsive"`). Builds from `development` don't count.

It is created by hand, once, like the dashboards:

1. In Grafana Cloud open **Alerting → Contact points → Add contact point**. Name it exactly `vid4you-critical`, choose **Email** and enter the address that should receive the alert. The address is set only there and is never committed.
2. Collect the values the command needs:
   - the folder UID: open the folder under **Dashboards**; the UID follows `/f/` in the URL;
   - the Prometheus data source UID: the stack's own data source, `grafanacloud-<stack>-prom` (UID usually `grafanacloud-prom`). Do not pick `grafanacloud-usage`: it is also of type Prometheus, but holds the stack's billing metrics, so the rule would never see data. `GET /api/datasources` lists both;
   - a short-lived service-account token with the Editor role.
3. Send the rule, filling in the two placeholders:
   ```bash
   sed -e "s/\${FOLDER_UID}/<folder uid>/" -e "s/\${DS_PROMETHEUS}/<prometheus data source uid>/" alerts/unresponsive-provider.json \
     | curl -sS -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
         -H "X-Disable-Provenance: true" \
         --data @- "https://<stack>.grafana.net/api/v1/provisioning/alert-rules"; echo
   ```
   Then set the `vid4you-critical` rule group's evaluation interval to 1 minute (**Alerting → Alert rules → edit group**). Without the `X-Disable-Provenance` header the rule is locked in the UI and the interval can't be edited there. Delete the token.

To change the rule, edit the file and send it again, same command, with `PUT` to `/api/v1/provisioning/alert-rules/vid4you-unresponsive-provider`. `backend/test/grafana-alert-rule.test.ts` checks the query, threshold, severity and routing against the spec.

Limits, by design:
- Only installs with provider-usage telemetry on are seen.
- The alert fires about 1–3 minutes after the provider stops responding: metrics are exported every 60 s, and the rule is evaluated every minute.
- One user losing their own network looks like a provider outage and can fire it. Check on the providers dashboard whether more than one install reports it.
- Calls made before an install's first export of the series are not counted. Each running app is its own series (`instance`), and Grafana Cloud does not count the value a series starts with: if an app's only calls without an answer all fall within its first 60 s export window, `increase()` sees no rise. A provider that stays down keeps producing calls through the retries, and those are counted.
- A refused connection to OpenAI (decomposition) or ElevenLabs alignment is still counted as `transient`. Only their timeouts count (JOS-260).

Since this change, timed-out attempts appear in the provider metrics; they were not reported before. The retry-rate panel counts `transient` and `unresponsive` together, so it shows the same rate as before.

## Where to update the prices

The cost panels in `providers.json` multiply billed units by three constant variables. **The values committed today are placeholders, not real provider prices**; set the real ones before reading any cost number.

In Grafana: **Dashboard settings → Variables**, edit `price_clip_second`, `price_image` and `price_voice_character`. In the repository: change the `query` and `current` values of those variables in `dashboards/providers.json`, and re-import. The cost is an estimate by design: it counts successful calls only, and ignores calls that a provider still bills and per-resolution price tiers.

## Metric and label names the queries rely on

- Metrics: `vid4you_provider_calls_total{stage,provider,outcome}` (`outcome` is `success`, `transient`, `unresponsive`, `not-retryable` or `other`), `vid4you_provider_call_duration_ms_{bucket,sum,count}`, `vid4you_billed_units_total{stage,provider,unit}`, `vid4you_app_starts_total`, `vid4you_sessions_started_total`, `vid4you_final_videos_total`.
- `provider` is one fixed name per vendor, never a model, an endpoint or an id (`report-stable-provider-name`, JOS-213): `OpenAI` (decomposition), `ElevenLabs` (voice-over and timestamps, apart by `stage`), `Fal.ai` (image), `RunningHub` (video), plus `local` (final video assembly, which calls no provider), `stub` (the offline stub providers) and `unknown` (an identifier nothing maps). Series recorded before this change keep their old values until Grafana's retention removes them; the panels group by `provider` and filter on no value, so a re-import needs no edit.
- Resource attributes appear as `job` (`service.name`), `instance` (`service.instance.id`), `deployment_environment`, and, through the `target_info` metric, `service_version`.
- Error records are logs with `service_name="vid4you"` and `detected_level="error"`; `stage`, `provider`, `error_code` and `service_version` are structured metadata. Since cover-error-reporting (JOS-245), `stage` is also `api` (a server error answered 5xx, with `route`, the method and route pattern, as another field) and `frontend` (an error on the page, with `error_code` `error`, `unhandledrejection` or `render`). `route` arrives only once the relay with `route` in its allowlist is deployed.

These come from Grafana Cloud's default OTLP-to-Prometheus and OTLP-to-Loki translation and were checked live on 2026-11-03 for the metrics (alert-unresponsive-provider, step 9): `outcome`, `stage`, `provider`, `deployment_environment`, `instance` and `service_instance_id` appear as named. The Loki names are not yet checked live. If a panel is empty after import, compare the label names above with **Explore** first.
