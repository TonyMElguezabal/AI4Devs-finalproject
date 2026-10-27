# provider-connection-test Specification

## Purpose
TBD - created by archiving change test-provider-connection. Update Purpose after archive.
## Requirements
### Requirement: The Administrator can test a saved profile's connection

The Administrator SHALL be able to test a saved provider profile from `/admin`. A test SHALL send exactly one request to that profile's vendor, with the profile's stored key and current parameters, to the vendor host its adapter type uses, with no retry. The result SHALL be one of: connected; key rejected; model or voice not found; vendor unreachable; unexpected vendor answer (with its HTTP status). The result SHALL say what the check covered.

#### Scenario: Valid key

- **GIVEN** a reasoning profile whose key and model are valid
- **WHEN** the Administrator tests it
- **THEN** exactly one request is sent and the page shows "connected" and that the key and model were checked

#### Scenario: Rejected key

- **GIVEN** a profile whose vendor answers 401 or 403
- **WHEN** the Administrator tests it
- **THEN** the page shows that the key was rejected

#### Scenario: Unknown model

- **GIVEN** a profile whose check looks up its model or voice and the vendor answers 404
- **WHEN** the Administrator tests it
- **THEN** the page shows that the model or voice was not found

#### Scenario: Vendor unreachable

- **GIVEN** the vendor does not answer within the check's time limit or the network fails
- **WHEN** the Administrator tests the profile
- **THEN** the page shows that the vendor could not be reached, and no second request is sent

#### Scenario: Profile without a key

- **GIVEN** a profile with no stored key and no fallback key
- **WHEN** the Administrator tests it
- **THEN** no request is sent and the page says the profile has no key

### Requirement: A charged check is disclosed and confirmed before it is sent

Each adapter type SHALL declare whether its check is charged by the vendor. For a charged check, the page SHALL say so before the test is sent, and the server SHALL refuse the test unless the request confirms the charge. A free check SHALL need no confirmation.

#### Scenario: Charged check without confirmation

- **GIVEN** an adapter type whose check is charged
- **WHEN** a test request arrives without confirming the charge
- **THEN** it is refused and no request is sent to the vendor

#### Scenario: Charged check with confirmation

- **GIVEN** the page has told the Administrator that the check is charged
- **WHEN** they confirm and test
- **THEN** exactly one request is sent

#### Scenario: Free check

- **GIVEN** an adapter type whose check is free
- **WHEN** the Administrator tests a profile of that type
- **THEN** the test is sent without asking for confirmation

### Requirement: A test never reveals the key and never changes the profile

A test result SHALL NOT contain the key, any part of it beyond the hint already shown, the request headers, or the vendor's raw response body. A test SHALL NOT modify the profile, its key, any binding, or any attempt or usage record, whatever its result.

#### Scenario: Failed test

- **GIVEN** a profile whose test fails with key rejected
- **WHEN** the Administrator reads the profile afterwards
- **THEN** its label, parameters, key status and active state are unchanged

#### Scenario: Key not echoed

- **GIVEN** a vendor whose error body repeats the key it received
- **WHEN** the test fails
- **THEN** the result shows the cause in words and does not contain the key

### Requirement: Testing requires the Administrator password

A test SHALL be refused as unauthorized without the Administrator password, and no request SHALL be sent to the vendor.

#### Scenario: Without the password

- **GIVEN** a person who has not entered the Administrator password
- **WHEN** they request a test
- **THEN** the response is 401 and no vendor request is sent
