# final-video-assembly Specification

## Purpose
TBD - created by archiving change assemble-final-video. Update Purpose after archive.
## Requirements
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

The system SHALL produce the final video as H.264 video whose audio is the voice-over's stream copied unchanged (MP3), at the hardcoded resolution and frame rate (expected 1920×1080 at 30 fps). This format SHALL NOT be configurable per session.

#### Scenario: A final video is produced

- **WHEN** assembly succeeds for a session
- **THEN** the resulting file is H.264 video and the voice-over's own audio stream at the hardcoded resolution and frame rate

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

### Requirement: The final video shows the script as subtitles

The system SHALL burn the session's script into the final video as subtitles, on every scene, in every assembly (first, retried and rebuilt). The subtitle text SHALL be the script's own text with whitespace normalised, SHALL be shown one line at a time, and each line SHALL have at most 32 characters. A line SHALL NOT split a word and SHALL NOT continue past the end of a sentence; where a line must break inside a sentence, it SHALL prefer to break after a comma, semicolon or colon. A line SHALL appear when its first word is spoken and SHALL be gone before the next line appears. The subtitles SHALL be drawn in Montserrat Bold at 48 px on the 1920×1080 frame, white with a dark outline, bottom-centre, the same in every supported language. The subtitles SHALL NOT be switchable per session.

#### Scenario: A final video is produced

- **WHEN** assembly succeeds for a session
- **THEN** the final video shows the script as one-line subtitles on every scene
- **AND** each line appears when its first word is spoken

#### Scenario: A sentence is longer than one line

- **WHEN** a sentence has more than 32 characters
- **THEN** it is shown as several lines, none longer than 32 characters
- **AND** no word is split between two lines

#### Scenario: A sentence ends

- **WHEN** a sentence ends and the next sentence begins
- **THEN** the two sentences are never shown on the same line

#### Scenario: A word is longer than a line

- **WHEN** a single word has more than 32 characters
- **THEN** it is shown whole on a line of its own

#### Scenario: A language with accents

- **WHEN** the script is in Spanish and contains accented letters, `ñ`, `¿` and `¡`
- **THEN** they are drawn correctly in the subtitles

### Requirement: The narrated word is highlighted

While a subtitle line is shown, the system SHALL draw the word being narrated in `#FFCDD0` and every other word of the line in white. A word SHALL be a whitespace-separated token with its punctuation. A word SHALL be highlighted from the moment it is spoken until the next word of the line is spoken, and the last word of a line SHALL stay highlighted until the line is gone. Exactly one word of a shown line SHALL be highlighted at any time.

#### Scenario: The narration moves to the next word

- **WHEN** the narration moves from one word of a shown line to the next
- **THEN** the previous word goes back to white
- **AND** the next word is drawn in `#FFCDD0`

#### Scenario: A pause between two words

- **WHEN** there is silence between two words of the same line
- **THEN** the earlier word stays highlighted until the later word is spoken

#### Scenario: A word with punctuation

- **WHEN** the script contains `600,000`
- **THEN** it is highlighted as one word

### Requirement: The subtitles follow the narration after pause edits

When a final-video build applies the User's pause edits, the system SHALL move every subtitle time by the same amounts as the narration: a time after an inserted silence SHALL move later by its length, a time after a removed silence SHALL move earlier by its length, and a time inside a removed silence SHALL move to where the removal begins. A build with no edits SHALL use the stored timestamps unchanged.

#### Scenario: A pause is lengthened

- **WHEN** a rebuild lengthens the pause after a scene by 0.5 s
- **THEN** every subtitle time after that pause is 0.5 s later than in the previous build

#### Scenario: A pause is shortened

- **WHEN** a rebuild shortens a pause by 0.4 s
- **THEN** every subtitle time after that pause is 0.4 s earlier than in the previous build

#### Scenario: A build without edits

- **WHEN** a final video is assembled with no pause edits
- **THEN** the subtitle times are those of the stored narration timestamps

### Requirement: An assembly never delivers a video without its subtitles

The system SHALL fail an assembly attempt as not retryable, with a cause that names what is missing and never contains the script, when the subtitles cannot be built because the narration's timestamps cannot be read or do not match the script, or cannot be drawn because the assembly tool has no subtitle support or the bundled font is missing. In that case no final video SHALL be recorded for the attempt. A final video produced before subtitles existed SHALL NOT be changed until the User rebuilds it.

#### Scenario: The timestamps cannot be read

- **WHEN** assembly starts and the narration's stored timestamps are missing or unreadable
- **THEN** the attempt fails as not retryable
- **AND** the recorded cause says the subtitles could not be built
- **AND** no final video is recorded

#### Scenario: The assembly tool cannot draw subtitles

- **WHEN** the assembly tool has no subtitle support, or the bundled font is missing
- **THEN** the attempt fails as not retryable with a cause that says so
- **AND** no final video is recorded

#### Scenario: A video produced before this requirement

- **WHEN** a session already has a final video made without subtitles
- **THEN** that file is unchanged
- **AND** rebuilding the final video produces a version with subtitles

