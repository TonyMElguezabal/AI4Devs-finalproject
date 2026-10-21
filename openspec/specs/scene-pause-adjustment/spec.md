# scene-pause-adjustment Specification

## Purpose
TBD - created by archiving change adjust-scene-pause. Update Purpose after archive.
## Requirements
### Requirement: Each scene's pause is derived from locked data

The system SHALL derive the pause after each scene as the scene's narration-interval end minus the end of the last spoken character of the scene's `PROMPT`, computed from the stored narration timestamps with the same character matching segmentation uses. The last scene's pause SHALL run to the voice-over's measured duration. The pause SHALL NOT be stored, and no stored interval, timestamp or voice-over SHALL be modified to compute or change it. A scene whose pause cannot be derived (no `PROMPT`, or timestamps that do not match the script) SHALL have no pause and SHALL NOT be editable.

#### Scenario: A pause between two scenes

- **GIVEN** scene 3 whose speech ends at 41.20 s and whose interval ends at 43.80 s (where scene 4's speech starts)
- **WHEN** the session is read after its final video exists
- **THEN** scene 3's original pause is 2.6 s

#### Scenario: The last scene

- **GIVEN** the last scene, whose speech ends 0.9 s before the voice-over's end
- **WHEN** the session is read
- **THEN** its original pause is 0.9 s

#### Scenario: A scene with no PROMPT

- **GIVEN** a scene registered without a `PROMPT`
- **WHEN** the session is read
- **THEN** that scene carries no pause and its pause cannot be set

### Requirement: The pause range keeps the scene's clip within the speed-factor limit

For each scene with clip length `C` (its requested duration) and speech share `S` (interval length minus original pause), the system SHALL allow pause values from `max(0.2, C ÷ 2.0 − S)` to `min(max(3.0, original pause), 2.0 × C − S)`, widened to include the original pause when it falls outside, in steps of 0.1 s, plus the original value itself. The read SHALL state whether the speed-factor limit, rather than 0.2 s or 3.0 s, set either bound.

#### Scenario: A comfortable scene

- **GIVEN** a scene with `C` = 7 s, `S` = 4.8 s and an original pause of 2.6 s
- **WHEN** its range is computed
- **THEN** it is 0.2 s to 3.0 s, and not limited by the speed factor

#### Scenario: The speed factor narrows the floor

- **GIVEN** a scene with `C` = 8 s, `S` = 3.0 s and an original pause of 4.6 s
- **WHEN** its range is computed
- **THEN** the minimum is 1.0 s, the maximum is 4.6 s, and it is limited by the speed factor

#### Scenario: A value off the grid or out of range

- **WHEN** the User sets a scene's pause to 1.05 s, or to a value below its minimum
- **THEN** the change is refused with 422 and a sentence naming the allowed range
- **AND** the stored pause is unchanged

### Requirement: Pause edits are stored per scene and reset to the original

The system SHALL store a pause edit per scene, replaceable any number of times, only while the session has a final video and no assembly is running. Setting a scene back to its original pause SHALL remove its edit. Edits SHALL NOT change any stored interval, requested duration, speed factor, clip, timestamp or voice-over.

#### Scenario: Setting and resetting

- **GIVEN** a session with a final video
- **WHEN** the User sets scene 3's pause to 1.1 s, then to 1.5 s, then back to its original 2.6 s
- **THEN** after each change the read shows that value
- **AND** after the last one scene 3 has no stored edit

#### Scenario: Before the final video exists

- **GIVEN** a session whose scenes are still generating
- **WHEN** the User sets a scene's pause
- **THEN** the change is refused with 409

#### Scenario: Locked records stay locked

- **WHEN** any pause edit is stored
- **THEN** the scene's stored narration interval, requested duration and speed factor are unchanged

### Requirement: Rebuilding applies the edits in a new final-video version

The system SHALL accept a rebuild command only when the session has a final video, no assembly is running, and the current edits differ from those the current final video was built with; otherwise it SHALL refuse with 409 and a reason. An accepted rebuild SHALL open a new assembly cycle in which each edited pause's silence is cut or inserted at the pause's midpoint, every later scene's interval is shifted by the accumulated change, and clips are retimed to those shifted intervals. On success it SHALL write a new file `final-video-<version>.mp4`, record the version with the edits it used, and make it the current final video; no earlier final-video file SHALL be replaced or deleted.

#### Scenario: A trimmed pause

- **GIVEN** a final video in which scene 3's pause is 2.6 s, edited to 1.1 s
- **WHEN** the User rebuilds and the rebuild succeeds
- **THEN** the new version is 1.5 s shorter, scene 4 and every later scene start 1.5 s earlier, and every scene still starts within ±1 frame of its shifted interval
- **AND** the project folder keeps `final-video.mp4` and gains `final-video-2.mp4`

#### Scenario: Nothing to rebuild

- **GIVEN** a final video built with exactly the current edits
- **WHEN** the User rebuilds
- **THEN** the command is refused with 409 `nothing-to-rebuild`

#### Scenario: A rebuild while one is running

- **WHEN** the User rebuilds, or sets a pause, while an assembly is running
- **THEN** it is refused with 409 `assembly-in-progress`

#### Scenario: A failed rebuild

- **WHEN** a rebuild fails after its retry budget
- **THEN** the previous final video stays the current one and stays downloadable
- **AND** the session is not shown as failed, and the read carries the rebuild's failure cause
- **AND** the User can rebuild again

### Requirement: The session read and the page expose the dial

Once the session has a final video, the read SHALL carry, per scene with a derivable pause, its original and current pause, its minimum and maximum, and whether the speed factor limits it; and for the session, the final video's version, whether edits are pending, and the last rebuild failure if any. The page SHALL show, in an expanded scene card, a field named `Pause after scene {index}` with a `Reset scene {index} pause` action, and in the Final video section a `Rebuild final video` action present only while edits are pending. While a rebuild runs, the previous final video SHALL stay downloadable.

#### Scenario: Editing on the page

- **GIVEN** the session page of a session with a final video
- **WHEN** the User expands scene 3, sets `Pause after scene 3` to 1.1 and leaves the field
- **THEN** the field keeps 1.1, `Reset scene 3 pause` is enabled, and `Rebuild final video` appears in the Final video section

#### Scenario: A limited range explains itself

- **GIVEN** a scene whose minimum is set by the speed-factor limit at 1.0 s
- **WHEN** its card is expanded
- **THEN** it states that a shorter pause would speed the clip past the speed-factor limit

#### Scenario: Downloading during a rebuild

- **WHEN** a rebuild is running
- **THEN** `Download final video` is still offered and serves the previous version
- **AND** after the rebuild succeeds it serves the new version, with no reload

