# stage-diagnostics

Requirements for showing which provider each stage used and how many attempts it made (PRD §3, last paragraph; US-34). Scene details are owned by `scene-detail-view` (US-19), phase sections by `session-phase-progress` (US-18), and failure causes by those two capabilities. This capability adds the diagnostics shown inside them.

## ADDED Requirements

### Requirement: Each scene reports provider and attempts per stage

The scene representation SHALL include `stages`. It SHALL have an `image` key once the scene's image stage has at least one recorded attempt, and a `video` key once its clip stage has at least one. Each key SHALL carry `provider` (`name` and `model`) and `attempts`. `attempts` SHALL be the number of attempts recorded for that scene and stage across every retry, including one still in flight. The scene representation SHALL NOT carry a top-level `provider` or `attempts`.

#### Scenario: Image stage ran twice

- **GIVEN** a scene whose image stage failed once transiently and then succeeded with the Fal.ai provider
- **WHEN** the session is read
- **THEN** the scene's `stages.image` shows provider `Fal.ai` with model `fal-ai/flux/dev` and `attempts` 2
- **AND** the scene has no `stages.video`

#### Scenario: Image attempts survive the clip stage

- **GIVEN** a scene whose image succeeded after 2 attempts and whose clip stage is on its first attempt
- **WHEN** the session is read
- **THEN** `stages.image.attempts` is 2 and `stages.video.attempts` is 1, with provider `RunningHub`

#### Scenario: A scene that has not started

- **GIVEN** a scene in `submitted` with no recorded attempt
- **WHEN** the session is read
- **THEN** its `stages` has no `image` and no `video`

#### Scenario: Attempts count across a manual retry

- **GIVEN** a scene whose image stage failed after 4 attempts and was then retried manually once
- **WHEN** the session is read
- **THEN** `stages.image.attempts` is 5

### Requirement: Each phase reports provider and attempts of its session-level stages

Each phase entry SHALL include `stages`, a list of the session-level stages of that phase that have at least one recorded attempt, in pipeline order:

- `voice-over` for the voice-over phase;
- `timestamps`, then `instructions` (the reasoning provider's call that writes the `IMAGE` and `VIDEO` instructions, stored as attempts of stage `decomposition` by `retry-decomposition`), for the decomposition phase;
- none for the scenes phase;
- `assembly` for the assembly phase.

Each item SHALL carry `stage`, `provider` (`name` and `model`) and `attempts`, the number of attempts recorded for that session and stage. For the timestamps stage, `provider` SHALL be that of the latest attempt. The assembly stage SHALL show the provider as local assembly, with no external provider.

#### Scenario: Native timestamps unusable, alignment used

- **GIVEN** a session whose first `timestamps` attempt used native timestamps and was judged unusable, and whose second used forced alignment and succeeded
- **WHEN** it is read
- **THEN** the decomposition phase's `timestamps` stage shows provider `ElevenLabs` with model `forced alignment` and `attempts` 2

#### Scenario: Instructions stage

- **GIVEN** a session whose instruction call to the reasoning provider succeeded on the first attempt
- **WHEN** it is read
- **THEN** the decomposition phase lists `timestamps` and then `instructions`, with `instructions` showing provider `OpenAI`, model `gpt-6-astra` and `attempts` 1

#### Scenario: Voice-over stage

- **GIVEN** a session with two recorded `voice-over` attempts
- **WHEN** it is read
- **THEN** the voice-over phase's `voice-over` stage shows provider `ElevenLabs` and `attempts` 2

#### Scenario: Assembly stage

- **GIVEN** a session with one recorded `assembly` attempt with no provider
- **WHEN** it is read
- **THEN** the assembly phase's `assembly` stage shows provider `Local assembly` and `attempts` 1

#### Scenario: A stage that has not run

- **GIVEN** a session in `voice-over-complete` with no `timestamps` attempt
- **WHEN** it is read
- **THEN** the decomposition phase's `stages` is empty and the scenes phase's `stages` is empty

### Requirement: Diagnostics expose no credentials or confidential data

A stage diagnostic SHALL consist only of the stage name, the provider's display name and model, and the attempt count. The session read and every live-update snapshot SHALL NOT contain any of the following: credentials, API keys, request headers, provider endpoint paths or URLs, external request ids, raw provider error codes, or raw provider error messages. A stored provider identifier with no configured display value SHALL be shown as `Unknown provider` and SHALL NOT be echoed (§3, AC4).

#### Scenario: Sentinel values never leave the backend

- **GIVEN** a session whose attempt records carry sentinel values in their external request id, error code, error message and mode, and a configured credential with a sentinel value
- **WHEN** the session is read and a live snapshot is published
- **THEN** no sentinel and no configured endpoint path appears anywhere in either serialized payload

#### Scenario: Unknown identifier

- **GIVEN** a scene whose bound image provider identifier has no configured display value
- **WHEN** the session is read
- **THEN** `stages.image.provider.name` is `Unknown provider` and the identifier appears nowhere in the payload

#### Scenario: Every bindable identifier has a display value

- **WHEN** the provider configuration is loaded
- **THEN** every identifier a stage can bind or record has a display value

### Requirement: The page shows diagnostics where the User looks

The expanded scene details SHALL show one line per present scene stage, `Image` and `Clip`, each with provider name, model and attempt count, with the accessible names `Scene {index} image diagnostics` and `Scene {index} clip diagnostics`. Each phase section SHALL list its stages, labelled `Voice-over`, `Timestamps`, `Scene instructions` and `Assembly`, each with provider name, model and attempt count. A stage that is absent from the representation SHALL NOT be listed. Diagnostics SHALL offer no action. The page SHALL refresh them from each live snapshot without reloading.

#### Scenario: Scene details

- **GIVEN** a scene with `stages.image` (Fal.ai, fal-ai/flux/dev, 2) and `stages.video` (RunningHub, minimax/hailuo-h3, 1)
- **WHEN** the User expands the scene's details
- **THEN** they show `Image: Fal.ai (fal-ai/flux/dev), 2 attempts` and `Clip: RunningHub (minimax/hailuo-h3), 1 attempt`

#### Scenario: Phase section

- **GIVEN** a decomposition phase entry with `timestamps` (ElevenLabs, forced alignment, 2) and `instructions` (OpenAI, gpt-6-astra, 1)
- **WHEN** the page renders
- **THEN** the Decomposition section lists `Timestamps: ElevenLabs (forced alignment), 2 attempts` and then `Scene instructions: OpenAI (gpt-6-astra), 1 attempt`

#### Scenario: Live attempt count

- **GIVEN** an open page whose scene 1 shows `Image: … 1 attempt`
- **WHEN** a snapshot arrives with `stages.image.attempts` 2
- **THEN** the details show `2 attempts` without a reload
