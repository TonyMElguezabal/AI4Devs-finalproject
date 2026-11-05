# visual-style-in-decomposition Specification

## Purpose
TBD - created by archiving change admin-visual-style-prompt. Update Purpose after archive.
## Requirements
### Requirement: A session snapshots the visual style when it is created

Creating a session SHALL copy the current `visualStylePrompt` onto the run as `visual_style_prompt`. A run created before the setting existed SHALL hold the empty string. Saving the setting afterwards SHALL NOT change any existing run's copy.

#### Scenario: Snapshot taken at creation

- **GIVEN** the saved prompt is "style A"
- **WHEN** a session is created
- **THEN** the run's `visual_style_prompt` is "style A"

#### Scenario: Later edits do not reach existing sessions

- **GIVEN** a session created with "style A"
- **WHEN** the prompt is saved as "style B"
- **THEN** that session's `visual_style_prompt` is still "style A", and a session created afterwards holds "style B"

#### Scenario: Existing database migrated

- **GIVEN** a database with runs created before this change
- **WHEN** the application starts
- **THEN** those runs hold `""` and every other column is unchanged

### Requirement: The decomposition request carries the run's style as separate creative direction

The reasoning request that writes the `IMAGE` and `VIDEO` instructions SHALL be built from the run's snapshot. With a non-empty snapshot, the messages SHALL be, in order: a `system` message holding the style inside a delimited block labelled as creative direction from the user; a `system` message holding the fixed contract followed by a rule that each image instruction works on its own (repeating the full description of recurring characters) and a rule that the contract wins on any conflict with the creative direction; and the unchanged `user` message. With an empty snapshot, the request SHALL be byte-identical to the one sent before this change.

The first decomposition, a manual retry of a failed decomposition, and restart recovery SHALL all use the run's snapshot, never the current setting.

#### Scenario: Empty style leaves the request unchanged

- **GIVEN** a run whose snapshot is empty
- **WHEN** the session is decomposed
- **THEN** the request body is byte-identical to the one the previous version sent

#### Scenario: Style block precedes the contract

- **GIVEN** a run whose snapshot is "Warry, a 2D cartoon caricature in a navy suit"
- **WHEN** the session is decomposed
- **THEN** the request has the creative-direction `system` message containing that text first, then the contract `system` message with the conflict rule, then the `user` message

#### Scenario: Retry uses the snapshot, not the current setting

- **GIVEN** a session created with "style A" whose decomposition failed, and the prompt now saved as "style B"
- **WHEN** the decomposition is retried
- **THEN** the retry's request contains "style A" and not "style B"

#### Scenario: Recovery after a restart uses the snapshot

- **GIVEN** a session created with "style A" whose decomposition was interrupted by a restart, and the prompt now saved as "style B"
- **WHEN** the decomposition resumes
- **THEN** the request contains "style A" and not "style B"

### Requirement: The pipeline contract wins over the style text

The count and shape checks on the reasoning provider's answer SHALL be unchanged. A style that asks to merge, skip or split sentences, or to answer in plain text, SHALL NOT change the checks: an answer without exactly one non-empty `{ image, video }` pair per fragment, in order, remains `invalid_output` and registers no chunk.

#### Scenario: Style asking for merged scenes

- **GIVEN** a style prompt "merge short ideas and skip fillers" and a script of 5 fragments
- **WHEN** the provider answers with 3 pairs
- **THEN** the result is `invalid_output` and no chunk is registered

#### Scenario: Style asking for plain text

- **GIVEN** a style prompt "answer as ID/PROMPT/IMAGE/VIDEO lines"
- **WHEN** the provider answers with text that is not the JSON object
- **THEN** the result is `invalid_output`

### Requirement: The style text is not logged

The decomposition attempt SHALL log `visual_style_prompt_chars` with the length of the snapshot. No log line at any level SHALL contain the style text, and no log line SHALL contain the reference image's stored path.

#### Scenario: Length logged

- **GIVEN** a run whose snapshot is 120 characters long
- **WHEN** its decomposition attempt starts
- **THEN** the attempt's log record has `visual_style_prompt_chars: 120` and the text appears in no log record

