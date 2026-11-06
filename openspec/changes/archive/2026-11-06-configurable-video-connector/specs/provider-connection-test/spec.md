## ADDED Requirements

### Requirement: A configured connector is checked with its own check step

The connection test of a configured connector profile SHALL send the one request its definition's check step describes, to the profile's base URL host, with the definition's headers and the stored key, and no retry. The declared connected status SHALL be connected, 401 or 403 SHALL be key rejected, a network failure or timeout SHALL be vendor unreachable, and any other status SHALL be unexpected with its HTTP status. The result SHALL say that only the key was checked, not the model or the requests. A definition without a check step SHALL send nothing, and the result SHALL say that no check is defined. A check step marked as charged SHALL follow the existing disclosure and confirmation.

#### Scenario: A definition with a free check

- **GIVEN** a Runway connector profile whose check step is `GET /v1/organization` with connected status 200, and a valid key
- **WHEN** the Administrator tests it
- **THEN** exactly one request goes to `api.dev.runwayml.com` and the page shows connected, and that only the key was checked

#### Scenario: A rejected key

- **GIVEN** a connector profile whose check step's request is answered with 401
- **WHEN** the Administrator tests it
- **THEN** the page shows that the key was rejected

#### Scenario: A definition without a check step

- **GIVEN** a connector profile whose definition has no check step
- **WHEN** the Administrator tests it
- **THEN** no request is sent and the page says the definition has no connection check
