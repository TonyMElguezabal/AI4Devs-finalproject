## ADDED Requirements

### Requirement: A session snapshots the reference image at creation

When a session is created, the system SHALL copy the reference image saved on `/admin`, if any, into that session's project folder and SHALL record its content type and SHA-256 on the session. If no reference image is saved, the session SHALL record none. Later changes to or removal of the `/admin` reference image SHALL NOT change an existing session's snapshot.

#### Scenario: Reference saved before creation

- **WHEN** a reference image is saved and a session is created
- **THEN** the session holds a copy of that image in its project folder with its content type and hash

#### Scenario: No reference saved

- **WHEN** no reference image is saved and a session is created
- **THEN** the session records no reference image

#### Scenario: Reference changed after creation

- **WHEN** the `/admin` reference image is replaced or removed after a session was created
- **THEN** the session's snapshot is unchanged

### Requirement: Every image request of a session carries its reference

When a session has a reference image snapshot, every image generation request for its scenes, including retries and requests after a restart, SHALL carry that snapshot to the image provider.

#### Scenario: Every scene uses the reference

- **WHEN** a session with a snapshot generates the images of its scenes
- **THEN** each image request includes the snapshot

#### Scenario: Retry after the admin image changed

- **WHEN** a scene's image is retried after the `/admin` reference was changed or removed
- **THEN** the retry request carries the session's original snapshot

#### Scenario: Restart recovery

- **WHEN** the application restarts while image generation is pending
- **THEN** the resumed requests carry the same snapshot

### Requirement: Requests without a reference do not change

When a session has no reference image snapshot, the image request SHALL be identical to the request sent before this change, including the model.

#### Scenario: No reference

- **WHEN** a scene's image is requested for a session without a snapshot
- **THEN** the request body and model equal those of the text-to-image request used before this change

### Requirement: A rejected reference fails only that scene, with a clear reason

When the image provider answers a request that carried a reference with an HTTP 4xx other than 408, 429, 401 and 403, the scene's image SHALL fail as not retryable and the failure reason SHALL state that the provider rejected the reference image. No other scene SHALL be affected. A missing snapshot file SHALL fail the scene as not retryable with a reason naming the missing file.

#### Scenario: Provider rejects the reference

- **WHEN** the provider answers 422 to a request carrying the reference
- **THEN** that scene's image fails as not retryable with a reason that names the reference image
- **AND** the other scenes of the session continue

#### Scenario: Snapshot file is missing

- **WHEN** the snapshot file cannot be read when an image request is built
- **THEN** that scene's image fails as not retryable with a reason that names the missing reference file

#### Scenario: Authentication error

- **WHEN** the provider answers 401 to a request carrying the reference
- **THEN** the failure follows the existing rule and does not blame the reference

### Requirement: The video stage is not affected

The video stage request SHALL be unchanged by the presence of a reference image.

#### Scenario: Video request with a reference

- **WHEN** a clip is requested for a session with a snapshot
- **THEN** the video request equals the one sent for a session without it

### Requirement: Records hold the hash, never the image

Logs and stored records SHALL identify a reference image by its hash and SHALL NOT contain its bytes or encoding.

#### Scenario: Inspecting records

- **WHEN** the stored attempts, provider requests and logs of a session with a reference are read
- **THEN** none contains the image bytes or a data URI of them
