## ADDED Requirements

### Requirement: A session is refused when the media tools cannot run

The system SHALL check that `ffmpeg` and `ffprobe` can run, and that `ffmpeg` lists the `subtitles` filter, before it creates a session and before it sends any request to a provider, including the script content check. When the check fails, the system SHALL refuse the session with a `503` answer whose reason names the tool that failed and what the User can do, SHALL NOT create a session, and SHALL NOT send any provider request. The reason SHALL NOT contain a file path.

When the assembly tool is replaced by a stub for manual testing (`USE_STUB_ASSEMBLY_TOOL`), the system SHALL skip this check.

#### Scenario: A tool is blocked by the operating system

- **WHEN** a script is submitted and `ffprobe` is killed or refused when it starts
- **THEN** the answer is `503`
- **AND** the reason names `ffprobe` and says the operating system blocked it, with the command that removes the block
- **AND** no session is created and no provider request is sent

#### Scenario: A tool is missing

- **WHEN** a script is submitted and `ffmpeg` cannot be found
- **THEN** the answer is `503` and the reason names `ffmpeg` as missing
- **AND** no session is created and no provider request is sent

#### Scenario: The tool has no subtitle support

- **WHEN** a script is submitted and `ffmpeg` runs but lists no `subtitles` filter
- **THEN** the answer is `503` and the reason says this `ffmpeg` cannot draw subtitles
- **AND** no session is created and no provider request is sent

#### Scenario: The tools are ready

- **WHEN** a script is submitted and both tools run and `ffmpeg` lists the `subtitles` filter
- **THEN** the session is created as before

#### Scenario: The check comes before the content check

- **WHEN** a script is submitted and a tool cannot run
- **THEN** the script content check is not called

### Requirement: A failed tool check is never remembered

The system SHALL remember only a successful check of the `subtitles` filter. A check that failed, because the tool could not run or had no such filter, SHALL be run again the next time the answer is needed, so that fixing the cause takes effect without restarting the application.

#### Scenario: The block is removed after a failed check

- **WHEN** the subtitle-filter check failed because `ffmpeg` was blocked, and the block is then removed
- **THEN** the next assembly runs the check again and passes
- **AND** the application is not restarted

#### Scenario: A passed check is kept

- **WHEN** the subtitle-filter check passed once
- **THEN** later checks in the same run of the application do not start `ffmpeg` again
