# Final video assembly

Requirements for turning a session's completed scenes and voice-over into the single downloadable MP4. The per-stage retry budget, pause handling, and the per-stage execution time limit are owned by `stage-retry-policy` and `stage-execution-time-limit`; this capability covers when assembly launches, how clips are ordered and placed, the output's audio and format, what a valid result must satisfy, how a failure is retried without disturbing successful work, and how the result is exposed.

## ADDED Requirements

### Requirement: Assembly launches only when every scene is complete

The system SHALL launch assembly for a session only when every one of its chunks is in `chunk-complete`, without further action from the User, through the shared phase-launch gate. The session SHALL transition from `chunks-processing` to `final-video-generating` at that point. A session with any chunk in `failed` or any state other than `chunk-complete` SHALL NOT launch assembly and SHALL NOT reach `final-video`.

#### Scenario: The last scene completes

- **WHEN** a session's last remaining chunk reaches `chunk-complete`
- **THEN** assembly is launched without further User action
- **AND** the session state is `final-video-generating`

#### Scenario: A scene has failed

- **WHEN** a session has at least one chunk in `failed`
- **THEN** assembly is not launched
- **AND** the session does not reach `final-video`

#### Scenario: A scene is still processing

- **WHEN** a session has at least one chunk not yet in `chunk-complete` or `failed`
- **THEN** assembly is not launched

### Requirement: Clips are ordered by ascending scene identifier

The system SHALL place clips in the final video in ascending `sequence_number` order, regardless of the order in which their generation completed.

#### Scenario: Scenes complete out of order

- **WHEN** scene 3 reached `chunk-complete` before scene 2
- **THEN** the final video places scene 2's clip before scene 3's clip

### Requirement: Each clip is placed at its chunk's persisted narration interval

The system SHALL place each chunk's clip at the narration interval already persisted for that chunk, treating that interval — and the partition it forms with every other chunk's interval — as given, without recomputing or re-deriving it from the rendered clips.

#### Scenario: Assembly uses the persisted intervals

- **WHEN** assembly places a session's clips
- **THEN** each clip's position is taken from its chunk's stored narration interval
- **AND** no interval is recalculated from the clip's own measured duration

### Requirement: The output's only audio is the complete voice-over

The system SHALL discard each clip's own audio track. The final video's audio SHALL be the session's complete voice-over and nothing else.

#### Scenario: A clip carries its own sound

- **WHEN** a chunk's clip has its own audio track
- **THEN** that track is discarded
- **AND** it does not appear in the final video's audio

#### Scenario: The final video is inspected

- **WHEN** the final video's audio track is inspected
- **THEN** it is the session's complete voice-over

### Requirement: The output format is fixed

The system SHALL produce the final video as H.264 video with AAC audio, at the hardcoded resolution and frame rate (expected 1920×1080 at 30 fps). This format SHALL NOT be configurable per session.

#### Scenario: A final video is produced

- **WHEN** assembly succeeds for a session
- **THEN** the resulting file is H.264 video with AAC audio at the hardcoded resolution and frame rate

### Requirement: The result preserves every narrated moment and every scene without omission, duplication, or gap

The final video SHALL contain the complete narration and every scene in sequence. It SHALL NOT omit or duplicate any narrated content or scene, and SHALL NOT contain a visual gap, including across the narration's silent stretches.

#### Scenario: The full narration and all scenes are present

- **WHEN** a final video is produced for a session with N chunks
- **THEN** all N scenes appear, in order, covering the complete narration with no gap

### Requirement: A successful assembly completes the session and makes the video downloadable

On success, the system SHALL persist the final video in the session's project folder, set the session state to `final-video`, and make the file available for download. `final-video` SHALL be reachable only through a successful assembly of every completed scene.

#### Scenario: Assembly succeeds

- **WHEN** assembly succeeds for a session
- **THEN** the final video is stored in the session's project folder
- **AND** the session state is `final-video`
- **AND** the final video is available for download

### Requirement: An assembly failure preserves every successful component

When assembly fails, the system SHALL preserve the session's voice-over and every chunk's completed image and clip unchanged. A retry of the assembly stage instance SHALL NOT regenerate the voice-over, any image, or any clip, and SHALL NOT write to any chunk's or voice-over's record.

#### Scenario: Assembly fails

- **WHEN** an assembly attempt fails
- **THEN** the voice-over and every completed chunk remain unchanged
- **AND** the failure is recorded against the `assembly` stage instance

#### Scenario: Assembly is retried after a failure

- **WHEN** the `assembly` stage instance is retried, automatically or manually
- **THEN** the same already-completed voice-over, images, and clips are reused
- **AND** none of them is regenerated

### Requirement: Assembly diagnostics are recorded without exposing credentials

The system SHALL record the attempts made, the status, and — when failed — the cause and its retryability for the session's `assembly` stage instance. The provider field for this stage instance MAY be empty, since assembly has no external provider identity in the product's five provider capabilities. The recorded cause SHALL NOT include credentials or raw tool output that could contain them.

#### Scenario: An assembly failure is consulted

- **WHEN** a session whose assembly failed is read
- **THEN** its representation includes the failed phase `assembly`, the cause, and whether it is retryable

### Requirement: The final video is scoped to its own session

The system SHALL NOT expose or persist a session's final video as the result of a different session's assembly, and SHALL only assemble a session's own chunks and voice-over.

#### Scenario: Two sessions are assembled

- **WHEN** two sessions each complete assembly
- **THEN** each session's final video contains only that session's own scenes and voice-over

### Requirement: Only the final video, images, and clips are downloadable

Once a session reaches `final-video`, the system SHALL offer the final video for download. The system SHALL NOT offer the voice-over MP3, the timestamps, or the generated texts for download at any point.

#### Scenario: A completed session is consulted

- **WHEN** a session in `final-video` is consulted
- **THEN** the final video is offered for download
- **AND** no download of the MP3, timestamps, or generated texts is offered
