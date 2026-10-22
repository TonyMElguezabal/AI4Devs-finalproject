## ADDED Requirements

### Requirement: An API key is entered on /admin and stored encrypted

The Administrator SHALL be able to enter, replace and remove a profile's API key on `/admin`. A stored key SHALL be encrypted with a key that is not stored in the database, and SHALL never be written to a log, a telemetry record, an error message or a response. Saving a profile with no key value SHALL keep the key the profile already has.

#### Scenario: Enter a key

- **WHEN** the Administrator saves a profile with an API key
- **THEN** the database does not contain the key in clear text
- **AND** the key is used by the next request sent through the profile

#### Scenario: Keep the key on edit

- **GIVEN** a profile with a stored key
- **WHEN** the Administrator edits its display name and leaves the key field empty
- **THEN** the profile keeps its key

#### Scenario: A key is never logged

- **WHEN** a request that carries an API key is handled and the request fails
- **THEN** the key appears in neither the log file nor the standard output nor the response

### Requirement: A key is shown only as a status and a hint

No response SHALL contain an API key. A profile SHALL be shown with a key status (stored, from the environment, or missing) and, for a stored key of at least 12 characters, the last four characters as a hint. The key field of the edit form SHALL start empty.

#### Scenario: Reading a profile

- **GIVEN** a profile with the stored key `sk-example-1234567890ab`
- **WHEN** the Administrator lists the profiles
- **THEN** the profile shows the status "stored" and the hint `90ab`
- **AND** the full key is in no field of the response

### Requirement: The application asks for a key by stage role

The application SHALL obtain a provider's key through the stage's role (reasoning, voice-over, alignment, image, video), and the system SHALL answer with the key of the provider the stage instance is bound to, or of the active provider when it is not yet bound. No part of the application other than the key store and its fallback SHALL name a vendor-specific key.

#### Scenario: Bound stage after a change of the active provider

- **GIVEN** a session bound to the voice profile A, and the active voice provider changed to the profile B with another key
- **WHEN** the session's voice request is retried
- **THEN** it is sent with the key of the profile A

#### Scenario: Unbound stage

- **GIVEN** the active image provider is the profile B
- **WHEN** a scene's image stage makes its first attempt
- **THEN** the request is sent with the key of the profile B

### Requirement: Existing keys keep working without being entered again

For the profiles created from the settings files, when no key is stored, the key SHALL be read from the process environment or the local secrets file under the name the application used before. A stored key SHALL win over those sources. A missing key SHALL fail the request with a message that names the stage role and never a value.

#### Scenario: Upgrade with keys in the environment

- **GIVEN** `FAL_API_KEY` in the environment and no stored key for the image profile
- **WHEN** an image request is sent
- **THEN** it uses the key from the environment

#### Scenario: A stored key wins

- **GIVEN** `FAL_API_KEY` in the environment and a key stored for the image profile on `/admin`
- **WHEN** an image request is sent
- **THEN** it uses the stored key

#### Scenario: No key anywhere

- **GIVEN** a profile with no stored key and no environment or secrets key
- **WHEN** a request is sent through it
- **THEN** the request fails with a message naming the role, such as the image role, and containing no key value

### Requirement: The reasoning key also serves script moderation

Script moderation SHALL use the key of the active reasoning provider, since the moderation endpoint is the reasoning vendor's.

#### Scenario: Moderation with a stored reasoning key

- **GIVEN** a key stored for the active reasoning profile and no `OPENAI_KEY` in the environment
- **WHEN** a script is submitted
- **THEN** the moderation request is sent with the stored key
