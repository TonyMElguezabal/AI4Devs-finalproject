# image-failure-recovery

Requirements for retrying a scene's failed image, or correcting only its `IMAGE` instruction and retrying (PRD §3, §10.2, §10.3 image row, §11.2, §12.3, AC09; US-25). The image stage is owned by `image-generation` (US-12), scene details by `scene-detail-view` (US-19), and retry cycles by `stage-retry-policy` (US-22).

## ADDED Requirements

### Requirement: Scene commands act only within their session

`POST /sessions/:sessionId/scenes/:sceneId/retry` and `POST /sessions/:sessionId/scenes/:sceneId/correct` SHALL look up the scene by both identifiers. An unknown session, an unknown scene, or a scene that belongs to another session SHALL answer 404 identically, and SHALL change nothing and launch nothing (§12.3, AC22).

#### Scenario: Scene of another session

- **GIVEN** session A with a failed scene S, and session B
- **WHEN** a retry or a correction is requested at `/sessions/B/scenes/S/…`
- **THEN** the command answers 404, and scene S is unchanged and not launched

### Requirement: A failed image can be retried with the same instruction and provider

A retry SHALL be accepted only for a scene that is `failed` with no stored image. An accepted retry SHALL return the scene to `submitted` and launch its image stage. The stage SHALL send the scene's stored `IMAGE` instruction unchanged, to the image provider bound on the scene's first image attempt, without binding or switching it (§10.3, §11.2). The retry SHALL open a fresh retry budget for the image stage (§10.2). The retry SHALL go through the launch gate, so a paused session holds it with the scene in `submitted`.

#### Scenario: Retry sends the same instruction

- **GIVEN** a scene `failed` at the image stage with `IMAGE` "A lighthouse at dusk, oil painting"
- **WHEN** the User retries it
- **THEN** the command answers 200, and the image provider receives exactly "A lighthouse at dusk, oil painting"

#### Scenario: Retry uses the bound provider

- **GIVEN** a scene whose first image attempt bound provider A, and whose configured default is now provider B
- **WHEN** the User retries it
- **THEN** the request goes to provider A and the scene's binding is still A

#### Scenario: Fresh budget

- **GIVEN** a scene `failed` after exhausting its image attempts
- **WHEN** the User retries it and the next attempts fail transiently
- **THEN** it gets a full budget of attempts again before it returns to `failed`

#### Scenario: Concurrent retries

- **GIVEN** a scene `failed` at the image stage
- **WHEN** two retry requests arrive at once
- **THEN** exactly one answers 200, the other answers 409 with `not-failed`, and the image stage is launched once

### Requirement: A correction changes only `IMAGE`

A correction SHALL be accepted only for a scene that is `failed` with no stored image, with a body `{ instruction }` whose trimmed value is not empty. In one write that applies only while those conditions hold, it SHALL set the scene's `IMAGE` instruction to the trimmed value and return the scene to `submitted`. Its next image attempt SHALL send the corrected instruction. The correction SHALL NOT change any of: the scene's `ID`, `PROMPT`, `VIDEO` instruction, narration interval, requested duration, speed factor, bound provider, or position in the narrative order, nor any other scene (§3, §10.3, AC09). A scene created without an `IMAGE` instruction (the skeleton stub stage) SHALL have its stage's legacy instruction corrected instead.

#### Scenario: Correct and retry

- **GIVEN** a scene `failed` at the image stage
- **WHEN** the User corrects its instruction to "  A lighthouse at night  "
- **THEN** the command answers 200, the scene's `IMAGE` is "A lighthouse at night", and the image provider receives "A lighthouse at night"

#### Scenario: Only `IMAGE` changes

- **GIVEN** a scene `failed` at the image stage, with its other fields recorded
- **WHEN** the User corrects its instruction
- **THEN** its `ID`, `PROMPT`, `VIDEO`, narration interval, requested duration, speed factor and bound provider are unchanged
- **AND** every other scene of the session is unchanged and the scene order is the same

#### Scenario: Blank instruction

- **WHEN** a correction is requested with an instruction that is empty or only whitespace
- **THEN** the command answers 400 and the scene is unchanged

#### Scenario: Extra field in the correction body

- **WHEN** a correction is requested with a body field other than `instruction`
- **THEN** the extra field is ignored and the command proceeds as if it were absent, following the same "an operation ignores locked fields" rule every other chunk-mutating route uses

### Requirement: No image action once the image succeeded

A retry or correction SHALL be refused with 409 for a scene that is not `failed` (`not-failed`), and for a failed scene that has a stored image, meaning its clip failed (`image-already-generated`). A refusal SHALL change nothing and launch nothing. The page SHALL NOT offer image retry or `IMAGE` correction for such a scene (§3, AC09).

#### Scenario: Image generated, clip failed

- **GIVEN** a scene whose image is stored and whose clip failed
- **WHEN** an image retry or correction is requested
- **THEN** the command answers 409 with `image-already-generated` and the scene is unchanged

#### Scenario: Image generated, scene still processing

- **GIVEN** a scene in `image-complete`, `video-generating` or `chunk-complete`
- **WHEN** an image retry or correction is requested
- **THEN** the command answers 409 with `not-failed`

#### Scenario: Nothing offered on the page

- **GIVEN** a scene in any state other than `failed` at the image stage
- **WHEN** its details are shown
- **THEN** no image retry button and no `IMAGE` correction form are shown

### Requirement: The page shows and edits the `IMAGE` instruction

The scene details SHALL show the scene's `PROMPT`, `IMAGE` and `VIDEO`. For a scene failed at the image stage, the correction form SHALL be pre-filled with the current `IMAGE` instruction. A refusal (404 or 409) SHALL be shown on the scene's row as a readable sentence. The scene's new state SHALL come from the live update.

#### Scenario: Form pre-filled with `IMAGE`

- **GIVEN** a scene `failed` at the image stage with `IMAGE` "A lighthouse at dusk"
- **WHEN** the User expands its details
- **THEN** the correction form is pre-filled with "A lighthouse at dusk", and `PROMPT` and `VIDEO` are shown read-only

#### Scenario: Refusal shown

- **GIVEN** a retry answered 409 with `not-failed`
- **WHEN** the answer arrives
- **THEN** the row shows a sentence saying the scene is no longer failed
