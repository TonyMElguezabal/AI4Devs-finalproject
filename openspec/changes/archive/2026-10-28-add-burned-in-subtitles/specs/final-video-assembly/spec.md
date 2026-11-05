## ADDED Requirements

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
