## ADDED Requirements

### Requirement: Decomposition and alignment stubs by environment variable
When the backend starts with `USE_STUB_DECOMPOSITION=success`, it SHALL replace the reasoning provider and the alignment provider with succeeding stubs, so a session's decomposition never sends a request to OpenAI or ElevenLabs. The stub reasoning provider SHALL return one image and one video instruction per text it receives. The stub alignment provider SHALL return character timestamps that end within the narration. The stubs SHALL be registered under identifiers starting with `stub-`, so the attempts record them, telemetry reports their provider as `stub`, and the session page shows them as `Stub provider`. When the variable is unset or empty, the real OpenAI and ElevenLabs providers SHALL be used, as before.

#### Scenario: Stubbed decomposition registers scenes for free
- **WHEN** the backend runs with `USE_STUB_DECOMPOSITION=success` and a session reaches decomposition
- **THEN** its scenes are registered and no request is sent to OpenAI or ElevenLabs

#### Scenario: Unset variable keeps the real providers
- **WHEN** the backend starts without `USE_STUB_DECOMPOSITION`
- **THEN** the reasoning and alignment registries are the ones built from the provider profiles, as before

#### Scenario: Telemetry names the stub
- **WHEN** a decomposition attempt runs on the stub reasoning provider and its provider call is recorded
- **THEN** the telemetry `provider` label is `stub`

#### Scenario: The session page names the stub
- **WHEN** a session's decomposition ran on the stub reasoning provider and `GET /sessions/:id` is read
- **THEN** the `instructions` stage reports the provider `Stub provider`, not `Unknown provider`

### Requirement: Every stub identifier is shown as a stub provider
The session page SHALL show any stage provider identifier that starts with `stub-` and matches no profile as `Stub provider`, with the identifier as its model, in every stage. It SHALL NOT log it as an unknown identifier. Identifiers that don't start with `stub-` SHALL be shown as before.

#### Scenario: A stub identifier in any stage
- **WHEN** a stage's stored provider identifier is `stub-alignment`
- **THEN** it is shown as `Stub provider` with the model `stub-alignment`

#### Scenario: An unknown identifier stays unknown
- **WHEN** a stage's stored provider identifier is `retired-vendor` and matches no profile
- **THEN** it is shown as `Unknown provider` and logged once, as before

### Requirement: Script moderation stub by environment variable
When the backend starts with `USE_STUB_SCRIPT_MODERATION=clean`, the script check of `POST /sessions` SHALL accept every script without sending a request to OpenAI. When the variable is unset or empty, the real moderation SHALL be used, as before.

#### Scenario: Stubbed moderation accepts the script
- **WHEN** the backend runs with `USE_STUB_SCRIPT_MODERATION=clean` and `POST /sessions` receives a script
- **THEN** the session is created with status 201 and no request is sent to OpenAI

#### Scenario: Unset variable keeps the real moderation
- **WHEN** the backend starts without `USE_STUB_SCRIPT_MODERATION`
- **THEN** `POST /sessions` checks the script with the real moderation, as before

### Requirement: The stub assembly tool writes its output
When the stub assembly tool succeeds (modes `success` and `slow-success`), it SHALL write a non-empty placeholder file at the output path it was given before it reports success, so the final-video download serves a file. A file already at that path SHALL be left as it is. The failing modes SHALL write nothing.

#### Scenario: Stubbed assembly leaves a downloadable file
- **WHEN** a session assembles with `USE_STUB_ASSEMBLY_TOOL=success` and reaches `final-video`
- **THEN** `GET /sessions/:id/download/final-video` answers 200 with a non-empty body

#### Scenario: An existing output file is kept
- **WHEN** a file already exists at the output path and the stub assembly tool succeeds
- **THEN** the file keeps its bytes

#### Scenario: Failing stub writes nothing
- **WHEN** the stub assembly tool runs in `not-retryable-failure` mode
- **THEN** no file exists at the output path

### Requirement: CI runs one session end to end against the spawned server
The backend test suite SHALL include a test that spawns `node src/server.ts` with every provider stubbed (`USE_STUB_SCRIPT_MODERATION`, `USE_STUB_VOICE_PROVIDER`, `USE_STUB_DECOMPOSITION`, `USE_STUB_IMAGE_PROVIDER`, `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_ASSEMBLY_TOOL`) and its own scratch `DB_PATH`, `PROJECTS_ROOT` and `SETTINGS_PATH`, creates a session over HTTP, and waits until `GET /sessions/:id` reports every phase `complete`. It SHALL then download the final video. It SHALL run in the existing CI job with no provider credentials.

#### Scenario: Every phase completes
- **WHEN** the test creates a session on the spawned server and waits for it
- **THEN** `GET /sessions/:id` reports the state `final-video` and all four phases `complete`

#### Scenario: Final video downloads
- **WHEN** the session has reached `final-video`
- **THEN** `GET /sessions/:id/download/final-video` answers 200 with a non-empty body

### Requirement: A permanent stage failure stops the session cleanly
The backend test suite SHALL include a test that spawns the server as in the end-to-end test but with `USE_STUB_IMAGE_PROVIDER=not-retryable-failure`. The session SHALL stop with the image stage failed and SHALL NOT reach assembly, and the log file under the scratch data folder SHALL hold an `error`-level record for the image stage.

#### Scenario: Image failure stops before assembly
- **WHEN** a session runs on the spawned server with the image stub failing permanently
- **THEN** `GET /sessions/:id` shows every scene `failed` with `affectedStage` `image`, and the `assembly` phase still `pending`

#### Scenario: The failure is logged
- **WHEN** the failed session is inspected
- **THEN** `logs/vid4you.log` next to the scratch database holds an `error`-level record for the image stage

### Requirement: Workflow tests are isolated and bounded
Every workflow test SHALL create its scratch folders under the operating system's temporary directory and SHALL remove them and stop the spawned server when it finishes, whether it passes or fails. It SHALL NOT read or write the Developer's `data/` folder or `backend/.secrets.json`. It SHALL wait on API state with a bounded poll that fails the test with the last state seen when the bound is reached, never with a fixed sleep. It SHALL send no telemetry and no request outside `127.0.0.1`.

#### Scenario: Scratch folders removed after a failure
- **WHEN** a workflow test fails midway
- **THEN** its scratch folders no longer exist, the spawned server has exited, and `data/` is unchanged

#### Scenario: A stuck session fails the test in bounded time
- **WHEN** the session never reaches the awaited state
- **THEN** the poll gives up at its bound and the test fails naming the last state it read
