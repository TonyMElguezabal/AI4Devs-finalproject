## ADDED Requirements

### Requirement: A scene's successful image can be downloaded as soon as it exists

The system SHALL let the User download a scene's stored image once the image stage has succeeded, whatever the state of the scene's clip and of every other scene (PRD §12.3, AC16). The download SHALL be the stored file, as an attachment, with the content type of its format.

#### Scenario: Image downloaded while other scenes are processing

- **GIVEN** a scene with a successful image and other scenes still processing
- **WHEN** the User downloads that scene's image
- **THEN** the stored image file is returned as an attachment with its image content type

#### Scenario: Image downloaded while the scene's own clip is generating

- **GIVEN** a scene in `video-generating`
- **WHEN** the User downloads its image
- **THEN** the stored image file is returned

#### Scenario: Image not yet available

- **GIVEN** a scene with no successful image
- **WHEN** the User requests its image download
- **THEN** the system answers that the image is not yet available and returns no file

### Requirement: A scene's successful clip can be downloaded as soon as it exists

The system SHALL let the User download a scene's stored clip once the clip stage has succeeded, whatever the state of every other scene (PRD §12.3, AC16).

#### Scenario: Clip downloaded

- **GIVEN** a scene with a successful clip
- **WHEN** the User downloads its clip
- **THEN** the stored MP4 file is returned as an attachment with content type `video/mp4`

#### Scenario: Clip not yet available

- **GIVEN** a scene whose clip has not succeeded
- **WHEN** the User requests its clip download
- **THEN** the system answers that the clip is not yet available and returns no file

### Requirement: Failed scenes do not block other scenes' downloads

A scene in `failed`, or a session that cannot reach the final video, SHALL NOT prevent downloading another scene's successful results (PRD AC10).

#### Scenario: Other scenes failed

- **GIVEN** a session where some scenes are `failed`
- **WHEN** the User downloads a successful image or clip of another scene
- **THEN** the file is returned

#### Scenario: The scene's own clip failed

- **GIVEN** a scene whose image succeeded and whose clip failed
- **WHEN** the User downloads its image
- **THEN** the stored image file is returned

### Requirement: The session read offers exactly the available scene downloads

The session read SHALL list, for each scene, a download for its image and for its clip only when that file is available, and the session page SHALL offer a download link for exactly those.

#### Scenario: Links follow availability

- **GIVEN** one scene with only an image, one with an image and a clip, and one with neither
- **WHEN** the session is read and shown
- **THEN** the first offers only the image download, the second offers both, and the third offers none

### Requirement: Narration, timestamps and generated texts are never offered for download

The system SHALL NOT offer a download of the voice-over MP3, the timestamps or the generated texts, in the session read or as a route (PRD §12.3).

#### Scenario: Session with narration and texts

- **GIVEN** a session with a voice-over, timestamps and generated texts
- **WHEN** the User views the available downloads
- **THEN** no download is offered for any of them, and only `image` and `video` are accepted as download kinds
