## MODIFIED Requirements

### Requirement: The final video appears only on success and never replaces a file

An assembly attempt SHALL write its output outside the project folder, and SHALL place its file in the project folder only on success, without replacing an existing file. A first assembly's file SHALL be `final-video.mp4`; a rebuild with pause edits (`scene-pause-adjustment`) SHALL write `final-video-<version>.mp4`, version 2 onwards, and every earlier final-video file SHALL stay in the project folder. A failed attempt SHALL leave no file in the project folder, and a failed rebuild SHALL leave the current final video as the current one. If `final-video.mp4` exists with no final video recorded, the next attempt SHALL check that it is a readable MP4 and record it, without overwriting it (§12.2, AC15).

#### Scenario: Failed attempt leaves nothing

- **GIVEN** the listing of a session's project folder
- **WHEN** an assembly attempt fails midway
- **THEN** the project folder listing is unchanged

#### Scenario: Successful retry after failures

- **WHEN** assembly succeeds after earlier failed attempts
- **THEN** the project folder gains exactly `final-video.mp4`, and the session reaches `final-video`

#### Scenario: A successful rebuild keeps earlier versions

- **GIVEN** a session whose current final video is `final-video.mp4`
- **WHEN** a rebuild with pause edits succeeds
- **THEN** the project folder gains exactly `final-video-2.mp4`, `final-video.mp4` is unchanged, and the session's final video is version 2

#### Scenario: A failed rebuild

- **GIVEN** a session whose current final video is version 2
- **WHEN** a rebuild fails after its retry budget
- **THEN** the project folder listing is unchanged and version 2 is still the current final video
