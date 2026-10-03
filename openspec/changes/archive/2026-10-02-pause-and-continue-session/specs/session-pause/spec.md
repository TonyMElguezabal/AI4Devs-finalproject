## ADDED Requirements

### Requirement: A pause holds every launch not yet sent

While a session is paused, the system SHALL NOT send any provider request for it that was not already sent when the pause took effect. This SHALL hold for every kind of launch — a first generation, the start of a phase, an automatic retry and a manual retry — in every scene and every phase. A held launch SHALL record no attempt, start no execution clock, and, if it holds a request-cap slot, release it to the next waiter (§9, D01, AC07).

#### Scenario: A scene's first generation is held

- **GIVEN** a session with a registered scene that has not been launched
- **WHEN** the session is paused and the scene's launch is requested
- **THEN** no provider request is sent
- **AND** the scene stays `submitted` with zero attempts

#### Scenario: A phase whose predecessor finishes during the pause is held

- **GIVEN** a session whose narration request was sent before the pause
- **WHEN** the narration completes while the session is paused
- **THEN** the narration result is kept and the session derives `voice-over-complete`
- **AND** the decomposition phase is not started and the session does not derive `chunk-decomposing`

#### Scenario: An automatic retry is held

- **GIVEN** a scene whose request, sent before the pause, fails with a transient failure
- **WHEN** the failure is recorded while the session is paused
- **THEN** the retry is recorded as pending and no request is sent for it

#### Scenario: A manual retry requested during the pause is held

- **GIVEN** a paused session with a failed scene
- **WHEN** the User requests a retry of the scene
- **THEN** the request is accepted and the scene is recorded as pending a retry
- **AND** no provider request is sent

#### Scenario: A scene waiting for a request-cap slot when the pause arrives

- **GIVEN** a scene queued behind the per-stage request cap
- **WHEN** the session is paused and the slot is granted to that scene
- **THEN** nothing is sent, no attempt is consumed, and the slot passes to the next waiter

#### Scenario: Holding work in one scene or phase holds it in all

- **GIVEN** a paused session with held work in two different scenes and a held phase
- **WHEN** any launch of that session is requested
- **THEN** none of them sends a request

### Requirement: Requests already sent finish and their results are kept

A request recorded as sent before the pause SHALL continue until it finishes or fails, and its result SHALL be applied, stored and broadcast exactly as it would be without a pause. The work that result makes startable SHALL be held while the session is paused. A request is sent at the moment its in-flight record is persisted; the check that admits a launch and that record SHALL have no yielding step between them, so a launch is either sent before the pause or held (§9, AC07, AC16).

#### Scenario: A sent request completes during the pause

- **GIVEN** a scene whose image request was sent before the pause
- **WHEN** the session is paused and the request then succeeds
- **THEN** the scene's image is stored and the scene is `image-complete`
- **AND** the scene's video generation is not started

#### Scenario: A sent request fails during the pause

- **GIVEN** a scene whose request was sent before the pause
- **WHEN** the session is paused and the request then fails
- **THEN** the failure and the attempt are recorded and the scene is not sent again

#### Scenario: A pause arrives after a launch was admitted

- **GIVEN** a launch whose in-flight record has been persisted
- **WHEN** the session is paused
- **THEN** the request is not interrupted and finishes normally

#### Scenario: A pause arrives before a launch is admitted

- **GIVEN** a launch that has not yet persisted its in-flight record
- **WHEN** the session is paused
- **THEN** the launch is held

### Requirement: Continue launches every held generation, phase and retry once

Continuing a paused session SHALL remove the pause marker, leave the session state unchanged, and launch every unit of held work, in pipeline order and, within a stage, in ascending scene index. Held work includes work that became startable during the pause. Only the call that removes the marker SHALL launch work: continuing a session that is not paused, or continuing twice, SHALL launch nothing and SHALL NOT be an error. A launch SHALL be made once per unit of work: a unit already sent SHALL NOT be sent again (§9, D01, AC07).

#### Scenario: Held scenes are launched in ascending order

- **GIVEN** a paused session with scenes 1 to 3 held
- **WHEN** the User continues
- **THEN** scenes 1, 2 and 3 are launched in that order

#### Scenario: Work that became startable during the pause is launched

- **GIVEN** a paused session whose narration completed during the pause, so decomposition is held
- **WHEN** the User continues
- **THEN** the decomposition phase starts and the session then derives `chunk-decomposing`

#### Scenario: A held retry is launched

- **GIVEN** a paused session with a scene pending an automatic retry and a scene pending a manual retry
- **WHEN** the User continues
- **THEN** both retries are sent

#### Scenario: Continue twice

- **GIVEN** a paused session with held work
- **WHEN** continue is requested twice
- **THEN** each held unit is sent exactly once
- **AND** both calls answer success

#### Scenario: Continue on a session that is not paused

- **GIVEN** a session that is not paused
- **WHEN** continue is requested
- **THEN** the call answers success and launches nothing

#### Scenario: A pause arrives during the launch of held work

- **GIVEN** a continue that has launched part of the held work
- **WHEN** the session is paused again before the rest is launched
- **THEN** the remaining units are held

#### Scenario: A held retry whose delay has not elapsed

- **GIVEN** a held automatic retry scheduled for a time that is still in the future when the User continues
- **WHEN** the User continues
- **THEN** the retry is sent when its own scheduled time arrives, not at continue

### Requirement: A pause never reverts or removes work

Pausing and continuing SHALL NOT change, delete or revert any stored result, attempt, state, failure or file of the session, and SHALL change only the paused marker and, on continue, the effects of the launches it triggers. A session that remains paused SHALL keep every completed result (§9, AC16).

#### Scenario: A long pause

- **GIVEN** a session with completed results
- **WHEN** it is paused and stays paused while its in-flight requests finish
- **THEN** every completed result, including those that finished during the pause, is still stored and readable

#### Scenario: Continue changes no state by itself

- **GIVEN** a paused session in `chunks-processing`
- **WHEN** the marker is removed and no held work exists
- **THEN** the session state is unchanged

### Requirement: Time held by a pause is never execution time

A launch held by a pause SHALL record no attempt and no send time, so that an execution clock that starts when a request is sent cannot count time spent held. A request already sent SHALL keep its own clock while the session is paused (§10.1; the time-limit story consumes this).

#### Scenario: A launch held for a long time

- **GIVEN** a scene held by a pause for any length of time
- **WHEN** the User continues and the scene is sent
- **THEN** its attempt records a send time at or after the continue

#### Scenario: A held launch consumes no attempt

- **GIVEN** a scene with no attempts
- **WHEN** it is held by a pause and later launched
- **THEN** its first attempt is its attempt number 1

### Requirement: Pause and continue are idempotent, session-scoped and allowed in any state

Pausing a paused session SHALL change nothing and answer success. Pausing and continuing SHALL affect only the session named, and SHALL be accepted in every session state. An unknown session SHALL be refused as not found. A pause SHALL NOT keep another session from using a request-cap slot a paused session's waiter gave up.

#### Scenario: Pause twice

- **GIVEN** a paused session
- **WHEN** pause is requested again
- **THEN** it answers success and emits no state change

#### Scenario: Another session is unaffected

- **GIVEN** two sessions with launches requested
- **WHEN** one is paused
- **THEN** the other session's launches are sent normally

#### Scenario: A failed session is paused

- **GIVEN** a session in `failed`
- **WHEN** it is paused and a retry is then requested
- **THEN** the retry is held until continue

#### Scenario: Unknown session

- **WHEN** pause or continue names a session that does not exist
- **THEN** the call is refused as not found

### Requirement: Held work is distinguished from running work

While a session is paused, its representation SHALL list the stages with held work and the number of units held in each, and every scene SHALL say whether it is held. When the session is not paused, the held list SHALL be empty and no scene SHALL be held. The held list and the work continue launches SHALL come from the same derivation, and the paused marker SHALL remain a field separate from the session state (§8.3, §9).

#### Scenario: Scenes held beside a scene still generating

- **GIVEN** a paused session with scene 1 `image-generating` (sent before the pause) and scenes 2 and 3 not launched
- **WHEN** the session is read
- **THEN** scene 1 is not held and scenes 2 and 3 are held
- **AND** the held list shows the image stage with two units

#### Scenario: A phase awaiting continuation

- **GIVEN** a paused session whose narration completed and whose decomposition is held
- **WHEN** the session is read
- **THEN** the held list shows the decomposition stage with one unit and the state is `voice-over-complete`

#### Scenario: Not paused

- **GIVEN** a session that is not paused, with a scene queued for a request-cap slot
- **WHEN** the session is read
- **THEN** the held list is empty and the scene is not held

#### Scenario: What is held is what continue launches

- **GIVEN** a paused session with held work
- **WHEN** continue launches it
- **THEN** the units that were reported held are exactly the units sent

### Requirement: The pause survives a restart and nothing starts for a paused session

The paused marker SHALL be persisted. After a restart, a paused session SHALL remain paused, its held work SHALL still be found, and boot reconciliation SHALL NOT send any request for it; it MAY apply results and record failed attempts, and every launch it triggers SHALL go through the same gate (§12.1).

#### Scenario: Restart while paused

- **GIVEN** a paused session with held work
- **WHEN** the process restarts
- **THEN** the session is still paused and the held work is still reported held

#### Scenario: Reconciliation finds a result for a paused session

- **GIVEN** a paused session whose sent request was resolved at the provider while the process was down
- **WHEN** the process starts
- **THEN** the result is applied and kept
- **AND** the retry or next stage it would trigger is held

### Requirement: Every launcher is held by the gate, and gaps are visible

Every provider launch SHALL ask the same launch gate before sending. Every pipeline stage SHALL either have a registered launcher that can report its held work and launch it, or be listed explicitly as not yet launchable; a stage SHALL NOT be in both. A launcher that is added SHALL remove its stage from the not-yet-launchable list.

#### Scenario: A stage is neither registered nor listed

- **GIVEN** the list of pipeline stages
- **WHEN** a stage is in neither the launcher registry nor the not-yet-launchable list
- **THEN** the completeness check fails

#### Scenario: A stage is both registered and listed

- **GIVEN** a stage with a registered launcher
- **WHEN** it is still in the not-yet-launchable list
- **THEN** the completeness check fails

#### Scenario: The decomposition entry point while paused

- **GIVEN** a paused session whose narration is complete
- **WHEN** the decomposition phase is requested
- **THEN** it reports that it is held and starts nothing
