## MODIFIED Requirements

### Requirement: Every provider-calling stage has a hardcoded cap

Each stage that sends requests to an external provider SHALL have a hardcoded maximum of simultaneous requests, read from `MAX_SIMULTANEOUS_REQUESTS` in the constants module (§10.1, §11). The caps SHALL be: decomposition 50, image 6, voice 4, alignment 2, video 4. The image cap SHALL stay below the fal.ai account's concurrent-request limit (20, read from the fal.ai dashboard for JOS-239), leaving room for the reference model and the provider connection check on the same key. An image request SHALL hold its slot from its submission until it ends (completed, failed, or cancelled at its ceiling), so the cap bounds the requests open at the provider, not only the submissions in progress. The voice cap SHALL NOT exceed the ElevenLabs concurrent-request limit measured by the JOS-188 probe (5). Alignment draws on a separate pool from voice (measured: six requests in flight with five of them voice all succeeded), so its cap is independent of the voice cap. The video cap SHALL NOT exceed the highest RunningHub concurrency that the JOS-188 probe observed with no queueing, error or slowdown (6). The source comment for the image cap SHALL cite the JOS-239 evidence, and the source comment for each of the voice, alignment and video caps SHALL cite the probe report it comes from. No cap SHALL be `undetermined`. Stages that call no provider (assembly, and timestamps taken from the narration's own data) SHALL have no cap.

#### Scenario: Every capped stage has a numeric cap

- **WHEN** the backend starts
- **THEN** each of decomposition, image, voice, alignment and video reports a numeric limit equal to its `MAX_SIMULTANEOUS_REQUESTS` value

#### Scenario: The image cap stays within the fal.ai account limit

- **WHEN** the image cap is read with the default settings
- **THEN** it is 6, below the fal.ai account limit of 20

#### Scenario: An image slot is held until its request ends

- **WHEN** an image request has been submitted and is still `IN_QUEUE` or `IN_PROGRESS` at the provider
- **THEN** its slot stays taken
- **AND** it is released only when the request completes, fails or is cancelled at its ceiling

#### Scenario: An installation overrides the image cap

- **WHEN** the installation's `settings.json` sets `maxSimultaneousRequests.image`
- **THEN** that value is the image cap after the next start

#### Scenario: The voice cap stays within the measured ElevenLabs limit

- **WHEN** the voice cap is read
- **THEN** it is at most 5, the concurrent-request limit measured for the ElevenLabs account in the JOS-188 probe report
- **AND** the alignment cap is not added to it, because alignment does not use the voice pool

#### Scenario: The video cap stays within the measured RunningHub concurrency

- **WHEN** the video cap is read
- **THEN** it is at most the highest concurrency at which the JOS-188 probe saw every RunningHub job reach `RUNNING` without queueing and finish within the sequential baseline's range

#### Scenario: Native timestamps take no slot

- **WHEN** a session's timestamps are taken from the narration's native timestamps rather than from the alignment provider
- **THEN** no alignment slot is taken or waited for
