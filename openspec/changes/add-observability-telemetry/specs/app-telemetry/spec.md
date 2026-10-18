## ADDED Requirements

### Requirement: Structured log written to rotating local files
The backend SHALL write its structured log to files in a `logs` folder next to the store, without asking for consent. A file SHALL rotate when it exceeds 10 MB, and at most 5 rotated files SHALL be kept. Every existing log rule still applies: no credential and no script text in any line. The terminal output SHALL stay as it is.

#### Scenario: Log lines reach the file
- **WHEN** the backend starts and handles a request
- **THEN** the log file in the `logs` folder beside the store contains the corresponding JSON lines

#### Scenario: Rotation keeps disk use bounded
- **WHEN** the current log file exceeds 10 MB
- **THEN** it is rotated, a new file is started, and no more than 5 rotated files remain

#### Scenario: Logs never leave the computer without consent
- **WHEN** every telemetry signal is off
- **THEN** log files are still written locally and nothing is sent over the network

### Requirement: Per-signal opt-in consent
The application SHALL support exactly three telemetry signals: `errors`, `providerUsage` and `productUsage`. Each SHALL be off until the user turns it on. The choice SHALL be persisted in the store and survive restarts and upgrades. The application SHALL record whether the user has answered the consent prompt, so the prompt is shown only until it is answered.

#### Scenario: First launch has everything off
- **WHEN** the application starts against a store that has no consent record
- **THEN** `GET /telemetry/consent` returns all three signals `false` and `answered: false`

#### Scenario: Consent is saved
- **WHEN** the client sends `PUT /telemetry/consent` with `{ "errors": true, "providerUsage": true, "productUsage": false }`
- **THEN** the response is `200` with the saved values and `answered: true`, and a later `GET` after a restart returns the same values

#### Scenario: Invalid consent body is rejected
- **WHEN** the client sends `PUT /telemetry/consent` with a missing signal or a non-boolean value
- **THEN** the response is `400` and the stored consent is unchanged

#### Scenario: Consent applies without a restart
- **WHEN** the user turns a signal off
- **THEN** nothing more is exported for that signal from that moment on, without restarting the application

### Requirement: Consent prompt and settings on the page
The page SHALL show a consent prompt the first time it loads with an unanswered consent. The prompt SHALL have one labelled toggle per signal, all off by default, and a sentence saying that no script, media, file name or key is sent, and a link to the privacy policy. Saving SHALL store the answer. Closing the prompt without saving ("Not now" or Escape) while consent is unanswered SHALL also store an answer with every signal off, so the prompt is never shown again on its own; closing it when consent is already answered SHALL change nothing. The user SHALL be able to reopen the same choices from the page at any time.

#### Scenario: Prompt shown once
- **WHEN** the page loads and consent is unanswered
- **THEN** the consent prompt is shown, and after the user saves it is not shown again on later loads

#### Scenario: Not now counts as an answer
- **WHEN** the prompt is shown for an unanswered consent and the user chooses "Not now" or presses Escape
- **THEN** the client sends `PUT /telemetry/consent` with every signal `false`, the prompt closes, and it is not shown again on later loads

#### Scenario: Closing an answered prompt keeps the choices
- **WHEN** the user reopens the prompt from the page, which already holds saved choices, and chooses "Not now" or presses Escape
- **THEN** no request is sent and the saved choices are unchanged

#### Scenario: Privacy policy link
- **WHEN** the prompt is shown
- **THEN** it contains a link to the published privacy policy (`PRIVACY.md` in the repository), which opens in a new tab

#### Scenario: Choices can be changed later
- **WHEN** the user opens the telemetry settings from the page and changes a toggle
- **THEN** the change is saved through `PUT /telemetry/consent`

### Requirement: Published privacy policy
The repository SHALL contain `PRIVACY.md`, in English, stating: that nothing leaves the computer unless the user turns a signal on; the three signals and exactly what each sends; what is never sent; the local log file; the relay and the observability service that receive the data; that the data is kept for as long as the service's free tier allows; and how to turn each signal off.

#### Scenario: Policy matches the signals
- **WHEN** the policy is read
- **THEN** it lists the same three signals and the same attribute names as the spec's allowlist, and says the data is kept as long as the free tier allows

### Requirement: Error reports
When `errors` is on, the application SHALL export one OpenTelemetry log record at severity `ERROR` for each of these:
- an uncaught exception;
- an unhandled promise rejection;
- a stage attempt completed with outcome `not-retryable`, or an image or clip provider request recorded as `not_retryable_failure`.

Each record SHALL carry the stage, provider, error code and outcome where they apply, a scrubbed message and a scrubbed stack.

#### Scenario: Not-retryable attempt is reported
- **WHEN** `errors` is on and a stage attempt is completed with outcome `not-retryable`
- **THEN** one error record is exported with that attempt's stage, provider and error code

#### Scenario: Errors off sends nothing
- **WHEN** `errors` is off and the same failure happens
- **THEN** no record is exported and the failure is still written to the local log

### Requirement: Provider usage metrics
When `providerUsage` is on, every finished provider call SHALL be recorded exactly once. The application records provider calls in two places, and both SHALL feed the same metrics:
- stage-attempt completion (`completeStageAttempt`), for voice-over, narration timestamps, decomposition and assembly;
- provider-request recording (`insertProviderRequest`), for the image and clip stages.

The metrics SHALL be:
- an attempt counter labelled by `stage`, `provider` and `outcome`, where `outcome` is normalised to `success`, `transient`, `not-retryable` or `other`;
- a latency histogram in milliseconds;
- billed-unit counters, counted on success only, where the unit is known: clip seconds requested, images generated and voice characters sent.

#### Scenario: Completed attempt is counted once
- **WHEN** `providerUsage` is on and a voice-over attempt is completed with outcome `success`
- **THEN** the attempt counter increases by one for `voice-over`, its provider and `success`, its latency is recorded, and the voice-character counter increases by the script length

#### Scenario: Image and clip calls are counted
- **WHEN** `providerUsage` is on and a clip request is recorded as `success` for a scene that requested 6 seconds
- **THEN** the attempt counter increases by one for `video` with the scene's video provider, and the clip-seconds counter increases by 6

#### Scenario: Repeated completion is not double-counted
- **WHEN** the store refuses a second completion of an attempt that is already complete
- **THEN** no metric is recorded for the refused completion

### Requirement: Product usage events
When `productUsage` is on, the application SHALL count:
- application starts;
- sessions started;
- sessions that reach `final-video`.

Each count SHALL be labelled with the running version.

#### Scenario: Session reaching the final video is counted
- **WHEN** `productUsage` is on and a session reaches `final-video`
- **THEN** the final-video counter increases by one

### Requirement: Telemetry carries no user content
Every exported signal SHALL carry only these resource attributes:
- `service.version`;
- `deployment.environment` (the channel: `development`, `uat` or `production`);
- `os.type`;
- `host.arch`;
- a random install ID generated once and kept in the store.

No signal SHALL contain script text, a session title, a file path, a provider credential or a provider response body. Messages and stacks SHALL pass through one scrubber that replaces POSIX and Windows paths and the user's home folder before export.

#### Scenario: Paths are scrubbed
- **WHEN** an error message contains `/Users/ana/Library/Application Support/Vid4You/projects/x.mp4` or `C:\Users\ana\AppData\Roaming\Vid4You\x.mp4`
- **THEN** the exported message contains `[path]` in its place and neither the folder names nor the user name

#### Scenario: No content attributes
- **WHEN** any signal is exported
- **THEN** its attributes contain no key outside the documented allowlist

### Requirement: Telemetry never disturbs the application
Exporting SHALL be batched and asynchronous. An unreachable or slow endpoint SHALL NOT delay a request, fail a stage or crash the process. Export failures SHALL be logged locally at most once per minute.

#### Scenario: Endpoint down
- **WHEN** every signal is on and the telemetry endpoint is unreachable
- **THEN** sessions run to `final-video` exactly as with telemetry off

### Requirement: Dashboards declared in the repository
The Grafana dashboards SHALL be stored as JSON in the repository and imported into Grafana Cloud from there. They SHALL cover:
- release health: errors per version, installs per version;
- providers: attempts, latency percentiles, retry and error rate per stage and provider, and estimated cost per final video from a price table held in the dashboard;
- the usage funnel: starts, sessions started, final videos.

#### Scenario: Dashboard reproducible from the repository
- **WHEN** the dashboard JSON from the repository is imported into an empty Grafana Cloud stack that receives the app's telemetry
- **THEN** every panel renders data without manual edits
