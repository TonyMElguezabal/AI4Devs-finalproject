## ADDED Requirements

### Requirement: The first frame is uploaded as a multipart file

The adapter SHALL upload the scene image to RunningHub as `multipart/form-data` with the image in a part named `file`, authenticated with the account key, and SHALL take the URL RunningHub will fetch from `data.download_url` of the answer. It SHALL NOT send the image as a raw request body.

#### Scenario: A successful upload

- **GIVEN** RunningHub answers the upload with `{ "code": 0, "msg": "success", "data": { "download_url": "https://…/frame.png" } }`
- **WHEN** a clip is submitted
- **THEN** the upload request is `multipart/form-data` with a `file` part holding the image bytes
- **AND** the submit step uses that `download_url` as the first frame

#### Scenario: An upload that is rejected with an error envelope

- **GIVEN** RunningHub answers HTTP 200 with `errorCode` `1000` and an `errorMessage`
- **WHEN** a clip is submitted
- **THEN** the submission fails as transient with a reason that names the image upload and carries the error code
- **AND** the reason contains no credential

### Requirement: The clip is requested from the recorded model endpoint

The adapter SHALL submit the clip with a JSON `POST` to the model endpoint recorded in the provider configuration (`VIDEO_PROVIDER.endpoint`), with the prompt, the duration, the configured resolution and the uploaded first-frame URL, and SHALL read the request id from the answer's top-level `taskId` (or `data.taskId`). A submit answer that carries a non-empty `errorCode`, or no task id, SHALL be a transient failure naming the task submission.

#### Scenario: A successful submit

- **GIVEN** RunningHub answers `{ "taskId": "T1", "status": "QUEUED", "errorCode": "" }`
- **WHEN** a clip is submitted
- **THEN** the request went to `VIDEO_PROVIDER.endpoint` with `prompt`, `duration`, `resolution` and `firstFrameUrl`
- **AND** the adapter reports the request id `T1`

#### Scenario: A submit that is refused

- **GIVEN** RunningHub answers `{ "errorCode": "1002", "errorMessage": "…" }` with no `taskId`
- **WHEN** a clip is submitted
- **THEN** the submission fails as transient with a reason that names the task submission and carries the error code

### Requirement: A clip is polled through the query endpoint

The adapter SHALL poll with a JSON `POST` of `{ "taskId": <request id> }` to `/openapi/v2/query` and SHALL map the answer's `status`: `SUCCESS` with a `results[0].url` is a success carrying that temporary URL; `FAILED` is a transient failure; `QUEUED`, `RUNNING` and any other status are pending. A `SUCCESS` without a result URL, or an answer that is not the expected envelope, SHALL be a transient failure.

#### Scenario: The clip is ready

- **GIVEN** the query answers `{ "taskId": "T1", "status": "SUCCESS", "results": [{ "url": "https://…/clip.mp4", "outputType": "mp4" }] }`
- **WHEN** the request is polled
- **THEN** the adapter reports success with the temporary URL `https://…/clip.mp4`

#### Scenario: The clip is still being made

- **GIVEN** the query answers with `status` `QUEUED` or `RUNNING`
- **WHEN** the request is polled
- **THEN** the adapter reports pending

#### Scenario: The task failed at the provider

- **GIVEN** the query answers with `status` `FAILED`
- **WHEN** the request is polled
- **THEN** the adapter reports a transient failure

#### Scenario: Success without a result

- **GIVEN** the query answers with `status` `SUCCESS` and `results` null or empty
- **WHEN** the request is polled
- **THEN** the adapter reports a transient failure that says no result URL was returned
