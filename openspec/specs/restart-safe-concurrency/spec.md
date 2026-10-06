# restart-safe-concurrency Specification

## Purpose
How the per-stage concurrency cap counts provider requests that were already in flight when the process restarted, and the rules that every slot release has a matching slot taken, that a scene holds at most one slot or queue place per stage, and that scenes waiting behind the cap are relaunched at boot. Established by `harden-backend-foundation` (JOS-186).
## Requirements
### Requirement: Requests in flight at restart count against the cap

When the backend starts, every provider request that was sent before the restart and is still unresolved SHALL count against its stage's concurrency cap. This applies to every request reconciliation resumes rather than records as failed. It SHALL hold before any new request for that stage is sent, and SHALL last until the request settles (resolved, or recorded as a failed attempt).

#### Scenario: Pending requests occupy slots before new work launches

- **WHEN** the backend restarts with 2 image requests still pending at the provider, the image cap is 2, and a new image launch is requested right after boot
- **THEN** the new launch waits in the queue and sends no request
- **AND** the image stage reports 2 requests in flight

#### Scenario: More pending requests than the cap

- **WHEN** the backend restarts with 5 video requests still pending at the provider and the video cap is 3
- **THEN** all 5 count as in flight and all 5 resume polling right away
- **AND** no new video request is sent until fewer than 3 are in flight

#### Scenario: A slot frees when a resumed request settles

- **WHEN** a request resumed at boot is delivered and a launch is waiting in that stage's queue
- **THEN** the waiting launch takes the freed slot
- **AND** the stage's in-flight count never goes above its cap because of that delivery

#### Scenario: A request recorded as failed at boot holds no slot

- **WHEN** reconciliation finds that the provider no longer holds a request and records exactly one failed attempt for it
- **THEN** that request does not count against the cap
- **AND** any automatic retry it schedules takes a slot through the normal queue

### Requirement: Every released slot has a matching slot that was taken

Each slot SHALL belong to the scene whose request holds it. The concurrency cap SHALL change only through a release by the scene that holds the slot. A release by a scene that holds no slot in that stage, or a second release of the same slot, SHALL NOT hand a slot to a queued waiter and SHALL NOT change the in-flight count.

#### Scenario: A release by a scene that holds no slot

- **WHEN** a stage is at its cap of 2 with one launch queued, and a release arrives for a scene that holds no slot in that stage
- **THEN** the queued launch is not started
- **AND** the in-flight count stays 2

#### Scenario: The same slot released twice

- **WHEN** a scene's request settles and its slot is released, and the same scene's slot is then released again
- **THEN** only the first release frees a slot
- **AND** at most one queued launch is started

#### Scenario: The cap holds across a restart and a burst of new work

- **WHEN** the backend restarts with requests pending, new launches are requested, and every pending and new request then settles one by one
- **THEN** the stage's in-flight count never goes above its cap, except for requests already sent before the restart
- **AND** every launch that was queued is eventually started exactly once

### Requirement: A scene takes at most one slot or queue place per stage

A scene SHALL hold or wait for at most one slot in a stage at a time. A launch request for a scene that already holds a slot, or is already queued, in that stage SHALL be ignored.

#### Scenario: The same scene is launched twice while queued

- **WHEN** a stage is at its cap, a scene is queued, and a second launch is requested for the same scene (for example when a paused session continues)
- **THEN** the scene is queued once
- **AND** when it takes its slot and later releases it, the in-flight count of other holders is unchanged

#### Scenario: A launch for a scene that already holds a slot

- **WHEN** a launch is requested for a scene whose request is already in flight in that stage
- **THEN** no second slot is taken and the in-flight count stays the same

### Requirement: Waiting scene work resumes at boot

After occupying slots for requests already sent, reconciliation SHALL relaunch submitted scenes for the image stage and image-complete scenes eligible for the video stage through the existing launch gate. Paused sessions SHALL remain held. Repeated reconciliation SHALL NOT duplicate queued launches.

#### Scenario: Waiting work survives loss of the in-memory queue

- **WHEN** the backend restarts with submitted image scenes or image-complete video scenes waiting behind the concurrency cap
- **THEN** waiting work is rebuilt and launches when capacity is available
- **AND** every scene sends exactly one request without exceeding the cap

#### Scenario: Paused waiting work stays held

- **WHEN** the backend restarts with waiting scenes in a paused session
- **THEN** no waiting request is sent or queued until the session continues
