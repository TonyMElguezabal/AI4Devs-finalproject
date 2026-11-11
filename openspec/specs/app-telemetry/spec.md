# app-telemetry Specification

## Purpose
TBD - created by archiving change add-observability-telemetry. Update Purpose after archive.
## Requirements
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
- a stage attempt completed with outcome `not-retryable`, or an image or clip provider request recorded as `not_retryable_failure`;
- a route error answered with a 5xx status;
- a frontend error report accepted by `POST /telemetry/frontend-errors`;
- an error caught by a backend `catch` block that would otherwise be lost.

Each record SHALL carry the stage, provider, error code and outcome where they apply, a scrubbed message and a scrubbed stack. A route error SHALL carry `stage` `api`; a frontend report SHALL carry `stage` `frontend`.

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
- an attempt counter labelled by `stage`, `provider` and `outcome`, where `outcome` is normalised to `success`, `transient`, `unresponsive`, `not-retryable` or `other`;
- a latency histogram in milliseconds;
- billed-unit counters, counted on success only, where the unit is known: clip seconds requested, images generated and voice characters sent.

`unresponsive` SHALL be used for a call that got no answer from the provider: a stage attempt that ended `timed-out`, a request that exceeded its call time limit, or a request that could not reach the provider (DNS, connection refused or reset). A provider that answered, with any HTTP status, SHALL NOT be `unresponsive`: a retryable answer stays `transient`. Reporting a call as `unresponsive` SHALL NOT change how the application retries it. For the decomposition (reasoning) and alignment stages, only a `timed-out` attempt SHALL be `unresponsive`; a request to those providers that could not reach them is still reported as `transient`.

#### Scenario: Completed attempt is counted once
- **WHEN** `providerUsage` is on and a voice-over attempt is completed with outcome `success`
- **THEN** the attempt counter increases by one for `voice-over`, its provider and `success`, its latency is recorded, and the voice-character counter increases by the script length

#### Scenario: Image and clip calls are counted
- **WHEN** `providerUsage` is on and a clip request is recorded as `success` for a scene that requested 6 seconds
- **THEN** the attempt counter increases by one for `video` with the scene's video provider, and the clip-seconds counter increases by 6

#### Scenario: Repeated completion is not double-counted
- **WHEN** the store refuses a second completion of an attempt that is already complete
- **THEN** no metric is recorded for the refused completion

#### Scenario: Timed-out attempt is unresponsive
- **WHEN** `providerUsage` is on and a voice-over attempt ends `timed-out`
- **THEN** the attempt counter increases by one for `voice-over`, its provider and `unresponsive`

#### Scenario: Request that hits its call time limit is unresponsive
- **WHEN** `providerUsage` is on and an image request is aborted because the provider did not answer within the call time limit
- **THEN** the attempt counter increases by one for `image`, `Fal.ai` and `unresponsive`, and the request is retried exactly as before

#### Scenario: Provider that cannot be reached is unresponsive
- **WHEN** `providerUsage` is on and a clip request fails because the connection to the provider is refused
- **THEN** the attempt counter increases by one for `video`, `RunningHub` and `unresponsive`

#### Scenario: Unreachable reasoning provider is still transient
- **WHEN** `providerUsage` is on and a decomposition attempt fails because the connection to OpenAI is refused, before the stage's time limit
- **THEN** the attempt counter increases by one for `decomposition`, `OpenAI` and `transient`

#### Scenario: Retryable HTTP answer stays transient
- **WHEN** `providerUsage` is on and the provider answers a request with HTTP 503
- **THEN** the attempt counter increases by one for that stage, provider and `transient`, not `unresponsive`

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

### Requirement: The provider label is a fixed vendor name

Every provider-usage metric and error record SHALL set `provider` to one value from a fixed set defined in the code, and SHALL NOT send the identifier stored for the attempt or the scene. The value SHALL be the vendor of the adapter type of the provider profile the identifier names (`OpenAI`, `ElevenLabs`, `Fal.ai` or `RunningHub`), after resolving the legacy image and clip identifiers to their seeded profiles. Native timestamps SHALL report the value of the voice provider that produced them, and the legacy native identifier `elevenlabs-native` SHALL report `ElevenLabs`. The assembly stage, which calls no provider, SHALL report `local`. A stub provider SHALL report `stub`. Any other identifier, a missing one included, SHALL report `unknown`. A profile's admin-editable label SHALL NOT be sent (JOS-213).

#### Scenario: Each stage reports its vendor

- **WHEN** `providerUsage` is on and a decomposition, voice-over, timestamps, image and clip call each complete with their seeded providers
- **THEN** the attempt counter carries `OpenAI`, `ElevenLabs`, `ElevenLabs`, `Fal.ai` and `RunningHub` respectively

#### Scenario: One vendor across two stages

- **WHEN** a voice-over attempt and a native timestamps attempt complete
- **THEN** both carry `provider` `ElevenLabs` and differ only by `stage`

#### Scenario: Native timestamps from the stub voice provider report stub

- **WHEN** a native timestamps attempt completes for a session whose voice provider is the stub
- **THEN** it carries `provider` `stub`

#### Scenario: A legacy native identifier reports ElevenLabs

- **WHEN** an attempt stored with `elevenlabs-native` is reported
- **THEN** it carries `provider` `ElevenLabs`

#### Scenario: Legacy identifiers resolve to their vendor

- **WHEN** an image request is recorded for a scene that stored `fal-ai/flux/dev`, and a clip request for a scene that stored `/openapi/v2/minimax/hailuo-h3/image-to-video`
- **THEN** they carry `Fal.ai` and `RunningHub`, and no exported attribute contains the model name or the endpoint path

#### Scenario: A provider added on /admin reports its vendor, not its id or label

- **WHEN** an attempt completes with a profile added on `/admin` of adapter type `fal-image`, whose id is a ULID and whose label is `My image account`
- **THEN** it carries `Fal.ai`, and neither the ULID nor the label is exported

#### Scenario: Assembly reports local

- **WHEN** an assembly attempt completes with no provider identifier
- **THEN** it carries `provider` `local`

#### Scenario: An unmapped identifier reports unknown

- **WHEN** an attempt completes with an identifier that names no profile and has no fixed entry
- **THEN** it carries `provider` `unknown` and the identifier is not exported

#### Scenario: Error records use the same value

- **WHEN** `errors` is on and a clip request is recorded as `not_retryable_failure`
- **THEN** the error record's `provider` is `RunningHub`

### Requirement: Reported errors reach the local log file
Every error passed to the telemetry error reporter (a not-retryable stage attempt, a not-retryable image or clip request, an uncaught exception, an unhandled rejection, a 5xx route error, a frontend error report, or an error reported by a `catch` block) SHALL be written to the application log at `error` level. The record SHALL carry the same `stage`, `provider`, `outcome` and error code as the OTLP record, when they apply, and the same path-redacted message. The line SHALL be written whether or not error telemetry consent is on. What is sent over OTLP, and when, SHALL stay unchanged for the errors reported before this change.

#### Scenario: Permanent stage failure with consent off
- **WHEN** an image request fails as not retryable while error telemetry consent is off
- **THEN** the log file holds an `error`-level record with `stage` `image`, and no OTLP record is sent

#### Scenario: Permanent stage failure with consent on
- **WHEN** a stage attempt fails as not retryable while error telemetry consent is on
- **THEN** the log file holds an `error`-level record for that stage, and one OTLP log record is sent as before

### Requirement: Route errors answering 5xx are reported
Every route error that Fastify answers with a 5xx status SHALL be passed to the telemetry error reporter with `stage` `api`, the error code (`error.code`, else the error's name), a `route` made of the HTTP method and the route pattern (for example `GET /sessions/:id`), never the raw URL, and the error's message. The `route` SHALL be written to the local log and exported as the OTLP attribute `route`, which the relay allowlist SHALL include. The path scrubber SHALL NOT be applied to `route`: it is a pattern from the code, not user data. A route error answered with a 4xx status SHALL NOT be reported. The response status and body SHALL be the same as before this change. No request body, header or query value SHALL be part of the report.

#### Scenario: A route handler throws
- **WHEN** a route handler throws an error without a status code
- **THEN** the response is 500 with the same body as before, and one error is reported with `stage` `api`, `route` `POST /sessions/:id/...` (the pattern) and the error's code

#### Scenario: A validation error is not reported
- **WHEN** a request fails schema validation and is answered 400
- **THEN** no error is reported

#### Scenario: An unauthorized admin request is not reported
- **WHEN** a request to an `/admin/` route is answered 401
- **THEN** no error is reported

#### Scenario: The request body never leaves
- **WHEN** a `POST /sessions` handler throws while its body holds a script
- **THEN** the reported message, stack and route contain no text from the script, and the route holds no session id or query value

### Requirement: No catch block loses an error silently
Every `catch` block and promise `.catch` handler in `backend/src` SHALL do one of these:
- pass the error to the telemetry error reporter;
- rethrow it, or turn it into an outcome that a reporting path already covers (a stage attempt outcome, a provider request outcome, an HTTP answer);
- carry a one-line comment saying why the error is not reported.

Adding a report SHALL NOT change the block's control flow: what it returns, rethrows or answers stays the same. A transient provider failure that the retry policy handles SHALL NOT be reported as an error.

#### Scenario: A swallowing block by design keeps its comment
- **WHEN** the audit reviews a block whose comment says telemetry must never fail a database write
- **THEN** the block is left as it is

#### Scenario: A lost error is reported
- **WHEN** a block catches an error, logs nothing and reports nothing
- **THEN** after the audit it passes the error to the reporter and still returns what it returned before

### Requirement: Frontend error reports are accepted, capped and rate-limited
The backend SHALL accept `POST /telemetry/frontend-errors` with a JSON body `{ kind, message, stack? }`, where `kind` is `error`, `unhandledrejection` or `render`, `message` is at most 1000 characters and `stack` at most 8000. Any other field SHALL be rejected with 400. An accepted report SHALL be passed to the telemetry error reporter with `stage` `frontend` and `kind` as the error code, and answered 204. The endpoint SHALL pass at most 10 reports per 60 seconds to the reporter; a report over the limit SHALL be answered 204 and dropped, with one local warning per window. The endpoint SHALL be covered by the existing origin policy.

#### Scenario: A report is accepted
- **WHEN** the frontend posts `{ "kind": "render", "message": "x is undefined" }`
- **THEN** the answer is 204 and one error is reported with `stage` `frontend` and error code `render`

#### Scenario: An oversized message is rejected
- **WHEN** a report's message is 1001 characters
- **THEN** the answer is 400 and nothing is reported

#### Scenario: A loop is rate-limited
- **WHEN** 50 reports arrive within one minute
- **THEN** 10 are reported, 40 are answered 204 and dropped, and one warning is written to the local log

#### Scenario: Consent off
- **WHEN** error telemetry consent is off and a report is accepted
- **THEN** the local log holds it at `error` level and no OTLP record is sent

### Requirement: Error triggers exist only behind an environment variable
When `VID4YOU_ERROR_TRIGGERS` is `1`, the backend SHALL register `POST /dev/errors/route-crash`, which throws an error, and `POST /dev/errors/unhandled-rejection`, which causes an unhandled promise rejection. Both take an optional `tag` (letters, digits and `-`, at most 40 characters) and put `synthetic` and the tag in the error's message. Without the variable neither route SHALL exist (404), and neither SHALL appear in `docs/api-spec.yml`. A packaged build SHALL remove the variable from its environment at start, like `ALLOW_TEST_ENDPOINTS` and every `USE_STUB_*`, so a release never exposes the triggers.

#### Scenario: Triggers off by default
- **WHEN** the backend runs without `VID4YOU_ERROR_TRIGGERS`
- **THEN** `POST /dev/errors/route-crash` is answered 404 and nothing is reported

#### Scenario: A packaged build ignores the variable
- **WHEN** a packaged build starts with `VID4YOU_ERROR_TRIGGERS=1` in the user's environment
- **THEN** the variable is removed before the server is built, and both trigger routes answer 404

#### Scenario: Tagged route crash
- **WHEN** the backend runs with `VID4YOU_ERROR_TRIGGERS=1` and `POST /dev/errors/route-crash` is sent with tag `jos-256`
- **THEN** the answer is 500 and one error is reported with `stage` `api` and a message holding `synthetic` and `jos-256`

### Requirement: CI contract test for error reporting
A CI test SHALL spawn the real backend with its OTLP endpoint pointed at a fake receiver on `127.0.0.1` and `VID4YOU_ERROR_TRIGGERS=1`. It SHALL trigger a route crash, a not-retryable stage failure, a frontend error report and, last, an unhandled rejection. It SHALL check the log file and the receiver.

#### Scenario: Consent on
- **WHEN** error consent is on and the four errors are triggered
- **THEN** the log file holds each at `error` level, and the receiver holds at least one OTLP log record per error class, each with `error.code`, `stage` where it applies (`api`, `image`, `frontend`), and `provider` for the stage failure

#### Scenario: Consent off
- **WHEN** error consent is off and the same errors are triggered
- **THEN** the log file holds each at `error` level, and the receiver gets no log record

