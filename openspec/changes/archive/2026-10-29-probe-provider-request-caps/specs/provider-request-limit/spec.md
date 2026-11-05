## MODIFIED Requirements

### Requirement: Every provider-calling stage has a hardcoded cap

Each stage that sends requests to an external provider SHALL have a hardcoded maximum of simultaneous requests, read from `MAX_SIMULTANEOUS_REQUESTS` in the constants module (§10.1, §11). The caps SHALL be: decomposition 50, image 200, voice 4, alignment 2, video 4. The voice cap SHALL NOT exceed the ElevenLabs concurrent-request limit measured by the JOS-188 probe (5). Alignment draws on a separate pool from voice (measured: six requests in flight with five of them voice all succeeded), so its cap is independent of the voice cap. The video cap SHALL NOT exceed the highest RunningHub concurrency that the JOS-188 probe observed with no queueing, error or slowdown (6). The source comment for each of these three caps SHALL cite the probe report it comes from. No cap SHALL be `undetermined`. Stages that call no provider (assembly, and timestamps taken from the narration's own data) SHALL have no cap.

#### Scenario: Every capped stage has a numeric cap

- **WHEN** the backend starts
- **THEN** each of decomposition, image, voice, alignment and video reports a numeric limit equal to its `MAX_SIMULTANEOUS_REQUESTS` value

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
