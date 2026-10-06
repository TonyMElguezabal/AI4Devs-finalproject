# final-video-download

## ADDED Requirements

### Requirement: The assembled MP4 can be downloaded once it exists

Once a session's final video has been assembled, the system SHALL deliver that stored MP4 file to the User as a download, with the content type `video/mp4` and as an attachment (PRD §5 step 10, §12.3, AC12). The delivered bytes SHALL be the stored file's own.

#### Scenario: Final video downloaded

- **GIVEN** a session in `final-video`
- **WHEN** the User downloads the final video
- **THEN** the stored MP4 file's bytes are returned as an attachment with content type `video/mp4` and its length

#### Scenario: The stored file is missing

- **GIVEN** a session whose final video is recorded but whose file is absent from its project folder
- **WHEN** the User requests the download
- **THEN** the system reports that it was not found and returns no file

### Requirement: The final video is not offered before it exists

Until a session's final video has been assembled, the system SHALL NOT offer or deliver it (PRD §12.3, AC12). The session read SHALL carry a final-video download only once the file exists, and the session page SHALL offer the download only when the read carries one.

#### Scenario: Session still processing its scenes

- **GIVEN** a session whose scenes are still processing
- **WHEN** the User views it and requests the final-video download
- **THEN** no download is offered on the page, and the request is refused as not yet available

#### Scenario: Every scene complete but assembly not finished

- **GIVEN** a session in `final-video-generating`
- **WHEN** the User views it and requests the final-video download
- **THEN** no download is offered on the page, and the request is refused as not yet available

#### Scenario: Failed session

- **GIVEN** a session that is failed and has no final video
- **WHEN** the User views it
- **THEN** no final-video download is offered

### Requirement: One decision about whether the final video is available

Whether the final video can be downloaded SHALL be decided by the stored final video alone. The session read SHALL publish the download route when it exists, and the page SHALL derive availability from what the read publishes rather than from the session's state.

#### Scenario: The read publishes the route

- **GIVEN** a session whose final video has been assembled
- **WHEN** the session is read
- **THEN** it carries the route to download the final video

#### Scenario: The page follows the read

- **GIVEN** a session read that carries no final-video download
- **WHEN** the session page is shown
- **THEN** it offers no final-video download, whatever the session's state
