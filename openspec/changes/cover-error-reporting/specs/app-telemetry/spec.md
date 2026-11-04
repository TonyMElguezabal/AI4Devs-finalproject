## MODIFIED Requirements

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

### Requirement: Reported errors reach the local log file
Every error passed to the telemetry error reporter (a not-retryable stage attempt, a not-retryable image or clip request, an uncaught exception, an unhandled rejection, a 5xx route error, a frontend error report, or an error reported by a `catch` block) SHALL be written to the application log at `error` level. The record SHALL carry the same `stage`, `provider`, `outcome` and error code as the OTLP record, when they apply, and the same path-redacted message. The line SHALL be written whether or not error telemetry consent is on. What is sent over OTLP, and when, SHALL stay unchanged for the errors reported before this change.

#### Scenario: Permanent stage failure with consent off
- **WHEN** an image request fails as not retryable while error telemetry consent is off
- **THEN** the log file holds an `error`-level record with `stage` `image`, and no OTLP record is sent

#### Scenario: Permanent stage failure with consent on
- **WHEN** a stage attempt fails as not retryable while error telemetry consent is on
- **THEN** the log file holds an `error`-level record for that stage, and one OTLP log record is sent as before

## ADDED Requirements

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
When `VID4YOU_ERROR_TRIGGERS` is `1`, the backend SHALL register `POST /dev/errors/route-crash`, which throws an error, and `POST /dev/errors/unhandled-rejection`, which causes an unhandled promise rejection. Both take an optional `tag` (letters, digits and `-`, at most 40 characters) and put `synthetic` and the tag in the error's message. Without the variable neither route SHALL exist (404), and neither SHALL appear in `docs/api-spec.yml`.

#### Scenario: Triggers off by default
- **WHEN** the backend runs without `VID4YOU_ERROR_TRIGGERS`
- **THEN** `POST /dev/errors/route-crash` is answered 404 and nothing is reported

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
