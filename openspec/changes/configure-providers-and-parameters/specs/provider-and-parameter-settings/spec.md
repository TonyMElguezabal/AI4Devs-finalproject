## ADDED Requirements

### Requirement: Providers and parameters come from settings files

The provider for each stage (reasoning, voice, alignment, image, video) and the parameters narration voice, quality and speed; video admitted durations (minimum and maximum); segmentation lower bound; acceptable speed-factor limit; per-stage maximum times; output resolution and frame rate; supported script languages; and per-stage maximum simultaneous requests SHALL be read from settings files, not from values compiled into the code. The application SHALL ship a default settings file containing a complete, valid value for every setting. An optional override file in the per-user data folder SHALL replace any subset of those values. Where both files define a value, the override SHALL win.

#### Scenario: Fresh install with no override file

- **GIVEN** no override file exists
- **WHEN** the app starts
- **THEN** it starts and uses the shipped default value for every setting

#### Scenario: Partial override

- **GIVEN** an override file that sets only the video stage's maximum simultaneous requests to 2
- **WHEN** the app starts
- **THEN** the video stage allows at most 2 simultaneous requests
- **AND** every other setting keeps its shipped default

#### Scenario: Admitted durations drive segmentation and clip requests

- **GIVEN** an override setting the video provider's admitted durations to 6–10 seconds and the segmentation lower bound to 6 seconds
- **WHEN** a script is decomposed and its chunks are registered
- **THEN** segmentation uses the 6-second lower bound
- **AND** every requested clip duration is a whole second from 6 to 10

### Requirement: Exactly one active provider per stage

Each stage's settings SHALL name exactly one provider, and that provider SHALL be one for which the application ships an adapter for that stage. The stage SHALL use that provider, with its configured model or endpoint identifier, for every new request.

#### Scenario: A provider the stage has no adapter for

- **GIVEN** an override that names `"Acme"` as the image provider
- **WHEN** the app starts
- **THEN** the app does not start
- **AND** the problem list names the image provider setting and the providers that stage accepts

#### Scenario: A changed model identifier

- **GIVEN** an override that sets the reasoning provider's model to another identifier
- **WHEN** the app starts and a decomposition is requested
- **THEN** the request is sent with the configured model identifier

### Requirement: Settings take effect only after a restart

Settings SHALL be read and validated once, when the app starts, and SHALL stay fixed for the life of the process. Editing a settings file while the app is running SHALL have no effect until the app restarts. No settings SHALL be editable through the application's interface or API.

#### Scenario: Edit while running

- **GIVEN** a running app
- **WHEN** the override file is edited to change a per-stage maximum time
- **THEN** in-flight and new attempts keep using the value read at start-up
- **AND** the new value applies after the app is restarted

### Requirement: Invalid settings stop the app and list every problem

At start-up the merged settings SHALL be validated as a whole. If any setting is missing, empty, of the wrong type or out of range, any key is unknown, or any two settings are inconsistent, the app SHALL NOT start, and SHALL report every problem found, each naming the setting it concerns. The consistency checks SHALL include at least:

- the segmentation lower bound is not shorter than the video provider's shortest admitted duration
- the shortest admitted duration does not exceed the longest
- the supported language list is not empty and has no duplicate codes
- every stage that the request limit covers has a maximum of at least 1

An override file that is not valid JSON SHALL be reported as a problem in the same way.

#### Scenario: Lower bound below the shortest admitted duration

- **GIVEN** an override setting the video admitted minimum to 6 seconds and the segmentation lower bound to 5 seconds
- **WHEN** the app starts
- **THEN** the app does not start
- **AND** the report names the segmentation lower bound and the admitted minimum it conflicts with

#### Scenario: Several problems at once

- **GIVEN** an override with an empty language list, a negative image maximum time and an unknown key `videoProvidr`
- **WHEN** the app starts
- **THEN** the app does not start
- **AND** the report lists all three problems, not only the first

#### Scenario: Unreadable override file

- **GIVEN** an override file that is not valid JSON
- **WHEN** the app starts
- **THEN** the app does not start
- **AND** the report names the override file's path and says it could not be parsed

### Requirement: Credentials never come from settings files

Provider credentials SHALL be read only from the process environment or the local secrets file, never from a settings file. A settings file that contains any key the settings do not define, including a credential-like key, SHALL be rejected at start-up as an unknown key. The problem report SHALL NOT include the value of any rejected key.

#### Scenario: An API key placed in the override file

- **GIVEN** an override file containing `"openaiApiKey": "sk-..."`
- **WHEN** the app starts
- **THEN** the app does not start
- **AND** the report names `openaiApiKey` as an unknown key without printing its value

### Requirement: A changed setting does not rewrite established work

Changing a setting and restarting SHALL NOT alter what an existing session has already established: recorded narration intervals, chunks, requested clip durations, speed factors and warnings, the session's script language, and completed results SHALL stay as they were. A stage that already has a bound provider SHALL keep that provider for its retries (PRD §11.2). Only work established after the restart SHALL use the new values.

#### Scenario: Admitted durations change after chunks exist

- **GIVEN** a session whose chunks were registered with 5–15 second admitted durations
- **WHEN** the admitted durations are changed to 6–10 seconds and the app restarts
- **THEN** that session's chunks keep their requested durations and speed factors

#### Scenario: The image model changes while scenes are bound

- **GIVEN** scenes already bound to the image provider, some bound by an earlier build that stored the model identifier
- **WHEN** the image model is changed and the app restarts
- **THEN** a retry of each of those scenes is sent to the same provider with the new model
- **AND** it is not refused for lack of an adapter

#### Scenario: A bound provider the build does not ship

- **GIVEN** a scene bound to a provider name no adapter in the running build has
- **WHEN** its stage is retried
- **THEN** the attempt fails as not retryable, naming the missing adapter

#### Scenario: A language is removed while a session uses it

- **GIVEN** an existing Spanish session
- **WHEN** Spanish is removed from the supported languages and the app restarts
- **THEN** the existing session keeps its language and can still be consulted, continued and retried
- **AND** a new session can no longer be created in Spanish
