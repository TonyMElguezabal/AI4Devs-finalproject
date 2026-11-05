## ADDED Requirements

### Requirement: Assembly does not depend on how the storage folder path is written

The assembly SHALL produce the same video whether `PROJECTS_ROOT` (and so every clip, voice-over and output path handed to it) is an absolute path or a path relative to the application's working directory, with or without subtitles. A video that should have subtitles SHALL NOT fail because an input or output path is relative.

#### Scenario: Subtitled assembly with relative paths

- **GIVEN** the application started with the default relative `PROJECTS_ROOT` (`data/projects`) and a session whose scenes are all complete
- **WHEN** the final video is assembled with subtitles
- **THEN** the assembly succeeds and the video is written to the output path

#### Scenario: The result is the same for the same files with absolute paths

- **GIVEN** the same clips, voice-over and subtitles given once with relative paths and once with absolute paths
- **WHEN** both are assembled
- **THEN** both succeed and the video is written where each call asked
