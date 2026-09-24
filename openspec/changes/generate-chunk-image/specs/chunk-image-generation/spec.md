# Chunk image generation

Requirements for turning a chunk's `IMAGE` instruction into a stored image. The per-stage retry budget, the shared concurrency cap, pause handling, and the per-stage execution time limit are owned by `stage-retry-policy` and `stage-execution-time-limit`; this capability covers when generation launches, what the provider must produce, how the result is persisted, the one correction path a failed image stage allows, and how one chunk's failure leaves the rest of the session unaffected.

## ADDED Requirements

### Requirement: Image generation launches automatically once a chunk has its instruction

The system SHALL launch image generation for a chunk as soon as it exists with a non-empty `IMAGE` instruction, without further action from the User, through the shared phase-launch gate. The chunk SHALL be in state `image-generating` before the request is sent to the image provider.

#### Scenario: A chunk has just been produced by decomposition

- **WHEN** a chunk is produced with a non-empty `IMAGE` instruction
- **THEN** image generation is launched without further User action
- **AND** the chunk state is `image-generating` before the provider request is sent

### Requirement: The provider must meet the image capability

The image request SHALL carry the chunk's `IMAGE` instruction as text. The system SHALL treat a returned image as valid only if it is horizontal 16:9 with a resolution of at least 1920×1080.

#### Scenario: A valid image is returned

- **WHEN** the image provider returns a 16:9 image at or above 1920×1080 for a chunk's `IMAGE` instruction
- **THEN** it is accepted as that chunk's image

### Requirement: A temporary link is resolved to a local file before the stage succeeds

When the image provider returns the result only as a temporary link, the system SHALL download and store the image in the session's project folder before the stage instance is marked successful, and before the link can be expected to expire. The stage instance SHALL NOT be marked `image-complete` while only a link, and no local file, exists.

#### Scenario: The provider returns a temporary link

- **WHEN** the image provider's response is a temporary link
- **THEN** the image is downloaded and stored in the project folder before the stage is marked successful

#### Scenario: The download fails after a successful provider response

- **WHEN** the provider responds successfully but the temporary link cannot be downloaded
- **THEN** the attempt is recorded as failed
- **AND** the chunk does not reach `image-complete`

### Requirement: A successful generation completes the image stage

When a valid image has been persisted locally, the system SHALL record its path on the chunk and set the chunk's image stage to `image-complete`.

#### Scenario: Generation succeeds

- **WHEN** a valid image is generated and persisted for a chunk
- **THEN** the chunk's image result path is recorded
- **AND** the chunk's image stage is `image-complete`

### Requirement: Video generation cannot be requested before the image is complete

The system SHALL NOT allow a video-generation request for a chunk whose image stage has not reached `image-complete`.

#### Scenario: Video is requested before the image exists

- **WHEN** a video-generation request is attempted for a chunk not yet in `image-complete`
- **THEN** the request is refused

### Requirement: An exhausted image stage can be corrected

When a chunk's image stage is `failed`, the system SHALL allow the User to either retry with the same `IMAGE` instruction or replace `IMAGE` with a new instruction and retry. The chunk's `ID`, `PROMPT`, and its position in the scene order SHALL remain unchanged by this or any other operation.

#### Scenario: A retry with the same instruction is requested

- **WHEN** the User retries a failed image stage without changing `IMAGE`
- **THEN** a new attempt is made with the same instruction

#### Scenario: The instruction is corrected

- **WHEN** the User replaces `IMAGE` on a chunk whose image stage is `failed`
- **THEN** the new instruction is stored
- **AND** a new attempt is made with it

#### Scenario: The correction form is unavailable outside failure

- **WHEN** a chunk's image stage is not `failed`
- **THEN** no operation offers a way to change its `IMAGE` instruction

#### Scenario: A correction attempts to change a locked field

- **WHEN** a request to correct a chunk's `IMAGE` also attempts to change its `ID`, `PROMPT`, or position in the scene order
- **THEN** only `IMAGE` is affected
- **AND** `ID`, `PROMPT`, and the scene order are unchanged

### Requirement: One chunk's image failure does not affect other chunks

When a chunk's image stage reaches `failed`, other chunks of the same session SHALL continue processing toward their own `chunk-complete` or `failed` outcome, unaffected by that chunk's failure.

#### Scenario: One chunk fails while others are in progress

- **WHEN** one chunk's image stage reaches `failed`
- **THEN** the other chunks of the session continue processing independently

### Requirement: A successful image can be downloaded individually during processing

The system SHALL offer a completed chunk's image for individual download while other chunks of the same session are still processing or have failed.

#### Scenario: Other scenes are still processing

- **WHEN** a chunk reaches `image-complete` while other chunks of the session are still generating or have failed
- **THEN** that chunk's image is available for individual download

### Requirement: The image stage's diagnostics are recorded without exposing credentials

The system SHALL record the provider used, the attempts made, the status, and — when failed — the cause and its retryability for a chunk's image stage, visible in that chunk's details. The recorded cause SHALL NOT include credentials or raw provider payloads.

#### Scenario: A chunk's image details are consulted

- **WHEN** a chunk's details are read
- **THEN** its image stage shows the provider used, the attempts made, and its current status

#### Scenario: A provider error contains sensitive detail

- **WHEN** an image provider error includes credentials or a raw payload
- **THEN** none of it appears in the cause shown to the User

### Requirement: Image generation is scoped to its own session

The system SHALL NOT generate, expose, or persist an image against a chunk belonging to a different session than the one the request identifies.

#### Scenario: Two sessions each have a chunk with the same identifier

- **WHEN** an image-generation result is being recorded for a chunk
- **THEN** it is attributed only to the chunk's own session, even if another session has a chunk with the same identifier
