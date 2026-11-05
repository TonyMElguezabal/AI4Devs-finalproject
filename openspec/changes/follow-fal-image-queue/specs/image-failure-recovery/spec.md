## ADDED Requirements

### Requirement: Failed images are retried once automatically when the session's scene work goes idle

When a session has no scene left waiting, generating its image, or generating its clip, and at least one scene failed at the image stage for a reason a retry can fix, the system SHALL give each such scene one new retry cycle, exactly as a manual retry with the same instruction and bound provider would. This sweep SHALL run at most once per session; the fact that it ran SHALL be stored so that a restart does not run it again. It SHALL NOT run while the session is paused; a paused session is swept once it continues and its scene work is idle.

A failure a retry can fix is one that ended with a transient cause: an exhausted retry cycle, the image request ceiling, or a passed start window. A not-retryable failure (rejected reference image, missing API key, no adapter for the bound provider, invalid input) SHALL NOT be swept. A scene whose image succeeded and whose clip failed SHALL NOT be swept.

#### Scenario: Fixable image failures are swept

- **GIVEN** a session whose last generating scene just finished, with scenes 3 and 7 `failed` after an exhausted image cycle and scene 5 `failed` at the image request ceiling
- **WHEN** the session's scene work goes idle
- **THEN** scenes 3, 5 and 7 each start a new retry cycle with their stored instruction and bound provider
- **AND** the session stays in scene processing

#### Scenario: A not-retryable failure is not swept

- **GIVEN** a session whose scene 4 `failed` because the provider rejected the reference image
- **WHEN** the session's scene work goes idle
- **THEN** scene 4 stays `failed` and is not resent

#### Scenario: A clip failure is not swept

- **GIVEN** a session whose scene 2 has a stored image and `failed` at the clip stage
- **WHEN** the session's scene work goes idle
- **THEN** scene 2 stays `failed`

#### Scenario: The sweep runs only once

- **GIVEN** a session that was already swept
- **WHEN** swept scenes fail again and the scene work goes idle
- **THEN** no second sweep runs
- **AND** the session is `failed` with `failedPhase: "scenes"`

#### Scenario: Sessions that failed before the sweep existed are not swept

- **GIVEN** a session that already had a failed scene when the application was upgraded
- **WHEN** the application starts
- **THEN** no scene of that session is resent
- **AND** the session is treated as already swept

#### Scenario: A restart does not repeat the sweep

- **GIVEN** a session that was swept
- **WHEN** the application restarts and the session's scene work is idle with failed scenes
- **THEN** no sweep runs

#### Scenario: A paused session is swept after it continues

- **GIVEN** a paused session whose scene work is idle with a fixable image failure
- **WHEN** the User continues the session
- **THEN** the sweep runs for that scene
