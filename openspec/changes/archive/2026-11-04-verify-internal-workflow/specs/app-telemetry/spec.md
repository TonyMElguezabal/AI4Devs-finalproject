## ADDED Requirements

### Requirement: Reported errors reach the local log file
Every error passed to the telemetry error reporter (a not-retryable stage attempt, a not-retryable image or clip request, an uncaught exception or an unhandled rejection) SHALL be written to the application log at `error` level. The record SHALL carry the same `stage`, `provider`, `outcome` and error code as the OTLP record, when they apply, and the same path-redacted message. The line SHALL be written whether or not error telemetry consent is on. What is sent over OTLP, and when, SHALL stay unchanged.

#### Scenario: Permanent stage failure with consent off
- **WHEN** an image request fails as not retryable while error telemetry consent is off
- **THEN** the log file holds an `error`-level record with `stage` `image`, and no OTLP record is sent

#### Scenario: Permanent stage failure with consent on
- **WHEN** a stage attempt fails as not retryable while error telemetry consent is on
- **THEN** the log file holds an `error`-level record for that stage, and one OTLP log record is sent as before
