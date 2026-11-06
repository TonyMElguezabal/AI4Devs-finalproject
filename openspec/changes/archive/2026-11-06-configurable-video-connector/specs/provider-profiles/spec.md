## ADDED Requirements

### Requirement: A stage builds each profile with the adapter of the profile's own type

A stage's registry SHALL build each of its profiles with the adapter of that profile's adapter type, with the profile's parameters and the profile's own key. A stage that ships several adapter types SHALL send each request to the vendor of the profile the work is bound to, or of the active profile when it is not yet bound. The adapter that builds each video adapter type SHALL be declared in a table keyed by adapter type, so a shipped video adapter type without one fails the type check.

#### Scenario: Two video adapter types side by side

- **GIVEN** the coded RunningHub profile and a configured connector profile for Runway in the video stage
- **WHEN** a chunk bound to the RunningHub profile retries its clip and a new chunk binds to the active Runway profile
- **THEN** the retry goes to RunningHub's host and the new clip goes to Runway's host
- **AND** each request carries its own profile's key

#### Scenario: A video adapter type without an adapter

- **GIVEN** a video adapter type added to the parameter rules with no entry in the adapter table
- **WHEN** `npm run typecheck` runs
- **THEN** it fails

### Requirement: A video profile requests clips of at most 1080p

A video profile SHALL request clips at 1080p or below, to keep the cost per clip second down. The coded RunningHub profile SHALL accept only `768P` as its resolution. A configured connector profile SHALL be refused at save time when its resolution names a tier above 1080p: `2K`, `4K`, `1440`, `2160`, `2560` or `3840`, in any letter case. A refused resolution SHALL be listed as a problem on `resolution` that names the 1080p limit. A clip below the final video's size SHALL be scaled up by the assembly, and SHALL NOT be refused.

#### Scenario: RunningHub at 2K

- **WHEN** the Administrator saves the RunningHub profile with resolution `2K`
- **THEN** the save is refused with a problem on `resolution` that names the 1080p limit

#### Scenario: A connector tier above 1080p

- **WHEN** the Administrator saves a connector profile with resolution `2K` or `auto_1440p`
- **THEN** the save is refused with a problem on `resolution` that names the 1080p limit

#### Scenario: A 768P clip in a 1080p video

- **GIVEN** a final video size of 1920×1080 and RunningHub at `768P`
- **WHEN** the session is assembled
- **THEN** each 1344×768 clip is scaled to 1920×1080, and the assembly succeeds

## MODIFIED Requirements

### Requirement: A saved profile is valid, and every problem is listed

A profile SHALL be saved only if its adapter type, display name and parameters are valid: required parameters present, values of the right type and range, the display name not empty and unique within the stage. When the request is invalid, the response SHALL list every problem with the field it concerns and SHALL NOT include the value of an API key. A video profile whose admitted shortest duration is longer than the segmentation lower bound SHALL be refused, whatever its video adapter type.

#### Scenario: Several problems at once

- **WHEN** the Administrator saves a video profile with an empty display name and a maximum duration shorter than its minimum
- **THEN** the response lists both problems, each with its field
- **AND** nothing is stored

#### Scenario: Shortest duration above the segmentation bound

- **GIVEN** a segmentation lower bound of 5 seconds
- **WHEN** the Administrator saves a video profile whose admitted shortest duration is 8 seconds
- **THEN** the request is refused with a problem naming the lower bound

#### Scenario: The bound applies to every video adapter type

- **GIVEN** a segmentation lower bound of 5 seconds
- **WHEN** the Administrator saves a configured connector profile whose admitted shortest duration is 8 seconds
- **THEN** the request is refused with the same problem as for a RunningHub profile
