## ADDED Requirements

### Requirement: The start form shows the script's word count and estimated duration

The project start form SHALL show, below the Script field, the script's word count and an estimated video duration whenever the script has non-whitespace content. Words SHALL be the script's whitespace-separated tokens. The estimated duration SHALL be the word count at 150 words per minute, rounded to the nearest second and shown as `~m:ss`. The line SHALL update as the script changes, and SHALL be hidden while the script is empty or only whitespace. The estimate SHALL be informational only: it SHALL NOT block, alter or limit the submission, and the script SHALL NOT leave the page to compute it.

#### Scenario: A script is entered

- **WHEN** the User enters the script `Daniel doesn't need this 401k to last forever. He needs it to bridge him. 55 to 59 and a half: Rule of 55 401k withdrawals, penalty-free. 59 and a half to 62: any retirement money now, no penalty.`
- **THEN** `38 words · Estimated video duration ~0:15` is shown below the Script field

#### Scenario: The script changes

- **WHEN** an estimate is shown and the User types more words
- **THEN** the line updates without the User having to leave the field

#### Scenario: A one-word script

- **WHEN** the script is a single word
- **THEN** the line reads `1 word · Estimated video duration ~0:00`

#### Scenario: An empty or whitespace-only script

- **WHEN** the script is empty or contains only whitespace
- **THEN** no estimate line is shown

#### Scenario: The estimate is described to assistive technology

- **WHEN** an estimate is shown
- **THEN** it is the Script field's accessible description
- **AND** the field's accessible name stays `Script`

#### Scenario: The estimate does not affect submission

- **WHEN** an estimate is shown
- **THEN** the `Start project` button is enabled or disabled exactly as without it
- **AND** the submitted title, script and language are unchanged
