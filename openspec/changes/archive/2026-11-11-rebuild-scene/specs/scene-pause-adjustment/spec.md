## MODIFIED Requirements

### Requirement: Rebuilding applies the edits in a new final-video version

The system SHALL accept a rebuild command only when all of these hold:
- the session has a final video;
- no assembly is running;
- every scene is `chunk-complete`;
- either the current edits differ from those the current final video was built with, or a scene was rebuilt after the current final video was built (`staleScenes`, spec `scene-rebuild`).

Otherwise it SHALL refuse with 409 and a reason, using `scenes-not-complete` while any scene is not `chunk-complete`.

An accepted rebuild SHALL open a new assembly cycle using every scene's current clip. In that cycle:
- each edited pause's silence is cut or inserted at the pause's midpoint;
- every later scene's interval is shifted by the accumulated change;
- clips are retimed to those shifted intervals.

On success it SHALL write a new file `final-video-<version>.mp4`, record the version with the edits it used, make it the current final video, and clear `staleScenes`. No earlier final-video file SHALL be replaced or deleted.

#### Scenario: A trimmed pause

- **GIVEN** a final video in which scene 3's pause is 2.6 s, edited to 1.1 s
- **WHEN** the User rebuilds and the rebuild succeeds
- **THEN** the new version is 1.5 s shorter, scene 4 and every later scene start 1.5 s earlier, and every scene still starts within ±1 frame of its shifted interval
- **AND** the project folder keeps `final-video.mp4` and gains `final-video-2.mp4`

#### Scenario: Nothing to rebuild

- **GIVEN** a final video built with exactly the current edits, and no scene rebuilt since
- **WHEN** the User rebuilds
- **THEN** the command is refused with 409 `nothing-to-rebuild`

#### Scenario: A rebuilt scene makes the final video stale

- **GIVEN** a final video whose automatic rebuild after a scene rebuild failed
- **WHEN** the User rebuilds
- **THEN** the command is accepted even with no pause edits, and the new version uses the rebuilt scene's clip

#### Scenario: A scene is still being rebuilt

- **GIVEN** a final video with pause edits pending, and scene 6 being rebuilt (`image-generating`)
- **WHEN** the User rebuilds the final video
- **THEN** the command is refused with 409 `scenes-not-complete` and no assembly starts

#### Scenario: A rebuild while one is running

- **WHEN** the User rebuilds, or sets a pause, while an assembly is running
- **THEN** it is refused with 409 `assembly-in-progress`

#### Scenario: A failed rebuild

- **WHEN** a rebuild fails after its retry budget
- **THEN** the previous final video stays the current one and stays downloadable
- **AND** the session is not shown as failed, and the read carries the rebuild's failure cause
- **AND** the User can rebuild again
