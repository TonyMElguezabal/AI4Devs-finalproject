# provider-profiles Specification

## Purpose
TBD - created by archiving change manage-providers-from-admin. Update Purpose after archive.
## Requirements
### Requirement: A provider is a profile of a shipped adapter type

A provider SHALL be a profile with a stage (reasoning, voice, alignment, image or video), an adapter type the application ships for that stage, a display name, the parameters of that adapter type and an API key. A stage SHALL be able to have several profiles. The application SHALL NOT offer an adapter type it does not ship, and the Administrator SHALL NOT be able to set the host a provider's requests go to: each adapter type sends its requests to its own vendor. The one exception is a `configured-video` profile, whose base URL the Administrator sets and to whose host its key is bound (see `configured-video-connector`).

#### Scenario: Two profiles of one adapter type

- **GIVEN** an image profile named "Flux dev" and the Administrator adds a second image profile of the same adapter type with another model identifier
- **WHEN** the Administrator lists the image profiles
- **THEN** both are listed, each with its own parameters

#### Scenario: An adapter type the stage does not ship

- **WHEN** the Administrator adds a voice profile of the adapter type `fal-image`
- **THEN** the request is refused with a validation error naming the adapter types the voice stage ships
- **AND** nothing is stored

#### Scenario: No host can be set

- **WHEN** the Administrator adds a profile whose parameters include a host or a full URL
- **THEN** the request is refused as an unknown parameter and nothing is stored

### Requirement: The first profiles come from the settings files and keep their identifiers

The first time the application starts with no profile for a stage, it SHALL create that stage's profile from the provider section of the settings (adapter type, display name and parameters). That profile SHALL have the identifier the application already stores for that provider in bindings and attempts, so that nothing already stored stops resolving. After that, the provider sections of the settings SHALL NOT change a profile.

#### Scenario: Upgrade with existing sessions

- **GIVEN** a database with sessions bound to the image provider `Fal.ai` and the voice provider `ElevenLabs`
- **WHEN** the application starts after the upgrade
- **THEN** an image profile with identifier `Fal.ai` and a voice profile with identifier `ElevenLabs` exist
- **AND** retries of those sessions are sent through them

#### Scenario: A settings edit after the first start

- **GIVEN** the profiles exist
- **WHEN** the settings file changes the image model and the application restarts
- **THEN** the image profile keeps its stored model
- **AND** the application logs one notice that provider settings are managed on `/admin`

### Requirement: The Administrator adds, edits and deletes profiles on /admin

The Administrator SHALL be able, on `/admin`, to add a profile, to edit a profile's display name and parameters, and to delete a profile. Each action SHALL require the Administrator password (JOS-173): without it, nothing SHALL change. The page SHALL ask for the details its adapter type needs and SHALL show a profile's parameters.

#### Scenario: Add a provider

- **GIVEN** the Administrator is signed in
- **WHEN** they add an image profile with a display name, a model identifier and an API key
- **THEN** the profile is stored and listed, and it can be chosen as the active image provider

#### Scenario: Edit a parameter

- **GIVEN** a voice profile
- **WHEN** the Administrator changes its speed
- **THEN** the next voice request of any stage that uses the profile is sent with the new speed

#### Scenario: Without the password

- **GIVEN** a person who has not entered the Administrator password
- **WHEN** they try to list, add, edit or delete a profile
- **THEN** the request is refused as unauthorized and nothing is stored

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

### Requirement: Only a usable profile can be made active

A profile SHALL be usable when its parameters are valid and an API key can be resolved for it. Choosing the active provider of a stage (JOS-171) SHALL be refused for a profile that is not usable, and for a retired profile, and the response SHALL say why. The profiles `/admin` offers for a stage SHALL be that stage's profiles that are not retired.

#### Scenario: A profile without a key

- **GIVEN** an image profile saved without an API key and with none in the environment
- **WHEN** the Administrator chooses it as the active image provider
- **THEN** the change is refused with a reason saying the key is missing
- **AND** the active image provider is unchanged

#### Scenario: A retired profile

- **GIVEN** a retired voice profile
- **WHEN** the Administrator lists the voice providers to choose from
- **THEN** the retired profile is not offered

### Requirement: Deleting a profile never breaks work bound to it

A profile that is the active provider of a stage SHALL NOT be deleted: the request SHALL be refused and name the stage. A profile that a session, a scene or a recorded attempt is bound to SHALL be retired instead of removed: it SHALL stop being offered, and it SHALL keep serving the retries of what is bound to it, with its parameters and key. A profile nothing refers to SHALL be removed. The response SHALL say whether the profile was removed or retired.

#### Scenario: Delete the active provider

- **GIVEN** a profile that is the active video provider
- **WHEN** the Administrator deletes it
- **THEN** the request is refused, naming the video stage
- **AND** the profile is unchanged

#### Scenario: Delete a profile with bound work

- **GIVEN** a profile that is not active and that a scene is bound to
- **WHEN** the Administrator deletes it
- **THEN** the answer says it was retired
- **AND** a manual retry of that scene is still sent through it

#### Scenario: Delete an unused profile

- **GIVEN** a profile that is not active and that nothing is bound to
- **WHEN** the Administrator deletes it
- **THEN** the answer says it was removed and it is no longer listed

### Requirement: A parameter change applies to the next request and never rewrites established work

A change to a profile's parameters SHALL apply, without a restart, to the next request sent through it, including the retries of stages already bound to it. It SHALL NOT change what a session has established: requested durations, speed factors, narration intervals, chunks, warnings and completed results.

#### Scenario: Edit while a scene is bound to the profile

- **GIVEN** a scene bound to an image profile whose attempt failed transiently
- **WHEN** the Administrator changes the profile's model and the retry is sent
- **THEN** the retry is sent with the new model
- **AND** the scene's earlier attempts and its stored instructions are unchanged

### Requirement: The admitted durations come from the active video provider

Segmentation and the request of a clip duration SHALL use the admitted durations (minimum and maximum) of the active video provider at the time they run. A scene whose stored requested duration the active video provider does not admit SHALL fail as not retryable before it is bound to that provider, with a message that names the duration and the provider, so that it can be retried after the active provider is changed back.

#### Scenario: Durations of the active provider

- **GIVEN** the active video provider admits 6 to 10 seconds and the segmentation lower bound is 6 seconds
- **WHEN** a script is decomposed
- **THEN** every requested clip duration is a whole number of seconds from 6 to 10

#### Scenario: A requested duration the active provider does not admit

- **GIVEN** a scene registered with a requested duration of 5 seconds, and the active video provider now admits 6 to 10 seconds
- **WHEN** the scene's video stage starts
- **THEN** the scene fails as not retryable with a message naming 5 seconds and the provider
- **AND** no request is sent and the scene is still not bound to a video provider

### Requirement: Diagnostics name a provider by its profile

The stage diagnostics SHALL show a provider's display name and its model or endpoint from its profile, for every profile, not only for the providers the application shipped first.

#### Scenario: A profile added on /admin

- **GIVEN** a profile added on `/admin` with the display name "Flux pro"
- **WHEN** a scene is generated through it
- **THEN** the scene's diagnostics show "Flux pro"

### Requirement: Every shipped adapter type is complete in each per-adapter table

Each table that holds per-adapter-type behaviour SHALL be keyed by the adapter types the application ships, as defined by their parameter rules. This covers the vendor name telemetry reports, the connection check and the `/admin` form description with its display name. Adding an adapter type without an entry in one of these tables SHALL fail the type check that CI runs, and the failure SHALL name the missing entry. Tables keyed by stage or by profile are not covered.

#### Scenario: A new adapter type without a connection check

- **GIVEN** a developer adds an adapter type to the parameter rules and gives it a vendor name and a form description but no connection check
- **WHEN** `npm run typecheck` runs
- **THEN** it fails with an error that names the new adapter type as missing from the connection checks

#### Scenario: A table widened back to any string

- **GIVEN** the connection checks, the vendor names or the form descriptions are retyped to accept any string as an adapter type
- **WHEN** `npm run typecheck` runs
- **THEN** it fails on the adapter-type table test

#### Scenario: Every table matches the shipped adapter types

- **WHEN** the unit tests run
- **THEN** the connection checks, the vendor names and the `/admin` adapter-type catalogue each list exactly the adapter types in the parameter rules, and the catalogue keeps its current order

#### Scenario: Existing behaviour is unchanged

- **WHEN** the Administrator lists the adapter types on `/admin` or tests a profile's connection
- **THEN** the response is the same as before this change, field for field and in the same order

### Requirement: Every shipped adapter type passes the shared adapter contract

Every adapter type the application ships SHALL pass one shared contract against a fake vendor, run in CI, for each operation of the adapter that sends a request to its vendor. The contract SHALL check:
- a valid answer gives the operation's success result;
- an HTTP 4xx answer other than 408 and 429 is not retryable;
- an HTTP 408, 429 or 5xx answer is transient;
- a refused connection or a timeout is transient, marked unresponsive where the adapter type marks it;
- a malformed body is a defined failure, never a thrown error.

Every failure case SHALL make exactly one request to the vendor. An adapter type the application ships SHALL have contract fixtures, or the build fails.

#### Scenario: A rejected key is not retryable

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 401
- **WHEN** the adapter's operation runs
- **THEN** it returns a not-retryable failure after exactly one request

#### Scenario: A busy vendor is transient

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 503
- **WHEN** the adapter's operation runs
- **THEN** it returns a transient failure after exactly one request

#### Scenario: A vendor that never answers

- **GIVEN** a fake vendor whose connection is refused or times out
- **WHEN** the operation of an adapter type that marks unresponsive calls runs
- **THEN** it returns a transient failure marked unresponsive after exactly one request

#### Scenario: A malformed answer

- **GIVEN** any shipped adapter type and a fake vendor that answers HTTP 200 with a body that is not the expected shape
- **WHEN** the adapter's operation runs
- **THEN** it returns a defined failure and does not throw

#### Scenario: A new adapter type without fixtures

- **GIVEN** an adapter type added to the parameter rules with no contract fixtures
- **WHEN** `npm run typecheck` and `npm test` run
- **THEN** both fail, and the test failure names the adapter type

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

