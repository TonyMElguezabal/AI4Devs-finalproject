# session-phase-progress

Requirements for what the session read says about each processing phase, and what the session page shows per phase (PRD §8.1, §8.3, AC21; US-18). Per-scene details are owned by `scene-detail-view` (US-19). The paused marker and held work are owned by `session-pause` (US-20). Diagnostics are owned by US-34.

## ADDED Requirements

### Requirement: The session read lists the four phases in pipeline order

The session representation SHALL include `phases`. It SHALL list exactly four entries, in this order: `voice-over`, `decomposition`, `scenes`, `assembly`. Each entry SHALL carry `phase`, `status` and `heldCount`. `status` SHALL be one of `pending`, `in-progress`, `complete`, `failed`. `phases` SHALL be derived on every read from the same derivation as the session state, and SHALL never be stored. The same value SHALL be part of every live-update snapshot.

#### Scenario: A newly registered session

- **GIVEN** a session in `submitted`
- **WHEN** it is read
- **THEN** `phases` lists `voice-over`, `decomposition`, `scenes`, `assembly` in that order, each `pending` with `heldCount` 0

#### Scenario: Each in-progress state marks its own phase

- **GIVEN** a session whose derived state is `voice-over-generating`, `chunk-decomposing`, `chunks-processing` or `final-video-generating`
- **WHEN** it is read
- **THEN** the phase of that state (voice-over, decomposition, scenes, assembly respectively) is `in-progress`
- **AND** every earlier phase is `complete` and every later phase is `pending`

#### Scenario: A completed narration awaiting decomposition

- **GIVEN** a session in `voice-over-complete`
- **WHEN** it is read
- **THEN** `voice-over` is `complete` and the other three phases are `pending`

#### Scenario: A finished session

- **GIVEN** a session in `final-video`
- **WHEN** it is read
- **THEN** all four phases are `complete`

#### Scenario: The live snapshot carries the same phases

- **GIVEN** an open live-update subscription to a session
- **WHEN** the session's state changes and a snapshot is published
- **THEN** the snapshot's `phases` equals what a session read returns at that moment

### Requirement: A failed session identifies the phase that failed

When the session derives `failed`, the entry whose `phase` equals `failedPhase` SHALL be `failed`, every earlier phase SHALL be `complete`, and every later phase SHALL be `pending`. Exactly one phase SHALL be `failed`. A `failed` session SHALL always carry a `failedPhase` that names one of the four phases (§8.1).

#### Scenario: Voice-over failed

- **GIVEN** a session with no scenes and a recorded voice-over failure
- **WHEN** it is read
- **THEN** the state is `failed`, `failedPhase` is `voice-over`, `voice-over` is `failed` and the other phases are `pending`

#### Scenario: Decomposition failed

- **GIVEN** a session with a completed voice-over, no scenes and a recorded decomposition failure
- **WHEN** it is read
- **THEN** `voice-over` is `complete`, `decomposition` is `failed`, and `scenes` and `assembly` are `pending`

#### Scenario: Scenes failed

- **GIVEN** a session whose scenes are all `chunk-complete` or `failed`, with at least one `failed`
- **WHEN** it is read
- **THEN** `voice-over` and `decomposition` are `complete`, `scenes` is `failed`, and `assembly` is `pending`

#### Scenario: A failed scene beside one still generating

- **GIVEN** a session with one scene `failed` and another `image-generating`
- **WHEN** it is read
- **THEN** the state is `chunks-processing` and `scenes` is `in-progress`, not `failed`

### Requirement: A failed phase carries its cause and retryability

When the voice-over, decomposition or assembly phase is `failed`, its entry SHALL carry `failure` with `cause` and `retryable`, taken from the session's recorded failure for that phase. The entry SHALL NOT expose the failure time, provider error codes, raw provider messages, credentials or the script. The `scenes` entry SHALL NOT carry `failure`; its errors are per scene. No entry that is not `failed` SHALL carry `failure`.

#### Scenario: Decomposition failure cause

- **GIVEN** a session failed in decomposition with cause "The narration's timestamps could not be obtained: alignment timed out. The script and the narration are unchanged." and `retryable: true`
- **WHEN** it is read
- **THEN** the `decomposition` entry carries that cause and `retryable: true`
- **AND** no other entry carries `failure`

#### Scenario: Not-retryable failure

- **GIVEN** a session failed in voice-over with a not-retryable failure
- **WHEN** it is read
- **THEN** the `voice-over` entry carries its cause and `retryable: false`

#### Scenario: Scenes failure has no phase-level cause

- **GIVEN** a session failed in its scenes
- **WHEN** it is read
- **THEN** the `scenes` entry is `failed` with no `failure`, and `failedSceneIndexes` names the failed scenes

### Requirement: A retried phase shows its in-progress state

While a failed voice-over or decomposition phase is being retried, the session SHALL derive that phase's in-progress state: `voice-over-generating` for voice-over, `chunk-decomposing` for decomposition. A phase is being retried when the latest attempt of its stage is in flight and was queued no earlier than the recorded failure. The recorded failure SHALL be kept until the retry succeeds, and SHALL NOT be shown on the phase entry while the retry runs. If the retry fails, the session SHALL derive `failed` again with the new failure. A retried scene SHALL return the session to `chunks-processing` (§8.1).

#### Scenario: Decomposition retry in flight

- **GIVEN** a session failed in decomposition
- **WHEN** a new `timestamps` attempt is recorded in flight after the failure
- **THEN** the session derives `chunk-decomposing`, `decomposition` is `in-progress` with no `failure`, and `failedPhase` is absent
- **AND** the recorded failure is still stored

#### Scenario: Voice-over retry in flight

- **GIVEN** a session failed in voice-over
- **WHEN** a new `voice-over` attempt is recorded in flight after the failure
- **THEN** the session derives `voice-over-generating` and `voice-over` is `in-progress`

#### Scenario: An attempt older than the failure does not count

- **GIVEN** a session failed in decomposition whose only in-flight `timestamps` attempt was queued before the failure was recorded
- **WHEN** it is read
- **THEN** the session derives `failed` with `failedPhase: "decomposition"`

#### Scenario: The retry fails again

- **GIVEN** a decomposition retry in flight
- **WHEN** the attempt completes as failed and a new failure is recorded
- **THEN** the session derives `failed` with `failedPhase: "decomposition"` and the new cause

#### Scenario: A scene retry

- **GIVEN** a session failed in its scenes
- **WHEN** a failed scene is retried
- **THEN** the session derives `chunks-processing` and `scenes` is `in-progress`

### Requirement: Held work is reported per phase

Each phase entry SHALL carry `heldCount`, the number of work units held by a pause in that phase's stages: `voice-over` for voice-over, `decomposition` for decomposition, `image` and `video` for scenes, and `assembly` for assembly. It SHALL come from the same derivation as the session's `held` list, and SHALL be 0 for every phase when the session is not paused (§9).

#### Scenario: Decomposition awaiting continuation

- **GIVEN** a paused session whose narration completed and whose decomposition is held
- **WHEN** it is read
- **THEN** the `decomposition` entry has `heldCount` 1 and status `pending`, and the state is `voice-over-complete`

#### Scenario: Image and video work both count toward scenes

- **GIVEN** a paused session with two scenes held at the image stage and one at the video stage
- **WHEN** it is read
- **THEN** the `scenes` entry has `heldCount` 3

#### Scenario: Not paused

- **GIVEN** a session that is not paused
- **WHEN** it is read
- **THEN** every phase has `heldCount` 0

### Requirement: The session page shows one section per phase

The session page SHALL show four sections in pipeline order, with the accessible names `Voice-over phase`, `Decomposition phase`, `Scenes phase` and `Final video phase`. Each section SHALL show its phase's status as `Not started`, `In progress`, `Complete` or `Failed`, styled from the shared status mapping. When `heldCount` is above 0, the section SHALL show `Waiting for you to continue ({heldCount} held)`. The Scenes section SHALL contain the scene list, and the Final video section SHALL contain the final-video download. The session header SHALL keep showing the session's current state (§8.3, AC21).

#### Scenario: Opening a session

- **GIVEN** a session in `chunks-processing`
- **WHEN** the User opens its page
- **THEN** the header shows the state `chunks-processing`
- **AND** the four sections appear in order: voice-over `Complete`, decomposition `Complete`, scenes `In progress`, final video `Not started`
- **AND** the scene list is inside the Scenes section

#### Scenario: A held phase

- **GIVEN** a paused session whose decomposition entry has `heldCount` 1
- **WHEN** the page renders
- **THEN** the Decomposition section shows `Not started` and `Waiting for you to continue (1 held)`

### Requirement: A failed phase shows its error and its applicable actions

A `failed` section SHALL show its phase's `failure.cause` as an alert. It SHALL show exactly the actions that `phaseActions` returns for it. `phaseActions` SHALL be the only place phase actions are derived. It SHALL return no action for the scenes phase, whose actions are per scene, and no action for the voice-over, decomposition and assembly phases until an endpoint accepts their manual retry. A failed Scenes section SHALL show the failed scenes' errors and actions on their rows (§8.3, §10.2).

#### Scenario: Decomposition failure on the page

- **GIVEN** a session read with `decomposition` `failed` and a cause
- **WHEN** the page renders
- **THEN** the Decomposition section shows `Failed` and the cause as an alert
- **AND** it shows no retry button

#### Scenario: Assembly failure fixture

- **GIVEN** a session read with `failedPhase: "assembly"` and an `assembly` entry `failed` with a cause
- **WHEN** the page renders
- **THEN** the Final video section shows `Failed` and the cause

#### Scenario: Scenes failure on the page

- **GIVEN** a session failed in its scenes, with scene 2 failed at the image stage
- **WHEN** the page renders
- **THEN** the Scenes section shows `Failed`, and scene 2's row offers its retry and image correction

### Requirement: The page reflects phase changes without reloading

The page SHALL re-render every section from each live-update snapshot it receives, so a state change, a new failure, or a retry going in progress SHALL appear without a reload (§8.3, AC2).

#### Scenario: Advancing to the next phase

- **GIVEN** an open session page in `chunk-decomposing`
- **WHEN** a snapshot arrives in `chunks-processing`
- **THEN** the Decomposition section shows `Complete` and the Scenes section `In progress`, with no reload

#### Scenario: A retry goes in progress

- **GIVEN** an open session page showing the Decomposition section `Failed`
- **WHEN** a snapshot arrives with `decomposition` `in-progress`
- **THEN** the section shows `In progress`, and the alert is gone
