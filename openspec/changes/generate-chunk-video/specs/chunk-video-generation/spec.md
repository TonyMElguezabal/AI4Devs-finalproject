# Chunk video generation

Requirements for turning a chunk's stored image and `VIDEO` instruction into a stored clip (JOS-146, US-13; PRD §5 step 7, §7.1, §7.2, §8.2, §11.2, §12.1, §12.2, AC05). The requested duration is chosen by JOS-147. Recording the speed factor belongs to JOS-148, manual retry and correction after a clip failure to JOS-158, and the real retry budget, time limit and concurrency cap to JOS-184/154, JOS-185 and JOS-167.

## ADDED Requirements

### Requirement: No clip is requested without an available image

The video stage SHALL start only for a chunk in `image-complete` whose stored image file can be read from the session's project folder (§7.1). A chunk in any other state SHALL NOT have a clip request sent. A chunk in `image-complete` whose image file cannot be read SHALL fail its video stage with a not-retryable cause naming the missing image, and SHALL NOT send any provider request. The image SHALL NOT be regenerated (§11.2).

#### Scenario: A chunk still generating its image sends no clip request

- **GIVEN** a chunk in `image-generating`
- **WHEN** clip generation would be launched for it
- **THEN** no request is sent to the video provider and the chunk stays `image-generating`

#### Scenario: A failed image stage sends no clip request

- **GIVEN** a chunk in `failed` whose affected stage is `image`
- **WHEN** clip generation would be launched for it
- **THEN** no request is sent to the video provider

#### Scenario: The stored image file is missing

- **GIVEN** a chunk in `image-complete` whose image file has been removed from the project folder
- **WHEN** clip generation is launched
- **THEN** no request is sent to the video provider, the chunk is `failed` with affected stage `video`, and the cause names the missing image and says it is not retryable

### Requirement: Clip generation launches from `image-complete` and uses the image and the `VIDEO` instruction

A chunk that reaches `image-complete` SHALL start clip generation without User action, through the phase-launch gate the image stage uses: a concurrency slot of the `video` stage and the session pause. The chunk SHALL be `video-generating` before the provider request is sent. The request SHALL carry the chunk's stored image, its `VIDEO` instruction exactly as registered, and the requested duration chosen by JOS-147. Each chunk SHALL progress on its own: a chunk's clip does not wait for any other chunk's image or clip.

#### Scenario: Launch after the image completes

- **GIVEN** a chunk whose image stage has just completed
- **WHEN** the image result is committed
- **THEN** the chunk is `video-generating` before the video provider is called

#### Scenario: The request carries the image and the `VIDEO` instruction

- **GIVEN** a chunk in `image-complete` with the `VIDEO` instruction "Slow push-in on the lighthouse as waves break"
- **WHEN** its clip is requested
- **THEN** the provider receives that chunk's stored image, exactly that instruction, and the duration JOS-147 selected for the chunk

#### Scenario: A paused session holds the clip

- **GIVEN** a paused session with a chunk in `image-complete`
- **WHEN** the chunk would start its clip
- **THEN** no request is sent and the chunk stays `image-complete` until the session continues

#### Scenario: Chunks progress independently

- **GIVEN** chunk 1 in `video-generating` and chunk 2 whose image has just completed
- **WHEN** chunk 2's image result is committed
- **THEN** chunk 2 starts its clip without waiting for chunk 1

### Requirement: A stored clip completes the chunk

A clip returned by the provider SHALL be written to the session's project folder before the stage succeeds. When the provider returns a temporary link, the file SHALL be downloaded first; the stored path SHALL never be the link (§12.2). A clip that cannot be downloaded or written, or whose file is not an MP4, SHALL count as a failed attempt of the video stage. A stored clip SHALL move the chunk to `chunk-complete`, and the chunk's image SHALL remain as it was. A repeated delivery of the same success SHALL NOT store a second clip.

#### Scenario: Clip stored and chunk complete

- **GIVEN** a chunk in `video-generating`
- **WHEN** the provider returns a valid clip
- **THEN** the clip is stored under the session's project folder, the chunk records its relative path, the chunk is `chunk-complete`, and its image path is unchanged

#### Scenario: A temporary link is downloaded first

- **GIVEN** a provider result that is a temporary URL
- **WHEN** the stage completes
- **THEN** the clip file exists in the project folder before the chunk is `chunk-complete`, and the recorded path is relative, not the URL

#### Scenario: A failed download is a failed attempt

- **GIVEN** a provider result whose download fails
- **WHEN** the result is processed
- **THEN** the chunk does not reach `chunk-complete` and the failure counts as one attempt of the video stage

#### Scenario: A file that is not an MP4 is refused

- **GIVEN** a provider result whose downloaded file is not an MP4
- **WHEN** the result is processed
- **THEN** no clip is recorded and the failure counts as one attempt of the video stage

#### Scenario: A duplicate success delivery

- **GIVEN** a chunk already `chunk-complete`
- **WHEN** the same provider result is delivered again
- **THEN** no second clip is stored and the chunk's state and paths are unchanged

### Requirement: Clip failures belong to the video stage

A failure while generating a chunk's clip SHALL be attributed to the video stage (§8.2): the chunk's `affectedStage` SHALL be `video`, and its stored image SHALL be kept. An automatic retry of a transient clip failure SHALL repeat only the video stage, with the skeleton's retry budget counted for the video stage alone. A not-retryable clip failure SHALL skip automatic retries. Until JOS-158 lands, a manual retry or a correction requested for a chunk whose video stage failed SHALL be refused, and SHALL NOT change the chunk.

#### Scenario: A transient failure retries the clip, not the image

- **GIVEN** a chunk in `video-generating` whose first clip attempt fails transiently
- **WHEN** the failure is applied
- **THEN** the video stage is attempted again with attempt number 2 of the video stage, and no image request is sent

#### Scenario: Exhausted retries fail the video stage

- **GIVEN** a chunk whose clip fails transiently on every attempt
- **WHEN** the video stage's retry budget is exhausted
- **THEN** the chunk is `failed`, its `affectedStage` is `video`, and its image path is unchanged

#### Scenario: The image stage's attempts do not use up the clip's budget

- **GIVEN** a chunk whose image succeeded on its third attempt
- **WHEN** its first clip attempt is sent
- **THEN** it is attempt 1 of the video stage

#### Scenario: Manual retry of a clip failure is refused for now

- **GIVEN** a chunk `failed` at the video stage
- **WHEN** the User asks for a manual retry or a correction
- **THEN** the request is refused with a reason saying clip retry is not available yet, and the chunk, its image and its instructions are unchanged

### Requirement: The video provider is bound to the chunk's video stage

The first attempt of a chunk's video stage SHALL record the video provider it uses as the chunk's video-stage provider (§11.2), separately from the image-stage provider. Every later attempt of that chunk's video stage SHALL use the recorded provider, not the one currently configured. An attempt whose recorded provider has no adapter in the running build SHALL fail with a not-retryable cause, with no silent switch to another provider.

#### Scenario: Binding on the first attempt

- **GIVEN** a chunk in `image-complete` with no video-stage provider recorded
- **WHEN** its first clip attempt is sent
- **THEN** the chunk's video-stage provider is recorded, and its image-stage provider is unchanged

#### Scenario: A retry uses the bound provider

- **GIVEN** a chunk whose video stage is bound to provider A, and a build whose configured video provider is now B
- **WHEN** the video stage is retried automatically
- **THEN** the attempt is sent to provider A

#### Scenario: A bound provider with no adapter

- **GIVEN** a chunk whose video stage is bound to a provider this build has no adapter for
- **WHEN** the video stage is attempted
- **THEN** no request is sent and the chunk fails its video stage with a not-retryable cause naming the provider

### Requirement: An interrupted clip resumes after a restart

A chunk left in `video-generating` when the application stops SHALL be reconciled on boot by asking the bound provider for the request's result (§12.1): a finished result SHALL be applied as a normal delivery; a request the provider no longer holds SHALL count as one failed attempt of the video stage and follow the retry rule; a request still in progress SHALL keep being followed. An attempt that has not finished within the recorded video phase limit SHALL count as a failed transient attempt.

#### Scenario: The clip finished while the application was down

- **GIVEN** a chunk in `video-generating` whose provider request succeeded while the application was stopped
- **WHEN** the application boots
- **THEN** the clip is stored and the chunk is `chunk-complete`

#### Scenario: The provider no longer holds the request

- **GIVEN** a chunk in `video-generating` whose provider request is unknown to the provider after a restart
- **WHEN** the application boots
- **THEN** one failed attempt of the video stage is recorded and the retry rule decides the next step

#### Scenario: A clip exceeds the phase limit

- **GIVEN** a clip attempt still unfinished at the recorded video phase limit
- **WHEN** the limit is reached
- **THEN** the attempt counts as a failed transient attempt of the video stage
