## ADDED Requirements

### Requirement: Critical alert when a provider stops responding
A Grafana alert rule SHALL fire with severity `critical` when the `vid4you_provider_calls_total` counter with `outcome="unresponsive"` increases by 3 or more for one `provider` within any 5-minute window, summed over every install and stage. The alert SHALL name the provider and the stages that reported it. It SHALL resolve once a full 5-minute window has fewer than 3 such calls for that provider. Builds from the `development` environment SHALL NOT fire it.

#### Scenario: Provider stops responding
- **WHEN** installs report 3 `unresponsive` calls for `RunningHub` within 5 minutes
- **THEN** a critical alert fires naming `RunningHub` and the `video` stage

#### Scenario: Below the threshold
- **WHEN** installs report 2 `unresponsive` calls for `Fal.ai` within 5 minutes and no more
- **THEN** no alert fires

#### Scenario: Thresholds are per provider
- **WHEN** within 5 minutes installs report 2 `unresponsive` calls for `Fal.ai` and 2 for `OpenAI`
- **THEN** no alert fires

#### Scenario: Provider recovers
- **WHEN** an alert is firing for a provider and a full 5-minute window passes with fewer than 3 `unresponsive` calls for it
- **THEN** the alert resolves

#### Scenario: Development builds are ignored
- **WHEN** a `development` build reports 3 `unresponsive` calls for one provider within 5 minutes
- **THEN** no alert fires

### Requirement: The alert is emailed through a named contact point
The rule SHALL be routed to a contact point named `vid4you-critical`, which delivers by email to the Developer. The email address SHALL be configured only in Grafana Cloud and SHALL NOT appear anywhere in the repository.

#### Scenario: Alert reaches the Developer
- **WHEN** the alert fires
- **THEN** it is delivered by email through the contact point `vid4you-critical`

#### Scenario: No address in the repository
- **WHEN** the repository is searched for the address configured in `vid4you-critical`
- **THEN** it is not found

### Requirement: The alert rule is declared in the repository
The alert rule SHALL be stored as a file under `infra/grafana/alerts/` and imported into Grafana Cloud from there, by hand, like the dashboards. `infra/grafana/README.md` SHALL explain how to create the contact point and import the rule, and SHALL state the rule's limits: only installs with provider-usage telemetry on are seen, the alert fires about 1–3 minutes after the provider stops responding, and one user's own network outage can fire it.

#### Scenario: Rule reproducible from the repository
- **WHEN** the rule file is imported into a Grafana Cloud stack that has the contact point `vid4you-critical`
- **THEN** the rule is created without manual edits to its query, threshold or routing

### Requirement: The retry rate still counts calls that got no answer
The providers dashboard's retry-rate panel SHALL count `unresponsive` calls together with `transient` ones, so the retry rate it shows is the same as before `unresponsive` existed.

#### Scenario: Retry rate after the split
- **WHEN** a provider records 4 `transient` and 2 `unresponsive` calls in a period
- **THEN** the retry-rate panel counts 6 retryable calls for it

### Requirement: The unresponsive outcome is verified before release
A CI test SHALL run with provider-usage telemetry on and the telemetry exporters replaced by in-memory exporters, and SHALL check that the exported `vid4you_provider_calls_total` carries `outcome="unresponsive"` both for a provider request that never answers and for a stage attempt that times out. The request SHALL go through the real adapter and the real store, so the whole path from the adapter to the exporter is covered. Before the change is archived, the alert SHALL be fired once on the live Grafana stack and the email's arrival recorded in the change's `reports/`.

#### Scenario: CI sees an unanswered request
- **WHEN** the CI test's image adapter calls a provider that never answers and hits its call time limit
- **THEN** the in-memory exporter holds a provider-call data point for `image` with `outcome="unresponsive"`

#### Scenario: CI sees a timed-out attempt
- **WHEN** the CI test's voice-over attempt is timed out by the attempt timeout watcher
- **THEN** the in-memory exporter holds a provider-call data point for `voice-over` with `outcome="unresponsive"`

#### Scenario: Live alert test
- **WHEN** the rule and the contact point are imported and the alert is test-fired
- **THEN** the email arrives, and the report records the date, what was fired and the result
