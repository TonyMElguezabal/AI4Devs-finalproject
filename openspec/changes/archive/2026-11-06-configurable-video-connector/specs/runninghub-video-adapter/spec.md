## MODIFIED Requirements

### Requirement: The clip is requested from the recorded model endpoint

The adapter SHALL submit the clip with a JSON `POST` to the model endpoint recorded in the provider configuration (`VIDEO_PROVIDER.endpoint`), with the prompt, the duration, the profile's resolution and the uploaded first-frame URL, and SHALL read the request id from the answer's top-level `taskId` (or `data.taskId`). The profile's resolution SHALL be `768P`, and a profile that names none SHALL request `768P`. A submit answer that carries a non-empty `errorCode`, or no task id, SHALL be a transient failure naming the task submission.

#### Scenario: A successful submit

- **GIVEN** RunningHub answers `{ "taskId": "T1", "status": "QUEUED", "errorCode": "" }`
- **WHEN** a clip is submitted
- **THEN** the request went to `VIDEO_PROVIDER.endpoint` with `prompt`, `duration`, `resolution` `768P` and `firstFrameUrl`
- **AND** the adapter reports the request id `T1`

#### Scenario: A profile saved before this change

- **GIVEN** the seeded RunningHub profile, whose parameters name no resolution
- **WHEN** a clip is submitted
- **THEN** the request's `resolution` is `768P`, not `2K`

#### Scenario: A submit that is refused

- **GIVEN** RunningHub answers `{ "errorCode": "1002", "errorMessage": "…" }` with no `taskId`
- **WHEN** a clip is submitted
- **THEN** the submission fails as transient with a reason that names the task submission and carries the error code
