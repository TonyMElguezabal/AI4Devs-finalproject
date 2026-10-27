# provider-change-log Specification

## Purpose
TBD - created by archiving change record-provider-changes. Update Purpose after archive.
## Requirements
### Requirement: An active-provider change is logged
When the Administrator saves a stage's active provider on `/admin` and the saved provider differs from the provider that was active until then, the application SHALL record one log entry with the instant of the change, the stage, and the previous and the new provider, each as its id and its display name at that instant. The previous provider SHALL be the provider that was effectively active, including a settings default when no choice had been saved. The entry and the new choice SHALL be written together: either both are stored or neither is. Saving the provider that is already active SHALL write no entry.

#### Scenario: Active provider changed
- **WHEN** the active video provider is A and the Administrator makes B active
- **THEN** one entry records the instant, stage video, previous A and new B, with their display names

#### Scenario: First choice over the settings default
- **WHEN** no choice was ever saved for the image stage, the settings default is A, and the Administrator makes B active
- **THEN** the entry records previous A and new B

#### Scenario: Same provider saved again
- **WHEN** the Administrator saves the provider that is already active
- **THEN** no entry is written

#### Scenario: Refused change logs nothing
- **WHEN** a request to make a provider active is refused (not selectable, or not usable)
- **THEN** no entry is written and the active provider is unchanged

### Requirement: A failed-stage move is logged
When the Administrator moves a failed stage to the current active provider (JOS-172) and the move succeeds, the application SHALL record one log entry with the instant, the session, the stage, the scene for an image or video stage (none for voice, alignment or reasoning), and the previous and the new provider, each as its id and its display name at that instant. The entry SHALL be written in the same transaction as the new binding. A refused move SHALL write no entry.

#### Scenario: Clip moved
- **WHEN** scene 3 of a session failed its clip on provider A and is moved to the active provider B
- **THEN** one entry records the instant, the session, stage video, scene 3, previous A and new B

#### Scenario: Session stage moved
- **WHEN** a session's failed voice-over on provider A is moved to the active provider B
- **THEN** one entry records the session, stage voice, no scene, previous A and new B

#### Scenario: Refused move logs nothing
- **WHEN** a move is refused (for example the stage is already on the active provider, or a retry is in progress)
- **THEN** no entry is written

### Requirement: The log starts empty and is never rewritten
The log SHALL hold only changes made after it was introduced; earlier changes SHALL NOT be reconstructed. Entries SHALL never be updated or deleted by the application, and a provider's later rename or retirement SHALL NOT change an entry.

#### Scenario: Upgrade
- **WHEN** a database with saved active-provider choices and moved stages is migrated
- **THEN** the log is empty and every other table is unchanged

#### Scenario: Provider renamed later
- **WHEN** a provider in an entry is renamed on `/admin`
- **THEN** the entry still shows the name it had when the change was made

