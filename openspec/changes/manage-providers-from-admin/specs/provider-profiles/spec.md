## ADDED Requirements

### Requirement: A provider is a profile of a shipped adapter type

A provider SHALL be a profile with a stage (reasoning, voice, alignment, image or video), an adapter type the application ships for that stage, a display name, the parameters of that adapter type and an API key. A stage SHALL be able to have several profiles. The application SHALL NOT offer an adapter type it does not ship, and the Administrator SHALL NOT be able to set the host a provider's requests go to: each adapter type sends its requests to its own vendor.

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

A profile SHALL be saved only if its adapter type, display name and parameters are valid: required parameters present, values of the right type and range, the display name not empty and unique within the stage. When the request is invalid, the response SHALL list every problem with the field it concerns and SHALL NOT include the value of an API key. A video profile whose admitted shortest duration is longer than the segmentation lower bound SHALL be refused.

#### Scenario: Several problems at once

- **WHEN** the Administrator saves a video profile with an empty display name and a maximum duration shorter than its minimum
- **THEN** the response lists both problems, each with its field
- **AND** nothing is stored

#### Scenario: Shortest duration above the segmentation bound

- **GIVEN** a segmentation lower bound of 5 seconds
- **WHEN** the Administrator saves a video profile whose admitted shortest duration is 8 seconds
- **THEN** the request is refused with a problem naming the lower bound

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
