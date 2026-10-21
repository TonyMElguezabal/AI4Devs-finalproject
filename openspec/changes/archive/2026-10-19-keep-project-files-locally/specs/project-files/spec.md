## ADDED Requirements

### Requirement: A project's files are kept in its project folder

Every session SHALL keep, inside its own project folder, the script and the generated texts, the full MP3, its timestamps, every successful image and clip, and the final MP4 once assembled (PRD §12.2, AC15). The script SHALL be stored exactly as submitted. The generated texts SHALL include, for every chunk, its identifier, narrated fragment, image and video instructions and narration interval.

#### Scenario: Script stored at session creation

- **WHEN** a session is created
- **THEN** its project folder contains `script.txt` with the script exactly as submitted

#### Scenario: Generated texts stored at chunk registration

- **WHEN** a session's chunks are registered
- **THEN** its project folder contains `generated-texts.json` listing every chunk's identifier, narrated fragment, image and video instructions and narration interval, in identifier order

#### Scenario: Media results stored

- **WHEN** a session produces its voice-over, timestamps, images, clips and final video
- **THEN** each file is inside that session's project folder

#### Scenario: Corrected instruction stored

- **WHEN** the User corrects a failed scene's `IMAGE`, `VIDEO` or legacy instruction (PRD §10.3)
- **THEN** its project folder's `corrected-instructions.json` holds the corrected text for that scene and field, alongside the store's own record

### Requirement: Project files never expire and are never deleted automatically

The system SHALL NOT delete a project file or expire a session on its own, whatever its age (PRD §12.2, D04). A session SHALL remain consultable with all its results indefinitely.

#### Scenario: Old session consulted

- **GIVEN** a session created long before and holding results
- **WHEN** the User consults it by its identifier
- **THEN** it is returned with its results, and its files are still in its folder

### Requirement: Same-title projects never share a folder

Each project folder SHALL be named with the video title plus the project's creation date and time to the minute. When a folder with that name already exists, a counter SHALL be appended. No project SHALL write into another project's folder (PRD §12.2, AC15).

#### Scenario: Same title, same minute

- **WHEN** two sessions with the same title are created in the same minute
- **THEN** the second folder is the first folder's name followed by ` (2)`, and each session's results are written only to its own folder

#### Scenario: Same title, different minute

- **WHEN** two sessions with the same title are created in different minutes
- **THEN** each folder carries its own creation minute and no counter

### Requirement: Temporary-link results are saved before the link expires

A result a provider delivers only as a temporary link SHALL be downloaded and saved into the project folder when it is received, before the result is accepted (PRD §12.2, D05).

#### Scenario: Image delivered as a link

- **WHEN** the image provider returns a temporary link
- **THEN** the image is downloaded and saved into the project folder before the scene is marked complete, and the stored reference points to the saved file, not the link

#### Scenario: Clip delivered as a link

- **WHEN** the video provider returns a temporary link
- **THEN** the clip is downloaded and saved into the project folder before the scene is marked complete

#### Scenario: Link no longer reachable

- **WHEN** the download from a temporary link fails
- **THEN** the attempt is recorded as a failed attempt under the retry policy, and no link is stored as the result
