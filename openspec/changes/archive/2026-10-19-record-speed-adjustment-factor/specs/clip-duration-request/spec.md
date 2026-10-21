## ADDED Requirements

### Requirement: The speed-adjustment factor is derived from the requested duration and the narrated interval

Each registered chunk's speed-adjustment factor SHALL be computed as `max(requestedDurationSeconds / narratedDurationSeconds, narratedDurationSeconds / requestedDurationSeconds)`, using the chunk's own `requestedDurationSeconds` (chosen per "The requested duration is the admitted duration needing the smallest speed change") and its own narrated interval (`end - start`). It SHALL NOT be computed from, or depend on, any later-generated clip's actual length, and it SHALL NOT be set independently of this computation.

#### Scenario: A slow-down

- **GIVEN** a chunk whose narrated interval lasts 9 s and whose requested duration is 11 s
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is 11 / 9 ≈ 1.222

#### Scenario: A speed-up

- **GIVEN** a chunk whose narrated interval lasts 17.4 s and whose requested duration is 15 s (the unsplittable-sentence case)
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is 17.4 / 15 = 1.16

#### Scenario: The factor is always at least 1

- **GIVEN** any registered chunk
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is never less than 1, regardless of whether the requested duration is above or below the narrated interval

### Requirement: The speed-adjustment factor is stored with the chunk and never changes

Registration SHALL store each chunk's speed-adjustment factor in the same transaction that stores its requested duration. Once a chunk is registered, the factor SHALL NOT change through any operation, and the store SHALL refuse an update of it with a `locked:` error. A later version of the application with a different acceptable limit SHALL NOT alter an established chunk's factor or warning.

#### Scenario: Stored and read back

- **GIVEN** a registered decomposition
- **WHEN** its chunks are read from the database
- **THEN** each chunk carries the speed-adjustment factor registration computed

#### Scenario: Direct update refused

- **GIVEN** a registered chunk
- **WHEN** an update of its speed-adjustment factor or speed-factor warning is attempted in the database
- **THEN** the store refuses it with `locked: scenes.speed_factor cannot be modified once the chunk is established` (or the `speed_factor_warning` equivalent), and the values are unchanged

#### Scenario: A different acceptable limit later

- **GIVEN** a chunk registered while the acceptable limit was lower, with a stored factor above today's limit but below a later, raised limit
- **WHEN** the chunk is read after the limit changes
- **THEN** the chunk still carries the `speed_factor_warning` recorded at registration, unaffected by the later limit

### Requirement: A factor exceeding the acceptable limit records a warning, not a failure

When a chunk's speed-adjustment factor exceeds the hardcoded acceptable limit (`SPEED_FACTOR_LIMIT`), registration SHALL record a `speed_factor_warning` for that chunk. This warning SHALL NOT fail the chunk or the session, and it is independent of the `duration_warning` the requested-duration requirement may already record: a chunk MAY carry either, both, or neither.

#### Scenario: The factor exceeds the limit

- **GIVEN** a chunk whose computed speed-adjustment factor exceeds the hardcoded acceptable limit
- **WHEN** the chunk is registered
- **THEN** its `speed_factor_warning` is recorded and the chunk is registered normally, not failed

#### Scenario: The factor is within the limit

- **GIVEN** a chunk whose computed speed-adjustment factor does not exceed the hardcoded acceptable limit
- **WHEN** the chunk is registered
- **THEN** it has no `speed_factor_warning`

#### Scenario: Both warnings on the same chunk

- **GIVEN** an unsplittable sentence whose interval exceeds the largest admitted duration (recording `duration_warning: exceeds-maximum`) and whose resulting factor also exceeds the acceptable limit
- **WHEN** the chunk is registered
- **THEN** it carries both `durationWarning: "exceeds-maximum"` and `speedFactorWarning`, each recorded independently

### Requirement: The speed-adjustment factor is readable

The session read and each scene event SHALL expose `speedFactor` and, when recorded, `speedFactorWarning`, read-only, alongside `requestedDurationSeconds`. A scene without a stored request (the pre-decomposition skeleton path) SHALL omit all three. No request schema SHALL accept any of them.

#### Scenario: Exposed on the session read

- **GIVEN** a session whose chunk has a requested duration of 15 s and a narrated interval of 17.4 s
- **WHEN** the client reads the session
- **THEN** that scene carries `requestedDurationSeconds: 15`, `speedFactor: 1.16`, and `speedFactorWarning` if the factor exceeds the hardcoded limit

#### Scenario: Skeleton scene

- **GIVEN** a scene created without a decomposition
- **WHEN** it is read
- **THEN** it has neither `requestedDurationSeconds`, `speedFactor`, nor `speedFactorWarning`

### Requirement: The scene-details panel shows the requested duration and speed factor

The frontend's scene-details panel SHALL show a chunk's requested duration and speed factor, and any recorded duration or speed-factor warning, when the scene carries them.

#### Scenario: A scene's details are opened

- **GIVEN** a chunk with `requestedDurationSeconds: 15`, `speedFactor: 1.16`, and no warnings
- **WHEN** its scene details are expanded
- **THEN** the panel shows the requested duration and the speed factor

#### Scenario: A warning is shown alongside the value it qualifies

- **GIVEN** a chunk whose `speedFactorWarning` is recorded
- **WHEN** its scene details are expanded
- **THEN** the panel shows the warning next to the speed factor, distinguishable from a `durationWarning`

#### Scenario: A skeleton scene's details omit the fields

- **GIVEN** a scene created without a decomposition (no stored request)
- **WHEN** its scene details are expanded
- **THEN** the panel shows neither a requested duration nor a speed factor
