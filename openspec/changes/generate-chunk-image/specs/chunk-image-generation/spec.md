# Chunk image generation

Requirements for turning a chunk's `IMAGE` instruction into a stored image (JOS-145, US-12). This capability does not cover the retry budget, the per-phase time limit, the concurrency cap, the pause hold, correcting a failed instruction, individual downloads, or showing diagnostics. Those belong to their own capabilities and tickets. This capability covers when generation launches, what output is accepted, how the result is persisted, how chunks progress independently, and how the provider is bound to a chunk's image stage.

## ADDED Requirements

### Requirement: Image generation launches automatically for a submitted chunk

The system SHALL launch image generation for a chunk in state `submitted` that has a non-empty `IMAGE` instruction, without further action from the User, through the shared phase-launch gate. The chunk SHALL be in state `image-generating` before the request is sent to the image provider. The request SHALL carry the chunk's `IMAGE` instruction as its text.

#### Scenario: A submitted chunk starts image generation

- **GIVEN** a chunk in state `submitted` with a non-empty `IMAGE` instruction
- **WHEN** its image generation starts
- **THEN** the chunk state is `image-generating`
- **AND** the provider request carries that chunk's `IMAGE` instruction

#### Scenario: The state change comes before the provider request

- **GIVEN** a chunk in state `submitted`
- **WHEN** the image provider receives the request
- **THEN** the chunk was already recorded as `image-generating`

#### Scenario: The session is paused

- **GIVEN** a paused session with a chunk in state `submitted`
- **WHEN** image generation would launch
- **THEN** no provider request is sent and the chunk remains `submitted` until the session continues

### Requirement: Only a horizontal 16:9 image of at least 1920×1080 is accepted

The system SHALL accept a generated image only if, measured from the stored file, its width is at least 1920 pixels, its height is at least 1080 pixels, and its aspect ratio differs from 16:9 by at most 1%. An image that fails this check SHALL be recorded as a failed attempt and SHALL NOT complete the stage.

#### Scenario: The recorded provider size is accepted

- **GIVEN** the provider returns a 1920×1088 image
- **WHEN** the image is checked
- **THEN** it is accepted, since its aspect ratio is 0.74% from 16:9

#### Scenario: An under-size image is rejected

- **GIVEN** the provider returns a 1024×576 image
- **WHEN** the image is checked
- **THEN** the attempt is recorded as failed
- **AND** the chunk does not reach `image-complete`

#### Scenario: A portrait image is rejected

- **GIVEN** the provider returns a 1080×1920 image
- **WHEN** the image is checked
- **THEN** the attempt is recorded as failed
- **AND** the chunk does not reach `image-complete`

### Requirement: A successful generation completes the image stage

When an accepted image has been stored in the session's project folder, the system SHALL record its path relative to that folder on the chunk and set the chunk state to `image-complete`. A repeated success confirmation for the same chunk SHALL NOT create a second result.

#### Scenario: Generation succeeds

- **GIVEN** a chunk in state `image-generating`
- **WHEN** an accepted image is stored for it
- **THEN** the chunk's result is the image's path relative to the session's project folder
- **AND** the chunk state is `image-complete`

#### Scenario: The success is confirmed twice

- **GIVEN** a chunk that has reached `image-complete`
- **WHEN** the same success is delivered again
- **THEN** the chunk keeps exactly one result, and its state is unchanged

### Requirement: A temporary link is stored locally before the stage succeeds

When the image provider returns the result only as a temporary link, the system SHALL download and store the image in the session's project folder before the chunk is set to `image-complete`. The recorded result SHALL never be the provider's link.

#### Scenario: The provider returns a temporary link

- **GIVEN** the provider's successful response is a temporary link
- **WHEN** the chunk reaches `image-complete`
- **THEN** the image file exists in the session's project folder
- **AND** the chunk's result refers to that file, not to the link

#### Scenario: The download fails after a successful provider response

- **GIVEN** the provider responds successfully with a temporary link
- **WHEN** the link cannot be downloaded
- **THEN** the attempt is recorded as failed
- **AND** the chunk does not reach `image-complete`

### Requirement: Each chunk's image stage progresses independently

A chunk SHALL advance from `image-generating` as soon as its own image outcome is known, without waiting for any other chunk of the same session. One chunk's image failure SHALL NOT change the state or processing of any other chunk.

#### Scenario: One scene finishes while another is still generating

- **GIVEN** two chunks of the same session in state `image-generating`
- **WHEN** the first chunk's image is accepted while the second is still generating
- **THEN** the first chunk is `image-complete`
- **AND** the second chunk is still `image-generating`

#### Scenario: One scene fails while another is still generating

- **GIVEN** two chunks of the same session in state `image-generating`
- **WHEN** the first chunk's image stage reaches `failed`
- **THEN** the second chunk keeps processing and can still reach `image-complete`

### Requirement: The provider is bound to the chunk's image stage

On the first attempt of a chunk's image stage, the system SHALL record the image provider used as that chunk's image-stage provider. Every later automatic or manual retry of that stage SHALL be sent to the recorded provider, regardless of the provider currently configured. If the recorded provider is unavailable in the running build, the attempt SHALL fail without switching to another provider.

#### Scenario: The first attempt binds the provider

- **GIVEN** a chunk whose image stage has no provider recorded
- **WHEN** its first image attempt is sent to a provider
- **THEN** that provider is recorded for the chunk's image stage

#### Scenario: A retry uses the bound provider

- **GIVEN** a chunk whose image stage is bound to provider A
- **AND** the currently configured image provider is B
- **WHEN** the stage is retried
- **THEN** the attempt is sent to provider A

#### Scenario: The bound provider is unavailable in the running build

- **GIVEN** a chunk whose image stage is bound to a provider the running build has no adapter for
- **WHEN** the stage is retried
- **THEN** the attempt fails and no other provider is called

### Requirement: Image generation is scoped to its own session

The system SHALL store and attribute an image result only to the chunk of the session that owns it, and only inside that session's project folder.

#### Scenario: Two sessions each have a chunk with the same identifier

- **GIVEN** two sessions that each contain a chunk with the same identifier
- **WHEN** one of them receives an image result
- **THEN** only that session's chunk is updated, and the file is stored in that session's project folder
