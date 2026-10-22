# final-video-download Specification

## Purpose
TBD - created by archiving change download-final-video. Update Purpose after archive.
## Requirements
### Requirement: The assembled MP4 can be downloaded once it exists

Once a session's final video has been assembled, the system SHALL deliver that stored MP4 file to the User as a download, with the content type `video/mp4` and as an attachment named after the project's title (PRD §5 step 10, §12.3, AC12). The delivered bytes SHALL be the stored file's own.

#### Scenario: Final video downloaded

- **GIVEN** a session in `final-video`
- **WHEN** the User downloads the final video
- **THEN** the stored MP4 file's bytes are returned as an attachment with content type `video/mp4`, its length, and a filename derived from the project's title

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

### Requirement: The downloaded file is named after the project title

The final-video attachment's filename SHALL be the project's title made safe as a filename, followed by `.mp4`. Making the title safe SHALL: replace any lone surrogate with U+FFFD; normalise it to Unicode NFC; replace control characters and each of `/ \ : * ? " < > |` with `_`; collapse runs of whitespace to one space; strip leading dots and trailing dots and spaces; prefix `_` to a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`); cap the name at 100 code points without splitting one; and use `final-video` when nothing remains. The `Content-Disposition` header SHALL carry an ASCII-only `filename` fallback and an RFC 5987 `filename*` holding the full name, so no title can make the header malformed or inject another header.

#### Scenario: Plain title

- **GIVEN** a session titled `Summer Trip` with a final video
- **WHEN** the User downloads the final video
- **THEN** the attachment is named `Summer Trip.mp4`

#### Scenario: Non-ASCII title

- **GIVEN** a session titled `Café de la plage 海`
- **WHEN** the User downloads the final video
- **THEN** the response succeeds, the header's `filename*` decodes to `Café de la plage 海.mp4`, and its `filename` fallback is ASCII only

#### Scenario: Path separators and forbidden characters

- **GIVEN** a session titled `a/b\c:d*e?f"g<h>i|j`
- **WHEN** the User downloads the final video
- **THEN** the attachment is named `a_b_c_d_e_f_g_h_i_j.mp4`

#### Scenario: Quote and line break cannot break the header

- **GIVEN** a session titled with a double quote and a line break, such as `x"` followed by a newline and `Set-Cookie: a=b`
- **WHEN** the User downloads the final video
- **THEN** the response carries exactly one `Content-Disposition` header, no other header is added, and the filename contains neither a quote nor a line break

#### Scenario: Dots, spaces and whitespace runs

- **GIVEN** sessions titled `  ..My   Video.. ` and `...`
- **WHEN** the User downloads each final video
- **THEN** they are named `My Video.mp4` and `final-video.mp4`

#### Scenario: Windows reserved name

- **GIVEN** a session titled `con`
- **WHEN** the User downloads the final video
- **THEN** the attachment is named `_con.mp4`

#### Scenario: Very long title

- **GIVEN** a session whose title is 150 characters long
- **WHEN** the User downloads the final video
- **THEN** the name before `.mp4` is at most 100 code points and no code point is split

#### Scenario: Distinct titles that sanitise alike

- **GIVEN** two sessions titled `a/b` and `a:b`
- **WHEN** the User downloads both final videos
- **THEN** both are named `a_b.mp4` and each response carries its own session's bytes

#### Scenario: Per-scene downloads keep their names

- **GIVEN** a session with a stored scene image and clip
- **WHEN** the User downloads them
- **THEN** they are named `scene-<index>-image.<ext>` and `scene-<index>-clip.mp4`, whatever the title

