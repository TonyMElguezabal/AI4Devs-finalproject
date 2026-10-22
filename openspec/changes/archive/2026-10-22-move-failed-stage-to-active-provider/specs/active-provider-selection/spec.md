## MODIFIED Requirements

### Requirement: Bound stages keep their provider for every retry

A stage instance that is already bound SHALL use its bound provider for all of its automatic and manual retries, whatever the active provider is now. The one exception is an explicit move of a failed stage to the active provider by the Administrator (failed-stage-move): the stage SHALL then use the provider it was moved to.

#### Scenario: Automatic retry after the change

- **GIVEN** a session whose voice stage is bound to `stub-a` and whose attempt failed transiently
- **WHEN** the active voice provider changes to `stub-b` and the automatic retry is sent
- **THEN** the retry is sent to `stub-a`

#### Scenario: Manual retry after the change

- **GIVEN** a scene whose video stage is bound to `stub-a` and is `failed` with its retries exhausted
- **WHEN** the active video provider changes to `stub-b` and the User retries the clip
- **THEN** the new cycle is sent to `stub-a`

#### Scenario: Manual retry after an explicit move

- **GIVEN** a scene whose video stage is bound to `stub-a` and is `failed`, and the Administrator moved it to the active provider `stub-b`
- **WHEN** the User retries the clip
- **THEN** the new cycle is sent to `stub-b`
