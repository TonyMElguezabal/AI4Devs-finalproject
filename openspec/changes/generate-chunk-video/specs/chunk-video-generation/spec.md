# Chunk video generation

Requirements for animating a chunk's completed image into a stored video clip. The per-stage retry budget, the shared concurrency cap, pause handling, and the per-stage execution time limit are owned by `stage-retry-policy` and `stage-execution-time-limit`; this capability covers when generation launches, how the requested duration is selected, what is persisted, the one correction path a failed video stage allows, and how one chunk's failure leaves the rest of the session unaffected.

## ADDED Requirements

### Requirement: Video generation launches automatically once the image is complete

The system SHALL launch video generation for a chunk as soon as its image stage reaches `image-complete`, without further action from the User, through the shared phase-launch gate. The chunk SHALL be in state `video-generating` before the request is sent to the video provider.

#### Scenario: A chunk's image has just completed

- **WHEN** a chunk's image stage reaches `image-complete`
- **THEN** video generation is launched without further User action
- **AND** the chunk state is `video-generating` before the provider request is sent

### Requirement: The requested duration is the admitted duration needing the smallest speed change

The system SHALL select the requested duration from the video provider's hardcoded set of admitted durations as the one requiring the smallest speed change — acceleration or deceleration ratio — to match the chunk's narrated duration, not the one with the smallest difference in seconds. On an exact tie between two candidates' speed-change ratios, the system SHALL select the longer duration. When the narrated duration is below every admitted duration, the system SHALL select the smallest admitted duration.

#### Scenario: One admitted duration needs a smaller speed change than another that is numerically closer

- **WHEN** a chunk's narrated duration is 6 seconds and the provider admits 5 and 10 seconds
- **THEN** the 5-second duration is selected, because it needs a smaller speed change (1.2×) than the 10-second duration (1.67×), even though 10 seconds is numerically closer to 6

#### Scenario: Two admitted durations require exactly the same speed change

- **WHEN** two admitted durations would require the same speed-change ratio for a chunk's narrated duration
- **THEN** the longer of the two durations is selected

#### Scenario: The narrated duration is below the smallest admitted duration

- **WHEN** a chunk's narrated duration is shorter than every duration the video provider admits
- **THEN** the smallest admitted duration is requested

### Requirement: The resulting speed factor is recorded and shown, not chosen independently

The system SHALL compute the speed factor as the ratio between the requested duration and the chunk's narrated duration, and SHALL persist it together with the requested duration on the chunk. The speed factor SHALL NOT be set or overridden independently of this computation.

#### Scenario: A chunk's video completes

- **WHEN** video generation completes for a chunk
- **THEN** its requested duration and its resulting speed factor are both recorded

#### Scenario: The scene details are consulted

- **WHEN** a chunk's details are read
- **THEN** its requested duration and its speed factor are shown

### Requirement: A speed factor above the acceptable limit is a warning, not a failure

When a chunk's speed factor exceeds the hardcoded acceptable limit, the system SHALL record a speed-factor warning for that chunk and SHALL NOT treat it as a failure.

#### Scenario: The speed factor exceeds the limit

- **WHEN** a chunk's computed speed factor exceeds the hardcoded acceptable limit
- **THEN** a speed-factor warning is recorded for that chunk
- **AND** the chunk's video stage still completes successfully

### Requirement: The provider receives the generated image, the instruction, and the selected duration

The video request SHALL carry the chunk's already-generated image, its `VIDEO` instruction, and the selected requested duration.

#### Scenario: A video request is built

- **WHEN** a chunk's video request is sent
- **THEN** it carries that chunk's generated image, its `VIDEO` instruction, and the selected duration

### Requirement: A temporary link is resolved to a local file before the stage succeeds

When the video provider returns the result only as a temporary link, the system SHALL download and store the clip in the session's project folder before the stage instance is marked successful, and before the link can be expected to expire.

#### Scenario: The provider returns a temporary link

- **WHEN** the video provider's response is a temporary link
- **THEN** the clip is downloaded and stored in the project folder before the stage is marked successful

### Requirement: A successful generation completes the chunk

When a clip has been persisted locally, the system SHALL record its path on the chunk and set the chunk's state to `chunk-complete`, the scene's final state.

#### Scenario: Generation succeeds

- **WHEN** a clip is generated and persisted for a chunk
- **THEN** the chunk's video result path is recorded
- **AND** the chunk's state is `chunk-complete`

### Requirement: A video retry does not regenerate the image

When the video stage of a chunk is retried, automatically or manually, the system SHALL reuse the chunk's existing image and SHALL NOT request a new one.

#### Scenario: The video stage is retried

- **WHEN** a chunk's video stage is retried
- **THEN** its existing image is reused
- **AND** no new image is generated

### Requirement: An exhausted video stage can be corrected

When a chunk's video stage is `failed`, the system SHALL allow the User to either retry with the same `VIDEO` instruction or replace `VIDEO` with a new instruction and retry, preserving the chunk's already-successful image. The chunk's `ID`, `PROMPT`, `IMAGE`, and its position in the scene order SHALL remain unchanged by this or any other operation.

#### Scenario: A retry with the same instruction is requested

- **WHEN** the User retries a failed video stage without changing `VIDEO`
- **THEN** a new attempt is made with the same instruction and the existing image

#### Scenario: The instruction is corrected

- **WHEN** the User replaces `VIDEO` on a chunk whose video stage is `failed`
- **THEN** the new instruction is stored
- **AND** a new attempt is made with it, reusing the existing image

#### Scenario: The correction form is unavailable outside failure

- **WHEN** a chunk's video stage is not `failed`
- **THEN** no operation offers a way to change its `VIDEO` instruction

#### Scenario: A correction attempts to change a locked field

- **WHEN** a request to correct a chunk's `VIDEO` also attempts to change its `ID`, `PROMPT`, `IMAGE`, or position in the scene order
- **THEN** only `VIDEO` is affected
- **AND** `ID`, `PROMPT`, `IMAGE`, and the scene order are unchanged

### Requirement: One chunk's video failure does not affect other chunks

When a chunk's video stage reaches `failed`, other chunks of the same session SHALL continue processing toward their own `chunk-complete` or `failed` outcome, unaffected by that chunk's failure.

#### Scenario: One chunk fails while others are in progress

- **WHEN** one chunk's video stage reaches `failed`
- **THEN** the other chunks of the session continue processing independently

### Requirement: A successful clip can be downloaded individually during processing

The system SHALL offer a completed chunk's clip for individual download while other chunks of the same session are still processing or have failed.

#### Scenario: Other scenes are still processing

- **WHEN** a chunk reaches `chunk-complete` while other chunks of the session are still generating or have failed
- **THEN** that chunk's clip is available for individual download

### Requirement: The video stage's diagnostics are recorded without exposing credentials

The system SHALL record the provider used, the attempts made, the status, and — when failed — the cause and its retryability for a chunk's video stage. The recorded cause SHALL NOT include credentials or raw provider payloads.

#### Scenario: A chunk's video details are consulted

- **WHEN** a chunk's details are read
- **THEN** its video stage shows the provider used, the attempts made, and its current status

### Requirement: Video generation is scoped to its own session

The system SHALL NOT generate, expose, or persist a video result against a chunk belonging to a different session than the one the request identifies.

#### Scenario: Two sessions each have a chunk with the same identifier

- **WHEN** a video-generation result is being recorded for a chunk
- **THEN** it is attributed only to the chunk's own session, even if another session has a chunk with the same identifier
