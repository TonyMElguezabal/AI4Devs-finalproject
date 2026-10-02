## ADDED Requirements

### Requirement: The plan orders scenes by ascending index

The assembly plan SHALL order segments by ascending scene index, regardless of the order in which scenes are supplied or in which their clips finished generating (§6, AC11).

#### Scenario: Scenes supplied out of order

- **GIVEN** scenes supplied in the order 3, 1, 2
- **WHEN** the plan is built
- **THEN** its segments are in the order 1, 2, 3

### Requirement: The plan refuses inputs that break the assembly invariants

The plan SHALL refuse to build, naming the scene and the problem, when:

- the intervals in index order do not partition `[0, voiceOverDuration]` (checked with the same exact rule registration uses: the first starts at 0, each starts where the previous ends, none is empty, the last ends at the voice-over's duration);
- a scene index is missing from 1..N or appears twice;
- a clip's measured duration is not a finite positive number;
- cumulative frame rounding would give a scene zero frames.

It SHALL NOT repair any of these.

#### Scenario: A gap between two intervals

- **GIVEN** scene 1 ends at 6 s and scene 2 starts at 6.5 s
- **WHEN** the plan is built
- **THEN** it is refused with a reason naming scene 2 and the gap

#### Scenario: The last interval stops short of the voice-over

- **GIVEN** the last scene ends at 20 s and the voice-over lasts 20.5 s
- **WHEN** the plan is built
- **THEN** it is refused with a reason naming the last scene and both durations

#### Scenario: A missing scene

- **GIVEN** scenes with indices 1, 2 and 4
- **WHEN** the plan is built
- **THEN** it is refused with a reason naming the missing index 3

#### Scenario: A clip with no usable duration

- **GIVEN** a scene whose measured clip duration is 0
- **WHEN** the plan is built
- **THEN** it is refused with a reason naming that scene

### Requirement: Frame counts are carried forward from the cumulative interval end

Each segment's frame count SHALL be `round(intervalEnd × fps) − previousSegmentEndFrame`, where the first segment's previous end frame is 0. The segments' frame counts SHALL therefore sum to `round(voiceOverDuration × fps)`, and every scene SHALL start within ±1 frame of its interval start at any session length.

#### Scenario: Rounding does not accumulate

- **GIVEN** 200 contiguous intervals of 2.71 s each at 30 fps
- **WHEN** the plan is built
- **THEN** every segment's start frame is within 1 frame of `intervalStart × 30`
- **AND** the frame counts sum to `round(542 × 30)`

### Requirement: Each segment carries its retiming and applied speed factor

Each segment SHALL carry the `setpts` multiplier `renderedDuration / measuredClipDuration`, where `renderedDuration = frameCount / fps`, and the applied speed factor `measuredClipDuration / intervalDuration`. A factor above 1 means the clip is sped up and below 1 means it is slowed down. Clips SHALL be retimed, never trimmed.

#### Scenario: A clip longer than its interval

- **GIVEN** a 3.0 s clip for a 2.4 s interval at 30 fps
- **WHEN** the plan is built
- **THEN** the segment's applied speed factor is 1.25 and its multiplier is 72/30 ÷ 3.0 = 0.8

#### Scenario: A clip shorter than its interval

- **GIVEN** a 2.0 s clip for a 3.0 s interval
- **WHEN** the plan is built
- **THEN** the applied speed factor is 2/3 (slowed down)

### Requirement: The built track matches the plan within one frame, in the output shape, with no audio

The builder SHALL produce one silent video track at the hardcoded output resolution and frame rate (`FINAL_OUTPUT`) with H.264 video. Measured by probing the written file:

- each scene SHALL start and last within ±1 frame of its interval;
- the total duration SHALL be within ±1 frame of the voice-over's;
- the file SHALL contain no audio stream.

Each clip SHALL be normalised to the output shape before joining, so sources with differing resolutions and frame rates join cleanly. A clip's own audio stream SHALL be excluded at input, never read and then muted.

#### Scenario: The committed mixed-source fixture

- **GIVEN** JOS-182's five-scene fixture (1280×720 at 24 fps, 1920×1080 at 30 fps, 960×540 at 25 fps; three clips carrying their own audio)
- **WHEN** the track is built
- **THEN** the output is 1920×1080 at 30 fps, H.264, with no audio stream
- **AND** its total frame count is `round(14.4 × 30) = 432`
- **AND** each scene's frame range matches its plan segment

#### Scenario: A long session does not drift

- **GIVEN** at least 50 synthetic scenes with mixed source durations
- **WHEN** the track is built
- **THEN** every scene's measured start is within ±1 frame of its interval start
- **AND** the total frame count equals the plan's

### Requirement: Media tools are invoked without a shell

Every `ffmpeg` and `ffprobe` invocation SHALL pass its arguments as an array to a process launcher that does not use a shell. A path containing shell metacharacters SHALL be passed through literally.

#### Scenario: A project folder named from a hostile title

- **GIVEN** clips stored in a folder whose name contains `$(touch pwned)`, a backtick, a quote and a semicolon
- **WHEN** the track is built
- **THEN** the build succeeds using those exact paths
- **AND** no file named `pwned` is created anywhere
