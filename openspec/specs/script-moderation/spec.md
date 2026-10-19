# script-moderation Specification

## Purpose
TBD - created by archiving change moderate-script-at-submission. Update Purpose after archive.
## Requirements
### Requirement: A submitted script is moderated before the session is registered

`POST /sessions` SHALL send the submitted script, exactly as submitted, to the reasoning provider's moderation endpoint after body validation succeeds and before any session is registered. A script the endpoint does not flag SHALL be registered exactly as it is today: `201`, state `submitted`, and voice-over launched after the response. Moderation SHALL make one request per submission, with no automatic retry. It SHALL NOT be recorded as a stage attempt, and it SHALL NOT appear in stage diagnostics.

#### Scenario: A clean script is registered

- **GIVEN** the moderation endpoint does not flag the script
- **WHEN** the User submits a valid title, script and language
- **THEN** the response is `201` with a session in state `submitted`
- **AND** the moderation endpoint received the script exactly as submitted, untrimmed
- **AND** the moderation endpoint was called exactly once

#### Scenario: An invalid body is refused before moderation

- **WHEN** the User submits an empty script, an empty title or an unsupported language
- **THEN** the response is `400` as today
- **AND** the moderation endpoint is not called

### Requirement: A flagged script is refused with a visible cause

When the moderation endpoint flags the script, `POST /sessions` SHALL answer `422` with `{ ok: false, reason }`. `reason` SHALL be written for a person, state that the script was refused by the provider's content policy, and name the flagged categories. It SHALL NOT contain the script, raw provider output or any credential. No session, scene, artefact file or stage attempt SHALL be created, and no other provider SHALL be called.

#### Scenario: A disallowed script is refused

- **GIVEN** the moderation endpoint flags the script in the categories `illicit` and `violence`
- **WHEN** the User submits it
- **THEN** the response is `422` and `reason` names `illicit` and `violence`
- **AND** no session exists afterwards and the voice provider was not called

#### Scenario: The cause carries no script or provider detail

- **GIVEN** the moderation endpoint flags the script
- **WHEN** the User submits it
- **THEN** `reason` contains neither the script text nor the credential value

### Requirement: Moderation that cannot run refuses the submission

When moderation produces no verdict, `POST /sessions` SHALL answer `503` with `{ ok: false, reason }` stating that the content check is temporarily unavailable and the User can submit again. No verdict means a timeout past the hardcoded moderation time limit, a network error, a non-`2xx` answer, a response that does not match the expected shape, or a missing `OPENAI_KEY`. `reason` SHALL NOT contain raw provider output or any credential value. Nothing SHALL be created. A script SHALL never be registered without a verdict.

#### Scenario: The moderation endpoint times out

- **GIVEN** the moderation endpoint does not answer within its time limit
- **WHEN** the User submits a valid script
- **THEN** the response is `503` and no session exists afterwards

#### Scenario: The moderation endpoint answers an error status

- **GIVEN** the moderation endpoint answers `429` or `500`
- **WHEN** the User submits a valid script
- **THEN** the response is `503` and no session exists afterwards

#### Scenario: The moderation endpoint answers an unexpected shape

- **GIVEN** the moderation endpoint answers `200` with a body that has no `results[0].flagged` boolean
- **WHEN** the User submits a valid script
- **THEN** the response is `503` and no session exists afterwards

#### Scenario: The credential is missing

- **GIVEN** `OPENAI_KEY` is set neither in the environment nor in the local secrets file
- **WHEN** the User submits a valid script
- **THEN** the response is `503`, `reason` names no credential value, and no session exists afterwards

### Requirement: The start form shows the refusal and keeps the input

When `POST /sessions` answers `422` or `503`, the start form SHALL show the response's `reason` and SHALL keep the title, script and language that were entered, so the User can edit and resubmit without retyping.

#### Scenario: A refused script stays editable

- **GIVEN** the backend answers `422` with a reason naming `violence`
- **WHEN** the User submits the start form
- **THEN** the form shows that reason
- **AND** the title, script and language fields still hold the submitted values
- **AND** no session page is opened

