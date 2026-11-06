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
