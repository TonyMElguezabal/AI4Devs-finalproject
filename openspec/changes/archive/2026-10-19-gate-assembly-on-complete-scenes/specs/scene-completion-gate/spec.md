## ADDED Requirements

### Requirement: Assembly may start only when every scene is complete

The assembly gate SHALL open only when the session has at least one scene and every scene is `chunk-complete`. Otherwise it SHALL stay closed and report the indexes of the scenes still processing and of the scenes that failed, each in ascending order. Assembly SHALL NOT be launched while the gate is closed (§7.3, AC10, AC12).

#### Scenario: One scene failed

- **GIVEN** scenes 1 and 3 `chunk-complete` and scene 2 `failed`
- **WHEN** the gate is checked
- **THEN** it is closed, reporting failed scene 2 and no scene still processing

#### Scenario: One scene not yet complete

- **GIVEN** scenes 1 and 2 `chunk-complete` and scene 3 `video-generating`
- **WHEN** the gate is checked
- **THEN** it is closed, reporting scene 3 as still processing

#### Scenario: Every scene complete

- **GIVEN** every scene `chunk-complete`
- **WHEN** the gate is checked
- **THEN** it is open

#### Scenario: No scenes

- **GIVEN** a session with no scenes
- **WHEN** the gate is checked
- **THEN** it is closed

### Requirement: The session stays in scene processing while any scene is still generating

A scene SHALL count as still generating unless it is `chunk-complete` or `failed`. While any scene is still generating, the session SHALL derive `chunks-processing`, even if another scene is `failed` (§8.1 v1.3 rule).

#### Scenario: A failed scene beside one generating its clip

- **GIVEN** scene 1 `failed` and scene 2 `video-generating`
- **WHEN** the session state is derived
- **THEN** it is `chunks-processing`

#### Scenario: A failed scene beside one not yet started

- **GIVEN** scene 1 `failed` and scene 2 `submitted`
- **WHEN** the session state is derived
- **THEN** it is `chunks-processing`

### Requirement: A failed session identifies its failed scenes

When no scene is still generating and at least one scene is `failed`, the session SHALL derive `failed` with `failedPhase: "scenes"`. The session read SHALL expose `failedSceneIndexes`, the failed scenes' indexes in ascending order, read-only. It SHALL be absent whenever the session is not failed because of its scenes. The frontend session header SHALL show the failed scene indexes.

#### Scenario: Siblings finish after a failure

- **GIVEN** scene 2 `failed` while scene 3 is still `image-generating`
- **WHEN** scene 3 reaches `chunk-complete`
- **THEN** the session changes from `chunks-processing` to `failed`, with `failedPhase: "scenes"` and `failedSceneIndexes: [2]`

#### Scenario: Several failed scenes

- **GIVEN** scenes 4 and 1 `failed` and every other scene `chunk-complete`
- **WHEN** the session is read
- **THEN** `failedSceneIndexes` is `[1, 4]`

#### Scenario: A session failed in an earlier phase

- **GIVEN** a session with no scenes whose decomposition failed
- **WHEN** the session is read
- **THEN** it is `failed` with `failedPhase: "decomposition"` and has no `failedSceneIndexes`

#### Scenario: The header shows the failed scenes

- **GIVEN** a session read with `state: "failed"`, `failedPhase: "scenes"` and `failedSceneIndexes: [2, 5]`
- **WHEN** the session page renders
- **THEN** the header shows the failed phase and scenes 2 and 5

### Requirement: Final video only exists once its file exists

When every scene is `chunk-complete`, the session SHALL derive `final-video-generating` unless a final video exists, in which case it SHALL derive `final-video`. The final-video download SHALL stay refused until the session derives `final-video` (AC12).

#### Scenario: All scenes complete, no final video yet

- **GIVEN** every scene `chunk-complete` and no final video
- **WHEN** the session state is derived
- **THEN** it is `final-video-generating`, not `final-video`
- **AND** the final-video download answers 409

#### Scenario: A final video exists

- **GIVEN** every scene `chunk-complete` and a final video recorded
- **WHEN** the session state is derived
- **THEN** it is `final-video`

### Requirement: Successful results stay available after a failure

A failed scene or a failed session SHALL NOT remove or hide any other scene's results, nor the failed scene's own stored results. Every scene's stored result SHALL remain on the session read, and a `chunk-complete` scene's downloads SHALL keep answering 200 (§10.2, AC10).

#### Scenario: A completed sibling of a failed scene

- **GIVEN** a `failed` session with scene 1 `chunk-complete` and scene 2 `failed`
- **WHEN** scene 1's image and video are downloaded
- **THEN** both answer 200

#### Scenario: The failed scene's earlier result

- **GIVEN** a scene that failed after its image was stored
- **WHEN** the session is read
- **THEN** that scene still carries its stored result

### Requirement: The session transition table records the gate

The session transition table SHALL allow `chunks-processing → final-video-generating` and `chunks-processing → failed`, and nothing else out of `chunks-processing`.

#### Scenario: Leaving scene processing

- **WHEN** the transitions out of `chunks-processing` are checked
- **THEN** only `final-video-generating` and `failed` are allowed
