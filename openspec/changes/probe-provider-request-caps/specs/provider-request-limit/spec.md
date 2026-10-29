## MODIFIED Requirements

### Requirement: Every provider-calling stage has a hardcoded cap

Each stage that sends requests to an external provider SHALL have a hardcoded maximum of simultaneous requests, read from `MAX_SIMULTANEOUS_REQUESTS` in the constants module (§10.1, §11). The caps SHALL be: decomposition 50, image 200, voice 3, alignment 2, video 3. Voice and alignment share one ElevenLabs account, so their caps together SHALL NOT exceed that account's concurrent-request limit as measured by the JOS-188 probe. The video cap SHALL NOT exceed the highest RunningHub concurrency that the JOS-188 probe observed with no queueing, error or slowdown. The source comment for each of these three caps SHALL cite the probe report it comes from. No cap SHALL be `undetermined`. Stages that call no provider (assembly, and timestamps taken from the narration's own data) SHALL have no cap.

#### Scenario: Every capped stage has a numeric cap

- **WHEN** the backend starts
- **THEN** each of decomposition, image, voice, alignment and video reports a numeric limit equal to its `MAX_SIMULTANEOUS_REQUESTS` value

#### Scenario: The ElevenLabs stages stay within the shared account limit

- **WHEN** the voice and alignment caps are read
- **THEN** their sum is at most the concurrent-request limit measured for the ElevenLabs account in the JOS-188 probe report

#### Scenario: The video cap stays within the measured RunningHub concurrency

- **WHEN** the video cap is read
- **THEN** it is at most the highest concurrency at which the JOS-188 probe saw every RunningHub job reach `RUNNING` without queueing and finish within the sequential baseline's range

#### Scenario: Native timestamps take no slot

- **WHEN** a session's timestamps are taken from the narration's native timestamps rather than from the alignment provider
- **THEN** no alignment slot is taken or waited for
