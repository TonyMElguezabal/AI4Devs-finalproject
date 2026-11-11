## MODIFIED Requirements

### Requirement: A stored clip completes the chunk

A clip returned by the provider SHALL be written to the session's project folder before the stage succeeds. When the provider returns a temporary link, the file SHALL be downloaded first; the stored path SHALL never be the link (§12.2). A clip that cannot be downloaded or written, or that fails the clip check, SHALL count as a failed attempt of the video stage, and no clip SHALL be recorded for it. A stored clip SHALL move the chunk to `chunk-complete`, and the chunk's image SHALL remain as it was. A repeated delivery of the same success SHALL NOT store a second clip.

#### Scenario: Clip stored and chunk complete

- **GIVEN** a chunk in `video-generating`
- **WHEN** the provider returns a valid clip
- **THEN** the clip is stored under the session's project folder, the chunk records its relative path, the chunk is `chunk-complete`, and its image path is unchanged

#### Scenario: A temporary link is downloaded first

- **GIVEN** a provider result that is a temporary URL
- **WHEN** the stage completes
- **THEN** the clip file exists in the project folder before the chunk is `chunk-complete`, and the recorded path is relative, not the URL

#### Scenario: A failed download is a failed attempt

- **GIVEN** a provider result whose download fails
- **WHEN** the result is processed
- **THEN** the chunk does not reach `chunk-complete` and the failure counts as one attempt of the video stage

#### Scenario: A file that is not an MP4 is refused

- **GIVEN** a provider result whose downloaded file is not an MP4
- **WHEN** the result is processed
- **THEN** no clip is recorded and the failure counts as one attempt of the video stage

#### Scenario: A duplicate success delivery

- **GIVEN** a chunk already `chunk-complete`
- **WHEN** the same provider result is delivered again
- **THEN** no second clip is stored and the chunk's state and paths are unchanged

## ADDED Requirements

### Requirement: A clip is accepted only if its own file meets the clip rules

The system SHALL check every clip from its own bytes, with the ffprobe the app ships, before storing it, and SHALL NOT trust provider metadata. A clip SHALL be accepted only if it is an MP4 that can be read, its first video frame decodes, its video is horizontal and at least 1920×1080, and its measured duration is at least the requested duration minus 0.5 s and at most the requested duration plus 1 s. A clip that fails SHALL be a transient failure of the video stage, with a reason that names the rule and the measured value, and SHALL be retried within the video stage's budget like any transient clip failure. When ffprobe cannot be run, the attempt SHALL be a not-retryable failure of the video stage whose reason says the clip could not be checked. A clip that passes SHALL complete the chunk exactly as before.

#### Scenario: A clip the provider typically returns is accepted

- **GIVEN** a chunk whose clip was requested at 10 s
- **WHEN** the provider returns a 2528×1440 H.264 clip lasting 10.125 s
- **THEN** the clip is stored and the chunk is `chunk-complete`

#### Scenario: A truncated clip fails at its scene

- **GIVEN** a chunk whose clip was requested at 10 s
- **WHEN** the provider returns a clip lasting 6.0 s
- **THEN** no clip is recorded, the attempt is a transient failure of the video stage whose reason says the clip lasts 6.0 s but 10 s was requested, and the video stage is attempted again

#### Scenario: A clip that is too small or portrait is refused

- **GIVEN** a chunk in `video-generating`
- **WHEN** the provider returns a 1280×720 clip, or a 1080×1920 clip
- **THEN** no clip is recorded and the attempt is a transient failure whose reason names the measured size

#### Scenario: A clip that does not decode is refused

- **GIVEN** a chunk in `video-generating`
- **WHEN** the provider returns a file whose MP4 index is missing, or with no video that decodes
- **THEN** no clip is recorded and the attempt is a transient failure of the video stage

#### Scenario: Retries run out

- **GIVEN** a chunk whose clip fails the check on every attempt
- **WHEN** the video stage's retry budget is exhausted
- **THEN** the chunk is `failed`, its `affectedStage` is `video`, its image path is unchanged, and its cause is the last check's reason

#### Scenario: ffprobe is missing

- **GIVEN** a running app that cannot run ffprobe
- **WHEN** a clip is returned
- **THEN** no clip is recorded and the attempt is a not-retryable failure of the video stage whose reason says the clip could not be checked
