## ADDED Requirements

### Requirement: Retry a failed clip without regenerating its image

The existing scene retry command SHALL accept a scene only when it belongs to the requested session, is `failed` at the video stage, has a stored image, and has no committed clip. It SHALL return the scene to the existing video-stage launch state and start a fresh manual retry cycle. The video stage SHALL resend the stored `VIDEO` instruction to the provider bound on the first video attempt. It SHALL preserve the image, every other scene, and all scene content and timing fields. A manual retry SHALL remain available after a failed video attempt even when that failure was classified as not retryable for automatic retries; the automatic retry policy SHALL remain unchanged. Concurrent commands SHALL cause at most one accepted transition and one video launch. New work SHALL pass through the session launch gate.

#### Scenario: Retry uses the same instruction and provider
- **GIVEN** a scene failed at the video stage after its image succeeded, with `VIDEO` "A slow aerial orbit" and video provider A bound
- **AND** the configured default video provider is now B
- **WHEN** the User retries the scene
- **THEN** the command answers 200 and the next video request uses exactly "A slow aerial orbit" with provider A
- **AND** the scene's image and provider binding are unchanged

#### Scenario: Retry preserves the image and other scenes
- **GIVEN** a session with a failed video scene and other scenes with stored results
- **WHEN** the User retries the failed clip
- **THEN** only that scene's video stage runs
- **AND** its image result, scene identity, `PROMPT`, `IMAGE`, `VIDEO`, order, narration interval, requested duration and speed factor remain unchanged
- **AND** every other scene remains unchanged

#### Scenario: Concurrent clip retries
- **GIVEN** a scene failed at the video stage
- **WHEN** two retry commands for that scene arrive concurrently
- **THEN** at most one answers 200
- **AND** the other answers 409
- **AND** the video provider receives at most one new request

#### Scenario: Retry is held while the session is paused
- **GIVEN** a scene failed at the video stage in a paused session
- **WHEN** the User retries the scene
- **THEN** the scene returns to the video launch state without sending a provider request
- **AND** the live session update reports the new held state
- **AND** the request is sent only after the User continues the session

#### Scenario: Retry is refused outside a failed video stage
- **GIVEN** a scene that is not failed at the video stage, or whose clip is already committed
- **WHEN** the User retries the scene
- **THEN** the command answers 409 and changes nothing or launches nothing

### Requirement: Correct only `VIDEO` and retry the failed clip

The existing scene correction command SHALL accept a correction only for a scene in the requested session that is failed at the video stage, has a stored image, and has no committed clip. A body whose `instruction` trims to an empty value SHALL be rejected with 400. Otherwise, one conditional write SHALL store the trimmed value in `video_instruction` and return the scene to the video-stage launch state. The next attempt SHALL use that corrected instruction and the already-bound video provider. No other content, result, timing, provider binding, or scene SHALL change; normal status, timestamp, and retry-cycle bookkeeping may change. A lost race SHALL return 409 without launching work.

#### Scenario: Corrected instruction is sent to the bound provider
- **GIVEN** a scene failed at the video stage with provider A already bound
- **WHEN** the User corrects `VIDEO` to "  A gentle push-in  "
- **THEN** the command answers 200, stores "A gentle push-in" as `VIDEO`, and retries the clip with provider A

#### Scenario: Correction changes only `VIDEO`
- **GIVEN** a failed video scene with its scene identity, `PROMPT`, `IMAGE`, image result, timing fields and order recorded
- **WHEN** the User corrects its `VIDEO` instruction
- **THEN** only `VIDEO`, state, and retry-cycle bookkeeping change
- **AND** the image result, provider binding, every other recorded scene field and every other scene remain unchanged

#### Scenario: Blank correction is refused
- **WHEN** the User submits an empty or whitespace-only video instruction
- **THEN** the command answers 400 and the scene and provider are unchanged

#### Scenario: A concurrent correction loses safely
- **GIVEN** a scene failed at the video stage
- **WHEN** two correction commands race to update it
- **THEN** at most one correction is accepted and launches a video attempt
- **AND** the losing command answers 409 without overwriting the winning instruction

### Requirement: Offer clip recovery only for a failed video stage

The scene details page SHALL offer retry and `VIDEO` correction only when the scene is failed at the video stage. The correction form SHALL be pre-filled with the stored `VIDEO` instruction, and its accessible name SHALL identify the scene and the video instruction. For all other scene states or failed stages, the page SHALL NOT offer clip-recovery controls. A refusal SHALL be presented as a readable sentence, not a raw reason code, and a successful state change SHALL arrive through the live session update.

#### Scenario: Failed clip offers retry and video correction
- **GIVEN** a scene failed at the video stage with a stored `VIDEO` instruction
- **WHEN** the User opens its details
- **THEN** the page offers retry and a video-correction form pre-filled with `VIDEO`
- **AND** it offers no image correction form

#### Scenario: Other states do not offer clip recovery
- **GIVEN** a scene that is not failed at the video stage
- **WHEN** the User opens its details
- **THEN** no clip retry or `VIDEO` correction control is present

#### Scenario: Refusal is readable
- **GIVEN** a clip-recovery command is refused with 404 or 409
- **WHEN** the response is shown
- **THEN** the page displays a user-readable sentence and does not display the raw reason code