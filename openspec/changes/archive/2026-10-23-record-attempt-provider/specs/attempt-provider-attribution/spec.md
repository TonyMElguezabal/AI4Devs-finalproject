## ADDED Requirements

### Requirement: Image and clip attempts record their provider
The system SHALL store, with every image or clip attempt it records, the identifier of the provider the scene's stage is bound to at that moment (the image binding for an image attempt, the clip binding for a clip attempt). A read of the attempt SHALL return that identifier.

#### Scenario: Image attempt records the image provider
- **WHEN** an image attempt is recorded for a scene whose image stage is bound to provider `A`
- **THEN** the stored attempt carries provider `A`

#### Scenario: Clip attempt records the clip provider
- **WHEN** a clip attempt is recorded for a scene whose image stage is bound to `A` and whose clip stage is bound to `B`
- **THEN** the stored attempt carries provider `B`

### Requirement: Attempts keep their provider after a provider move
The provider stored with an attempt SHALL NOT change when the scene's stage is later bound to another provider.

#### Scenario: Attempts on both sides of a move
- **WHEN** a clip attempt fails on provider `A`, the failed stage is moved to provider `B`, and a new clip attempt is recorded
- **THEN** reading the attempts shows the earlier one on `A` and the later one on `B`

### Requirement: Existing attempts are backfilled once
On start-up of a database from before this change, the system SHALL give every existing image or clip attempt the scene's bound provider for the attempt's stage, and SHALL change no other column or row.

#### Scenario: Upgrade of an existing database
- **WHEN** the application starts on a database whose attempts have no provider column, holding an image attempt and a clip attempt for a scene bound to `A` (image) and `B` (clip)
- **THEN** the image attempt carries `A`, the clip attempt carries `B`, and every other column of both rows is unchanged

#### Scenario: Clip attempt with no clip binding
- **WHEN** the backfill meets a clip attempt whose scene has no clip binding
- **THEN** the attempt's provider stays empty and the row is otherwise unchanged

### Requirement: Diagnostics and telemetry are unaffected
Stage diagnostics and telemetry SHALL report the same values for an attempt as before this change.

#### Scenario: Diagnostics after the change
- **WHEN** a session's stage diagnostics and the attempt telemetry are read for scenes with image and clip attempts
- **THEN** the providers and counts reported are the same as before the change
