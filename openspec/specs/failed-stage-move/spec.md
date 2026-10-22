# failed-stage-move Specification

## Purpose
TBD - created by archiving change move-failed-stage-to-active-provider. Update Purpose after archive.
## Requirements
### Requirement: Failed stages on a provider other than the active one are listed on /admin

`/admin` SHALL list every stage that is failed and bound to a provider other than the current active provider of its stage type, with an action to move it to the current active provider. Each entry SHALL show the session, the stage (voice, reasoning, alignment, image or video), the scene for an image or a video stage, the provider the stage is bound to, the current active provider and the cause of the failure. A stage already bound to the active provider, a stage that has not failed, and a stage with no bound provider SHALL NOT be listed. A session-level stage whose failure offers no manual retry SHALL NOT be listed.

#### Scenario: A failed clip on another provider

- **GIVEN** a scene whose video stage is `failed` and bound to `stub-a`, while the active video provider is `stub-b`
- **WHEN** the Administrator opens `/admin`
- **THEN** the stage is listed with the session, "scene 2", `stub-a` as its provider, `stub-b` as the active provider, the cause, and the action to move it

#### Scenario: A failed stage already on the active provider

- **GIVEN** a failed voice stage bound to `stub-b` while the active voice provider is `stub-b`
- **WHEN** the Administrator opens `/admin`
- **THEN** the stage is not listed

#### Scenario: A stage that did not fail

- **GIVEN** a scene whose image stage is generating on `stub-a` while the active image provider is `stub-b`
- **WHEN** the Administrator opens `/admin`
- **THEN** the stage is not listed

#### Scenario: A failure that offers no manual retry

- **GIVEN** a session whose voice stage failed with a cause that is not retryable, bound to `stub-a`, while the active voice provider is `stub-b`
- **WHEN** the Administrator opens `/admin`
- **THEN** the stage is not listed

### Requirement: Only the Administrator can move a failed stage

Moving a failed stage SHALL require Administrator access to `/admin` (JOS-173). Without it, the request SHALL be refused and nothing SHALL change.

#### Scenario: Move without Administrator access

- **GIVEN** a person who has not entered the Administrator password
- **WHEN** they request to move a failed stage
- **THEN** the request is refused as unauthorized
- **AND** the stage stays bound to its provider

### Requirement: A move binds the stage to the current active provider and sends nothing

Moving a failed stage SHALL bind that one stage instance to the provider that is active for its stage type at that moment. The move SHALL NOT send a request, start an attempt or change the stage's state; the stage SHALL stay failed until it is retried.

#### Scenario: Move a failed image stage

- **GIVEN** a scene whose image stage is `failed` and bound to `stub-a`, while `stub-b` is active
- **WHEN** the Administrator moves it
- **THEN** the scene is bound to `stub-b`
- **AND** no request is sent and the scene is still `failed`

#### Scenario: The active provider changes after the move

- **GIVEN** a stage moved to `stub-b`
- **WHEN** the Administrator then changes the active provider to `stub-c`
- **THEN** the stage is still bound to `stub-b`

### Requirement: The retry after a move uses the new provider

The next retry of a moved stage, automatic or manual, SHALL be sent to the provider the stage was moved to, for every stage kind. The attempts recorded before the move SHALL keep the provider they ran on.

#### Scenario: Manual retry of a moved voice stage

- **GIVEN** a session whose voice stage failed on `stub-a` and was moved to `stub-b`
- **WHEN** the User retries the voice-over
- **THEN** the new attempt is recorded for and sent to `stub-b`
- **AND** the earlier attempts still record `stub-a`

#### Scenario: Manual retry of a moved image stage

- **GIVEN** a scene whose image stage failed on `stub-a` and was moved to `stub-b`
- **WHEN** the User retries the scene
- **THEN** the request is sent to `stub-b` and nothing is sent to `stub-a`

#### Scenario: A moved reasoning stage

- **GIVEN** a session that failed in decomposition after its narration timestamps were stored, bound to `stub-a` for reasoning, and moved to `stub-b`
- **WHEN** the User retries the decomposition
- **THEN** the visual instructions are requested from `stub-b`

### Requirement: Completed results are kept

Moving a failed stage SHALL NOT regenerate, invalidate or re-request any completed result of the session or its scenes: the voice-over, the narration timestamps, the chunks, the images and the clips already produced.

#### Scenario: Other scenes of the session

- **GIVEN** a session with one scene whose clip is complete and one scene whose clip failed on `stub-a`
- **WHEN** the Administrator moves the failed clip to `stub-b`
- **THEN** the complete scene, its image and its clip are unchanged and no request is sent for them

### Requirement: A moved clip chooses its duration again from the new provider

Moving a failed video stage SHALL choose the clip's requested duration again from the admitted durations of the provider it is moved to, using the rule that gives the smallest speed change for the chunk's narration interval, and SHALL record the duration warning, the speed-adjustment factor and the speed-factor warning that follow from it. The chunk, its narration interval, its instructions and its image SHALL stay unchanged.

#### Scenario: The new provider admits other durations

- **GIVEN** a chunk with an 8 s interval and a stored requested duration of 8 s, whose clip failed on a provider admitting 5 to 15 s
- **WHEN** it is moved to a provider admitting 5 to 7 s
- **THEN** its requested duration becomes 7 s, its speed-adjustment factor 8/7 (about 1.14) and its duration warning `exceeds-maximum`
- **AND** its narration interval, instructions and image are unchanged

#### Scenario: An interval beyond the new maximum

- **GIVEN** a chunk with a 14 s interval whose clip failed on a provider admitting 5 to 15 s
- **WHEN** it is moved to a provider admitting 5 to 10 s
- **THEN** its requested duration becomes 10 s with the `exceeds-maximum` warning

#### Scenario: Only a failed clip with no result changes

- **GIVEN** a chunk whose clip is complete
- **WHEN** a move of that stage is requested
- **THEN** the request is refused as not failed and its requested duration and speed factor are unchanged

### Requirement: A move is refused when it would not apply

A move request SHALL be refused, and SHALL change nothing, when the session or the scene does not exist, when the stage is no longer failed, when it is already bound to the active provider, when a retry of it is scheduled or in flight, when its failure offers no manual retry, or when the active provider is not usable. Each refusal SHALL say which of these it is.

#### Scenario: The stage was retried meanwhile

- **GIVEN** the Administrator's page lists a failed stage, and the User retries it before the Administrator moves it
- **WHEN** the Administrator requests the move
- **THEN** it is refused because a retry is in progress or the stage is no longer failed
- **AND** the stage's binding is unchanged

#### Scenario: The active provider has no usable key

- **GIVEN** the active image provider has no API key that can be found
- **WHEN** the Administrator moves a failed image stage
- **THEN** the move is refused as not usable and the stage stays bound to its provider

### Requirement: Nothing moves automatically

The system SHALL NOT move a stage to another provider by itself, when its retries are exhausted or for any other reason; only the Administrator's explicit move changes a bound stage's provider.

#### Scenario: Retries exhausted

- **GIVEN** a scene whose image stage is bound to `stub-a` while `stub-b` is active
- **WHEN** the fourth attempt of its cycle fails
- **THEN** the scene is `failed` and still bound to `stub-a`

