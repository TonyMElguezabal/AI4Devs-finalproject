## ADDED Requirements

### Requirement: A media tool that cannot run is not reported as invalid audio

When the system cannot run `ffprobe` to measure returned voice-over audio, because it is missing, killed by the operating system, or refused permission to execute, it SHALL record the attempt as failed because the tool is unavailable, with a cause that names `ffprobe` and says how to fix it. It SHALL NOT record the audio as invalid, and SHALL NOT retry the attempt automatically. A tool that runs and reports that the audio is not a decodable MP3 SHALL still be recorded as invalid audio.

#### Scenario: ffprobe is killed while the audio is measured

- **WHEN** the voice provider reports success and `ffprobe` is killed when it starts
- **THEN** the attempt is recorded as failed with the tool-unavailable cause, not as invalid audio
- **AND** no automatic retry is scheduled
- **AND** the session does not reach `voice-over-complete`

#### Scenario: ffprobe runs and rejects the audio

- **WHEN** the voice provider reports success and `ffprobe` runs but cannot read the file as an MP3
- **THEN** the attempt is recorded as invalid audio, as before
