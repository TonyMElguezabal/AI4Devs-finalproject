## MODIFIED Requirements

### Requirement: Every released slot has a matching slot that was taken

Each slot SHALL belong to the holder whose request holds it: the scene for the image and video stages, the stage attempt for the voice, alignment and decomposition stages. The concurrency cap SHALL change only through a release by the holder that holds the slot. A release by a holder that holds no slot in that stage, or a second release of the same slot, SHALL NOT hand a slot to a queued waiter and SHALL NOT change the in-flight count.

#### Scenario: A release by a scene that holds no slot

- **WHEN** a stage is at its cap of 2 with one launch queued, and a release arrives for a scene that holds no slot in that stage
- **THEN** the queued launch is not started
- **AND** the in-flight count stays 2

#### Scenario: The same slot released twice

- **WHEN** a scene's request settles and its slot is released, and the same scene's slot is then released again
- **THEN** only the first release frees a slot
- **AND** at most one queued launch is started

#### Scenario: An attempt's slot is released once, when its call returns

- **WHEN** a voice attempt holds a slot, is recorded as `timed-out`, and its provider call then returns
- **THEN** the slot is released exactly once, when the call returns
- **AND** recording the timeout does not release it

#### Scenario: The cap holds across a restart and a burst of new work

- **WHEN** the backend restarts with requests pending, new launches are requested, and every pending and new request then settles one by one
- **THEN** the stage's in-flight count never goes above its cap, except for requests already sent before the restart
- **AND** every launch that was queued is eventually started exactly once

### Requirement: A scene takes at most one slot or queue place per stage

A holder (a scene, or a stage attempt) SHALL hold or wait for at most one slot in a stage at a time. A launch request for a holder that already holds a slot, or is already queued, in that stage SHALL be ignored.

#### Scenario: The same scene is launched twice while queued

- **WHEN** a stage is at its cap, a scene is queued, and a second launch is requested for the same scene (for example when a paused session continues)
- **THEN** the scene is queued once
- **AND** when it takes its slot and later releases it, the in-flight count of other holders is unchanged

#### Scenario: A launch for a scene that already holds a slot

- **WHEN** a launch is requested for a scene whose request is already in flight in that stage
- **THEN** no second slot is taken and the in-flight count stays the same

#### Scenario: The same waiting attempt is released twice

- **WHEN** a scheduled attempt is waiting for a slot, and both its wake-up timer and a continue of its session try to release it
- **THEN** the attempt is queued once and sent once
