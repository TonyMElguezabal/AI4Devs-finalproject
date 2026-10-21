# administrator-access Specification

## Purpose
TBD - created by archiving change protect-admin-with-password. Update Purpose after archive.
## Requirements
### Requirement: The Administrator password is a local secret

The backend SHALL read the Administrator password from `ADMIN_PASSWORD` in the local environment, or, when the environment has none, from the local secrets file, exactly as provider credentials are read. The password SHALL NOT be read from the repository or from any settings file. An empty value SHALL count as no password.

#### Scenario: Password set in the environment
- **WHEN** the backend runs with `ADMIN_PASSWORD` set in its environment
- **THEN** that value is the Administrator password, even if the secrets file holds a different one

#### Scenario: Password set in the secrets file
- **WHEN** the environment has no `ADMIN_PASSWORD` and the local secrets file holds one
- **THEN** the secrets-file value is the Administrator password

### Requirement: The app starts without an Administrator password

The backend SHALL start and serve the regular pages and endpoints when no Administrator password is configured. In that state every Administrator endpoint SHALL refuse, and `/admin` SHALL state that no Administrator password is configured and how to set one.

#### Scenario: Fresh install with no password
- **WHEN** the backend starts with no `ADMIN_PASSWORD` in the environment or the secrets file
- **THEN** it starts normally and `POST /sessions` works

#### Scenario: Opening /admin with no password configured
- **WHEN** someone opens `/admin` and no Administrator password is configured
- **THEN** the page states that no Administrator password is configured, explains that it is set as `ADMIN_PASSWORD` in the environment or the local secrets file followed by a restart, and shows no password form and no Administrator action

### Requirement: The correct password grants Administrator access

An Administrator request SHALL carry the password in the `Authorization` header as `Bearer <password>`. The backend SHALL grant Administrator access only when a password is configured and the supplied password equals it. The comparison SHALL take the same time whatever the supplied value is.

#### Scenario: Correct password on /admin (AC1)
- **GIVEN** an Administrator password in the local configuration
- **WHEN** someone opens `/admin` and enters that password
- **THEN** access is granted and the Administrator area is shown

#### Scenario: Correct password on an Administrator endpoint
- **GIVEN** an Administrator password in the local configuration
- **WHEN** `GET /admin/access` is called with `Authorization: Bearer <that password>`
- **THEN** the response is `200` with `{ "configured": true, "granted": true }`

### Requirement: A wrong or missing password grants nothing

Every endpoint whose path starts with `/admin/` SHALL respond `401` and SHALL perform no action when the request carries no password, a password that differs from the configured one, or any password while none is configured. The `401` body SHALL say which of these applies (`password-required`, `wrong-password`, `not-configured`) and SHALL NOT contain the supplied or the configured password.

#### Scenario: Wrong password on /admin (AC2)
- **GIVEN** an Administrator password in the local configuration
- **WHEN** someone opens `/admin` and enters a different password
- **THEN** the page shows that the password is wrong, and no Administrator area or action is shown

#### Scenario: Wrong password on an Administrator endpoint
- **GIVEN** an Administrator password in the local configuration
- **WHEN** an endpoint under `/admin/` is called with a different password
- **THEN** the response is `401` with reason `wrong-password` and the endpoint's handler does not run

#### Scenario: No password supplied
- **GIVEN** an Administrator password in the local configuration
- **WHEN** an endpoint under `/admin/` is called with no `Authorization` header
- **THEN** the response is `401` with reason `password-required` and the endpoint's handler does not run

#### Scenario: Password supplied while none is configured
- **GIVEN** no Administrator password in the local configuration
- **WHEN** an endpoint under `/admin/` is called with any password
- **THEN** the response is `401` with reason `not-configured` and the endpoint's handler does not run

#### Scenario: A later Administrator endpoint is protected by default
- **WHEN** a new route is registered under `/admin/` without any authentication code of its own
- **THEN** a request to it without the correct password gets `401` and its handler does not run

### Requirement: Regular pages need no password

The pages `/` and `/?sessionId=<id>`, and every endpoint whose path does not start with `/admin/`, SHALL work with no password and no account, whether or not an Administrator password is configured.

#### Scenario: Regular pages with a password configured (AC3)
- **GIVEN** an Administrator password in the local configuration
- **WHEN** a user opens the start page or a session page, and the page calls the regular endpoints with no `Authorization` header
- **THEN** no password or account is requested and every call succeeds as before

### Requirement: The password never leaves the configuration

The Administrator password SHALL NOT appear in any log line, any response body, any live-update event, any telemetry signal or any error message. The `/admin` page SHALL keep the entered password in page memory only and SHALL NOT write it to browser storage, the address or a cookie.

#### Scenario: Requests with a wrong and a right password are logged
- **WHEN** Administrator endpoints are called with a wrong and with the correct password while request logging is on
- **THEN** neither value appears in the log output

#### Scenario: The page is reloaded after unlocking
- **WHEN** the Administrator unlocks `/admin` and then reloads the page
- **THEN** the page asks for the password again, and the password is in neither `localStorage`, `sessionStorage`, the address nor a cookie

