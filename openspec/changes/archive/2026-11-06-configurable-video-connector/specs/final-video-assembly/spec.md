## MODIFIED Requirements

### Requirement: The output format is fixed

The system SHALL produce the final video as H.264 video whose audio is the voice-over's stream copied unchanged (MP3), at the resolution and frame rate of the settings files. The settings SHALL accept exactly two resolutions, 1280×720 (720p) or 1920×1080 (1080p), with 1080p as the shipped default. Any other size SHALL stop the application at start-up with a problem naming `output`. The burned-in subtitles SHALL keep the same position and the same size relative to the frame at both resolutions. This format SHALL NOT be configurable per session.

#### Scenario: A final video is produced

- **WHEN** assembly succeeds for a session
- **THEN** the resulting file is H.264 video and the voice-over's own audio stream at the configured resolution and frame rate

#### Scenario: A 720p final video

- **GIVEN** settings with output 1280×720
- **WHEN** assembly succeeds for a session
- **THEN** the final video is 1280×720, and its subtitles are in the same place and at the same size relative to the frame as at 1080p

#### Scenario: A size the settings do not accept

- **GIVEN** settings with output 2560×1440
- **WHEN** the application starts
- **THEN** it stops with a problem on `output` that names 1280×720 and 1920×1080 as the accepted sizes
