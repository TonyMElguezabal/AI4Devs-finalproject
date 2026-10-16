## ADDED Requirements

### Requirement: Relay accepts OTLP without a client secret
The relay SHALL accept OTLP/HTTP `POST` requests on `/v1/logs`, `/v1/metrics` and `/v1/traces` with JSON bodies (`application/json`). Requests need no credential, because the executable carries none. Any other path, method or content type SHALL be refused.

#### Scenario: Valid export forwarded
- **WHEN** the app posts a valid OTLP metrics payload to `/v1/metrics`
- **THEN** the relay forwards it to Grafana Cloud and returns the upstream success status

#### Scenario: Unknown path refused
- **WHEN** a request is sent to any other path or with a method other than `POST`
- **THEN** the relay returns `404` or `405` and forwards nothing

#### Scenario: Protobuf body refused
- **WHEN** a request is sent with `content-type: application/x-protobuf`
- **THEN** the relay returns `415` and forwards nothing

### Requirement: Backend token stays on the server
The Grafana Cloud ingest token SHALL exist only as a Worker secret. It SHALL be a write-only access-policy token, and it SHALL NOT appear in the repository, in the executable or in any response.

#### Scenario: Token never echoed
- **WHEN** any request reaches the relay, including a failing one
- **THEN** no response body or header contains the token

### Requirement: Abuse limits
The relay SHALL refuse any body larger than 256 KB with `413`. It SHALL rate-limit per client IP and answer `429` beyond the limit. It SHALL remove every attribute whose key is not on the allowlist from `app-telemetry` before forwarding.

#### Scenario: Oversized body
- **WHEN** a request body exceeds 256 KB
- **THEN** the relay returns `413` and forwards nothing

#### Scenario: Flooding client
- **WHEN** one IP exceeds the rate limit
- **THEN** further requests from it get `429` until the window resets

#### Scenario: Unexpected attribute dropped
- **WHEN** a payload carries an attribute such as `session.title`
- **THEN** the forwarded payload no longer contains it

### Requirement: Relay declared and deployed from the repository
The Worker code and its configuration SHALL live in the repository. They SHALL be deployed by a GitHub Actions workflow on a push to `main` that changes them. Deploy credentials SHALL be repository secrets.

#### Scenario: Change deployed
- **WHEN** a commit that changes the relay is pushed to `main`
- **THEN** the workflow tests and deploys the Worker, and the relay answers on `otel.vid4you.download`
