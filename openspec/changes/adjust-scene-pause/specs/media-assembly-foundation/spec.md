## MODIFIED Requirements

### Requirement: Voice-over is the only audio and is never retimed

The pipeline SHALL produce output whose only audio is the voice-over, at its original rate, with every clip's own audio excluded rather than silenced. Audio and video SHALL remain in sync from the first scene to the last. The voice-over's duration in the output SHALL equal its stored duration, except where the User has edited the pause after a scene (`scene-pause-adjustment`): then only silence SHALL be removed or inserted, at the middle of each edited pause, and no spoken audio SHALL be cut, moved relative to its own words, or retimed. With no pause edits, the voice-over SHALL be carried into the output as-is, without re-encoding; with edits, the edited narration MAY be encoded once, and the attempt SHALL fail rather than produce output whose audio and video durations differ by more than one frame. The stored voice-over file SHALL never be modified.

#### Scenario: Clips carry their own audio

- **WHEN** source clips contain audio
- **THEN** no clip audio is present in the output

#### Scenario: Video is retimed

- **WHEN** clips are sped up or slowed down to match their intervals
- **THEN** the voice-over duration and rate are unchanged
- **AND** audio and video remain in sync at the final scene

#### Scenario: No pause edits

- **GIVEN** a session with no pause edits
- **WHEN** the final video is assembled
- **THEN** the voice-over is copied into the output without re-encoding

#### Scenario: An edited pause

- **GIVEN** a pause edited from 2.6 s to 1.1 s
- **WHEN** the final video is rebuilt
- **THEN** exactly 1.5 s of silence is removed at the middle of that pause, every word keeps its rate, and the output's audio and video durations agree within one frame

#### Scenario: An edit that cannot be kept in sync

- **WHEN** an edited build's measured audio and video durations differ by more than one frame
- **THEN** the attempt fails and no new final video is recorded

#### Scenario: The stored narration is untouched

- **WHEN** any build with pause edits completes or fails
- **THEN** the stored voice-over file is byte-identical to before
