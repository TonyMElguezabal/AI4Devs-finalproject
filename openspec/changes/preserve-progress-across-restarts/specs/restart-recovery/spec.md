# restart-recovery

Requirements for what an application restart keeps and what it does (PRD §12.1, §10.1, §9, AC14; US-28). Recording attempts before they are sent and refusing repeated confirmations are owned by `persistence-foundation`, pause by `session-pause` (US-20), the cap accounting and relaunch of queued scenes by `restart-safe-concurrency` (JOS-186), timeouts by `stage-execution-time-limit` (JOS-185), and retry budgets by each stage and `stage-retry-policy`.

## ADDED Requirements

### Requirement: A session reads the same after a restart

After a restart, consulting a session SHALL return the same title, script, language, state, failed phase, failed scenes, paused marker, held work, and, for every scene, the same state, error, result references, instructions and recorded values as before the restart. The only differences allowed are update times and the changes that recovery itself makes under the requirements below (§12.1, AC14).

#### Scenario: Every state survives

- **GIVEN** sessions in each session state, with scenes in each scene state, stored results and recorded errors
- **WHEN** the application restarts and each session is consulted
- **THEN** each session read equals the read before the restart, apart from update times and recovery changes

#### Scenario: Paused session

- **GIVEN** a paused session with held work
- **WHEN** the application restarts
- **THEN** the session is still paused, its held work is the same, and no provider request is sent for it

### Requirement: Interrupted requests are awaited or recorded as failed attempts

At boot, before accepting requests, the system SHALL settle every attempt left in flight. If the provider still holds the request, the system SHALL wait for its original result and apply it. Otherwise the system SHALL complete the attempt as a failed transient attempt, with the cause "interrupted by a restart", and apply the same failure handling a live transient failure of that stage would get. Settling SHALL NOT itself launch any work, apart from the retry the stage's own live failure path launches (AC14).

#### Scenario: Clip request still held by the provider

- **GIVEN** a scene in `video-generating` whose clip task was submitted before the restart
- **WHEN** the application restarts and the provider later reports the task's result
- **THEN** that original result is applied to the scene, and no new clip request is sent for it

#### Scenario: Image request lost

- **GIVEN** a scene in `image-generating` with a bound image provider
- **WHEN** the application restarts
- **THEN** the attempt is recorded as a failed transient attempt "interrupted by a restart", and the scene is returned for a retry within its budget, or `failed` if the budget is spent

#### Scenario: Voice-over attempt lost

- **GIVEN** a session whose `voice-over` attempt is `in-flight`
- **WHEN** the application restarts
- **THEN** the attempt ends as timed out and its retry is scheduled, as `stage-execution-time-limit` requires

#### Scenario: Timestamps attempt lost

- **GIVEN** a session whose `timestamps` attempt is `in-flight`
- **WHEN** the application restarts
- **THEN** that attempt is completed as `transient` with the cause "interrupted by a restart", and the session records the same retryable decomposition failure a live timestamps failure records
- **AND** the session no longer derives `chunk-decomposing` with nothing running

#### Scenario: Instructions attempt lost

- **GIVEN** a session whose `decomposition` attempt is `in-flight`
- **WHEN** the application restarts
- **THEN** that attempt is completed as `transient` with the cause "interrupted by a restart", and the session records the same retryable decomposition failure a live division failure records

#### Scenario: Assembly attempt lost

- **GIVEN** a session whose `assembly` attempt is `in-flight`
- **WHEN** the application restarts
- **THEN** that attempt is completed as `transient` with the cause "interrupted by a restart"

### Requirement: Pending work continues after a restart

After settling, for every session that is not paused, the system SHALL launch, through the phase-launch gate, every unit of work that is due but neither sent nor failed. Such units are:

- scenes waiting for their image;
- scenes whose image is complete and whose clip has not been sent;
- the final assembly, when all scenes are complete, there is no final video, nothing is in flight, and the latest assembly attempt was settled by the restart with attempts left in its budget.

Paused sessions SHALL launch nothing (§9, §12.1).

#### Scenario: Scenes queued for a request slot

- **GIVEN** scenes in `submitted` that were waiting for an image request slot when the application stopped
- **WHEN** the application restarts
- **THEN** each is launched once through the gate, and the session continues without User action

#### Scenario: Clip not yet sent

- **GIVEN** a scene in `image-complete` whose clip was not sent before the restart
- **WHEN** the application restarts
- **THEN** its clip stage is launched once

#### Scenario: Assembly interrupted with attempts left

- **GIVEN** a session with all scenes complete, no final video, and an assembly attempt settled by the restart with attempts left in its budget
- **WHEN** the application restarts
- **THEN** assembly is launched once, as the next attempt of the same sequence

#### Scenario: Assembly with its budget spent

- **GIVEN** a session whose assembly has no attempts left, or whose latest attempt is not retryable
- **WHEN** the application restarts
- **THEN** assembly is not launched

### Requirement: A restart never sends a unit of work twice

Boot recovery SHALL hand each pending unit to the gate at most once. A launch that finds its unit no longer pending SHALL send nothing and SHALL release any request slot it holds.

#### Scenario: Settled unit relaunched once

- **GIVEN** an image attempt settled as interrupted with budget left
- **WHEN** boot recovery completes
- **THEN** exactly one new image request is sent for that scene

#### Scenario: Assembly settled and relaunched once

- **GIVEN** an interrupted assembly attempt with attempts left
- **WHEN** boot recovery completes
- **THEN** exactly one new assembly attempt is recorded and run

### Requirement: Every stage declares its restart behaviour

Every stage registered with the phase-launch gate SHALL declare how it settles its in-flight units. The pending work that boot relaunches SHALL be the same set the stage reports as held while paused and launches on continue, except where a stage's boot rule is stricter to protect a spent retry budget, which SHALL be stated in that stage's rule. A stage without a registered launcher SHALL be listed in the boot log as having no restart recovery.

#### Scenario: Held, continue and boot agree

- **GIVEN** a paused session with held work in image or clip
- **WHEN** the session is consulted, continued, or restarted while unpaused
- **THEN** the units reported held, the units continue launches, and the units boot relaunches are the same set

#### Scenario: Unregistered stage reported

- **GIVEN** a stage that has no registered launcher
- **WHEN** the application boots
- **THEN** the boot log names that stage as having no restart recovery
