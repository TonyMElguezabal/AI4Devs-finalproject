## ADDED Requirements

### Requirement: Every shipped adapter type passes the shared adapter contract

Every adapter type the application ships SHALL pass one shared contract against a fake vendor, run in CI, for each operation of the adapter that sends a request to its vendor. The contract SHALL check:
- a valid answer gives the operation's success result;
- an HTTP 4xx answer other than 408 and 429 is not retryable;
- an HTTP 408, 429 or 5xx answer is transient;
- a refused connection or a timeout is transient, marked unresponsive where the adapter type marks it;
- a malformed body is a defined failure, never a thrown error.

Every failure case SHALL make exactly one request to the vendor. An adapter type the application ships SHALL have contract fixtures, or the build fails.

#### Scenario: A rejected key is not retryable

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 401
- **WHEN** the adapter's operation runs
- **THEN** it returns a not-retryable failure after exactly one request

#### Scenario: A busy vendor is transient

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 503
- **WHEN** the adapter's operation runs
- **THEN** it returns a transient failure after exactly one request

#### Scenario: A vendor that never answers

- **GIVEN** a fake vendor whose connection is refused or times out
- **WHEN** the operation of an adapter type that marks unresponsive calls runs
- **THEN** it returns a transient failure marked unresponsive after exactly one request

#### Scenario: A malformed answer

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 200 with a body that is not the expected shape
- **WHEN** the adapter's operation runs
- **THEN** it returns a defined failure and does not throw

#### Scenario: A new adapter type without fixtures

- **GIVEN** an adapter type added to the parameter rules with no contract fixtures
- **WHEN** `npm run typecheck` and `npm test` run
- **THEN** both fail, and the test failure names the adapter type
