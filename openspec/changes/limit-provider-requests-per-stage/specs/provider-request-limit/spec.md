## ADDED Requirements

### Requirement: Every provider-calling stage has a hardcoded cap

Each stage that sends requests to an external provider SHALL have a hardcoded maximum of simultaneous requests, read from `MAX_SIMULTANEOUS_REQUESTS` in the constants module (§10.1, §11). The caps SHALL be: decomposition 50, image 200, voice 3, alignment 2, video 3. Voice and alignment share one ElevenLabs account, so their caps together SHALL NOT exceed that account's documented concurrent-request limit. No cap SHALL be `undetermined`. Stages that call no provider (assembly, and timestamps taken from the narration's own data) SHALL have no cap.

#### Scenario: Every capped stage has a numeric cap

- **WHEN** the backend starts
- **THEN** each of decomposition, image, voice, alignment and video reports a numeric limit equal to its `MAX_SIMULTANEOUS_REQUESTS` value

#### Scenario: The ElevenLabs stages stay within the shared account limit

- **WHEN** the voice and alignment caps are read
- **THEN** their sum is at most 5, the documented limit for the ElevenLabs Creator tier

#### Scenario: Native timestamps take no slot

- **WHEN** a session's timestamps are taken from the narration's native timestamps rather than from the alignment provider
- **THEN** no alignment slot is taken or waited for

### Requirement: No more than the cap is sent at once, across all sessions

For every capped stage, the number of requests sent and not yet returned SHALL NOT exceed that stage's cap, counting the requests of every session together. Requests already sent before a restart are the only exception (`restart-safe-concurrency`).

#### Scenario: Several sessions compete for the voice stage

- **WHEN** 5 sessions each become ready for their voice-over at the same time and the voice cap is 3
- **THEN** exactly 3 voice requests are sent
- **AND** the other 2 wait without sending

#### Scenario: Scenes of different sessions share the image cap

- **WHEN** two sessions together have more image-ready scenes than the image cap
- **THEN** the number of image requests in flight never goes above the cap

#### Scenario: A timed-out request still holds its slot

- **WHEN** a voice attempt is recorded as `timed-out` while its provider call has not returned
- **THEN** its slot stays taken until the call returns
- **AND** the in-flight count includes it

### Requirement: Waiting requests are sent first come, first served

When a running request of a stage finishes and frees a slot, the waiting request of that stage that became ready first SHALL be sent next, whatever its session. A retry SHALL become ready when it is due, and SHALL then wait behind requests that became ready before it.

#### Scenario: The oldest waiter is sent next, whatever its session

- **WHEN** the alignment stage is at its cap, session A's request becomes ready, then session B's, and one running alignment request finishes
- **THEN** session A's request is sent
- **AND** session B's keeps waiting

#### Scenario: A due retry waits its turn

- **WHEN** the decomposition stage is at its cap with first attempts waiting, and a retry becomes due
- **THEN** the retry is sent only after the first attempts that were already waiting

### Requirement: Waiting is neither a failed attempt nor execution time

A request waiting for a slot SHALL NOT be recorded as a sent attempt, SHALL NOT use up the retry budget, and SHALL NOT start its stage's execution clock. For stages recorded as stage attempts (voice, timestamps, decomposition), a waiting attempt SHALL be `scheduled` with no `sentAt`, and `sentAt` SHALL be stamped when it takes its slot. Its `queuedAt` SHALL keep the moment it became ready.

#### Scenario: A long wait does not time out

- **WHEN** a voice attempt waits 30 seconds for a slot, longer than the voice maximum time of 10 seconds, and is then sent and returns within 3 seconds
- **THEN** the attempt is recorded as a success
- **AND** its `sentAt` is the moment it took its slot, and its `queuedAt` is the moment it became ready

#### Scenario: Waiting uses up no attempt

- **WHEN** a decomposition attempt waits for a slot and is then sent
- **THEN** the cycle has recorded exactly one attempt for it, the one that was sent

#### Scenario: Waiting survives a restart

- **WHEN** the backend restarts while a session-level attempt is waiting for a slot
- **THEN** the attempt is still `scheduled` after boot, and no failed attempt is recorded for it
- **AND** it is sent once a slot is free

#### Scenario: A pause while waiting sends nothing

- **WHEN** a session is paused while one of its attempts waits for a slot, and the slot frees
- **THEN** the slot goes to the next waiter and nothing is sent for the paused session
- **AND** the attempt stays `scheduled` until the session continues

### Requirement: Waiting work is never shown as failed

A scene or session whose only open work is waiting for a slot SHALL NOT be shown as `failed`, and its session SHALL NOT have a failure set because of the wait.

#### Scenario: Scenes waiting for the video cap

- **WHEN** a session has more image-complete scenes than the video cap and the user views the session
- **THEN** the scenes still waiting for a slot are shown in their current non-failed state

#### Scenario: A session waiting for its voice-over slot

- **WHEN** a session's first voice-over attempt is waiting for a slot and the user views the session
- **THEN** the session has no failure and the voice-over phase is not shown as failed
