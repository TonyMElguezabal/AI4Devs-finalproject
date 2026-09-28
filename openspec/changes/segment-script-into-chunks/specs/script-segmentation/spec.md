# Script segmentation

Requirements for dividing the locked script into ordered fragments whose narrated duration fits the video provider's limits (JOS-140, US-07; PRD §5 step 4, §6.1, §6.1.1, §7.2, AC03, AC17, AC18). Splitting a sentence at a clause boundary belongs to JOS-141; narration intervals and silence allocation to JOS-143 and D11.

## ADDED Requirements

### Requirement: Cuts fall only between sentences

The system SHALL divide the script into sentences and SHALL form each fragment from one or more complete consecutive sentences, so that every cut falls between two sentences. A sentence SHALL end at `.`, `!`, `?` or `…` (with any closing quotes or brackets right after it) followed by whitespace or the end of the script, except after a known abbreviation of the script's language or a single capital letter; text after the last terminator SHALL be the last sentence.

#### Scenario: A script of several sentences is segmented

- **GIVEN** a script of several sentences and its timestamps
- **WHEN** it is segmented
- **THEN** every fragment is one or more complete consecutive sentences
- **AND** no cut falls inside a sentence

#### Scenario: Abbreviations and initials do not end a sentence

- **GIVEN** a script containing "Mr. Smith" or "J. Smith" in English, or "Sra. López" in Spanish
- **WHEN** its sentences are found
- **THEN** no sentence ends after the abbreviation or the initial

#### Scenario: The script does not end with a terminator

- **GIVEN** a script whose last words have no terminator
- **WHEN** its sentences are found
- **THEN** those words form the last sentence

### Requirement: Fragments fit the duration bounds

Each fragment's narrated duration SHALL be at least the lower bound (5 s) and at most the video provider's maximum (15 s), except for a whole script shorter than the lower bound and a fragment that cannot fit without splitting a sentence. Narrated durations SHALL be measured with one rule that partitions the MP3: the boundary between two consecutive sentences lies at the midpoint of the pause between them, the first boundary is 0 and the last is the MP3's duration.

#### Scenario: Every ordinary fragment is within the bounds

- **GIVEN** a script whose sentences can be grouped within the bounds
- **WHEN** it is segmented
- **THEN** every fragment lasts between 5 s and 15 s

#### Scenario: The durations cover the whole narration

- **GIVEN** any segmented script
- **WHEN** the fragments' narrated durations are added up
- **THEN** they equal the MP3's measured duration

### Requirement: A short sentence is grouped with its neighbour

A sentence whose narration is below the lower bound SHALL be grouped with the following sentence; if it is the script's last sentence it SHALL be grouped with the previous one; if the script has no other sentence it SHALL be a fragment on its own.

#### Scenario: A short sentence in the middle

- **GIVEN** a short sentence followed by another sentence
- **WHEN** the script is segmented
- **THEN** the short sentence is in the same fragment as the sentence that follows it

#### Scenario: A short last sentence

- **GIVEN** a script whose last sentence is short
- **WHEN** it is segmented
- **THEN** the last sentence is in the same fragment as the one before it

#### Scenario: A whole script shorter than the lower bound

- **GIVEN** a script whose whole narration is shorter than 5 s
- **WHEN** it is segmented
- **THEN** it becomes one fragment flagged `script-below-lower-bound`

### Requirement: A fragment that cannot fit without a split is kept whole

Until sentences can be split at clause boundaries, a sentence whose narration alone exceeds the maximum, and a short sentence whose grouping with the following sentence exceeds the maximum, SHALL be kept whole in one fragment (with the short sentence, in the second case) flagged `unsplittable-sentence`.

#### Scenario: A sentence exceeds the maximum on its own

- **GIVEN** a sentence narrated in more than 15 s
- **WHEN** the script is segmented
- **THEN** the sentence is one fragment flagged `unsplittable-sentence`

#### Scenario: A short sentence cannot join the next one within the maximum

- **GIVEN** a short sentence whose grouping with the following sentence exceeds 15 s
- **WHEN** the script is segmented
- **THEN** both are one fragment flagged `unsplittable-sentence`

### Requirement: The grouping needing the least speed change is chosen

Among the groupings that satisfy these requirements, the system SHALL choose the one whose fragments need the smallest total speed change to reach an admitted clip duration, each fragment's speed change being §7.2's ratio to its closest admitted duration (a tie going to the longer duration) and the total being the sum of the ratios' logarithms. Ties SHALL go to fewer fragments, then to the grouping whose first cut comes later. The admitted durations SHALL be the whole seconds from 5 to 15.

#### Scenario: Two valid groupings differ in speed change

- **GIVEN** four sentences narrated in 5.5 s, 5.5 s, 6.2 s and 6.3 s, so that both "5.5 + 5.5 | 6.2 + 6.3" (11.0 s and 12.5 s) and "5.5 | 5.5 + 6.2 | 6.3" (5.5 s, 11.7 s and 6.3 s) are valid
- **WHEN** it is segmented
- **THEN** the grouping whose fragments need the smaller total speed change to reach whole-second durations is chosen, which here is the first (11.0 s needs no change; 12.5 s is closest to 13 s, a ratio of 1.040 against 1.042 for 12 s), with a total of 0.039 against 0.161

#### Scenario: Segmentation is deterministic

- **GIVEN** the same script and timestamps
- **WHEN** it is segmented twice
- **THEN** both results are identical

### Requirement: The fragments reproduce the script

Each fragment's text SHALL be the script's own text for its sentences, unchanged, and the fragments joined in order SHALL reproduce the script apart from separator whitespace.

#### Scenario: Fragments are joined

- **GIVEN** a segmented script, including one in Spanish with `¿`, `¡` and accents
- **WHEN** its fragments are joined in order
- **THEN** they equal the script apart from whitespace

### Requirement: A script with no valid grouping is a decomposition failure

When no grouping satisfies these requirements, the system SHALL register no chunks and SHALL record a failure of the `decomposition` phase on the session, not retryable, whose cause attributes it to the system and not to the User's script.

#### Scenario: No grouping satisfies the rules

- **GIVEN** timestamps for which every grouping breaks a rule
- **WHEN** the decomposition phase runs
- **THEN** no chunk is registered
- **AND** the session is `failed` with failed phase `decomposition`

### Requirement: The decomposition phase runs end to end

The decomposition phase SHALL obtain the timestamps if they are not stored, segment the script against them, and register the resulting fragments as chunks. It SHALL stop at the first step that fails, leaving that step's failure recorded.

#### Scenario: A narrated session is decomposed

- **GIVEN** a session with a completed voice-over
- **WHEN** the decomposition phase runs
- **THEN** its timestamps are stored, its chunks are registered in order, and the session is `chunks-processing`

#### Scenario: Obtaining the timestamps fails

- **GIVEN** a session whose timestamps cannot be obtained
- **WHEN** the decomposition phase runs
- **THEN** segmentation does not run and no chunk is registered
