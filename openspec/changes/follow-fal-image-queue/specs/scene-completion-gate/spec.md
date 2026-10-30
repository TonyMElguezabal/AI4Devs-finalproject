## MODIFIED Requirements

### Requirement: A failed session identifies its failed scenes

When no scene is still generating, at least one scene is `failed`, and the session's one-time image sweep (`image-failure-recovery`) has either run or has nothing to retry, the session SHALL derive `failed` with `failedPhase: "scenes"`. The session SHALL NOT be published as `failed` while that sweep is due; the sweep's resubmissions return the session to scene processing. The session read SHALL expose `failedSceneIndexes`, the failed scenes' indexes in ascending order, read-only. It SHALL be absent whenever the session is not failed because of its scenes. The frontend session header SHALL show the failed scene indexes.

#### Scenario: Siblings finish after a failure the sweep cannot fix

- **GIVEN** scene 2 `failed` because the provider rejected the reference image while scene 3 is still `image-generating`
- **WHEN** scene 3 reaches `chunk-complete`
- **THEN** the session changes from `chunks-processing` to `failed`, with `failedPhase: "scenes"` and `failedSceneIndexes: [2]`

#### Scenario: Siblings finish after a failure the sweep can fix

- **GIVEN** scene 2 `failed` after an exhausted image cycle while scene 3 is still `image-generating`, and the session was never swept
- **WHEN** scene 3 reaches `chunk-complete`
- **THEN** scene 2 starts a new retry cycle
- **AND** the session stays `chunks-processing` and is never published as `failed` in between

#### Scenario: Several failed scenes

- **GIVEN** scenes 4 and 1 `failed`, every other scene `chunk-complete`, and the session already swept
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
