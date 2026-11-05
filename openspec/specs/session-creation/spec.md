# session-creation Specification

## Purpose
TBD - created by archiving change start-video-project. Update Purpose after archive.
## Requirements
### Requirement: A session is registered from a title, a script and a language

The system SHALL register a session when given a non-empty title, a non-empty script and a language from the supported list. The registered session SHALL carry a system-generated identifier and SHALL be in state `submitted`. The script SHALL be accepted as plain text, with no identifiers, tags, delimiters or visual instructions required from the User.

#### Scenario: A valid project is started

- **WHEN** the User starts a project with a non-empty title, a non-empty script and a supported language
- **THEN** a session is registered with a system-generated identifier
- **AND** its state is `submitted`

#### Scenario: A plain script is submitted

- **WHEN** the submitted script contains no identifiers, tags, delimiters or image or video instructions
- **THEN** the session is registered without requiring any of them

#### Scenario: Two projects are started with the same title and script

- **WHEN** the User starts a project and then starts another with the same title and script
- **THEN** two separate sessions are registered with different identifiers
- **AND** neither replaces or is merged with the other

### Requirement: An empty title or script starts nothing

The system SHALL NOT register a session when the title or the script is empty. Content consisting only of whitespace SHALL be treated as empty for this purpose.

#### Scenario: The title is empty

- **WHEN** the User attempts to start a project with an empty title
- **THEN** no session is registered
- **AND** the reason is reported

#### Scenario: The script is empty

- **WHEN** the User attempts to start a project with an empty script
- **THEN** no session is registered
- **AND** the reason is reported

#### Scenario: The title is only whitespace

- **WHEN** the User attempts to start a project with a title containing only whitespace
- **THEN** no session is registered

### Requirement: No product limit on script length

The system SHALL NOT reject a script on the basis of a word, character or scene limit of its own. Where a limit outside the product's control prevents a script from being accepted, the system SHALL report the cause, and SHALL NOT truncate, summarise or otherwise alter the script to make it fit.

#### Scenario: A very long script is submitted

- **WHEN** the User starts a project with a script far longer than any typical reference length
- **THEN** it is not rejected for exceeding a product limit

#### Scenario: A script cannot be accepted by the infrastructure

- **WHEN** a limit outside the product's control prevents the script from being accepted
- **THEN** the cause is reported to the User
- **AND** no session is registered with a shortened or altered script

### Requirement: A language from the supported list is required

The system SHALL offer only languages from the hardcoded supported list, and SHALL NOT register a session without one. A language outside that list SHALL be refused regardless of how the request was made. No provider SHALL be called before a supported language has been selected.

#### Scenario: The start form is displayed

- **WHEN** the User opens the project start form
- **THEN** only languages from the hardcoded supported list can be chosen

#### Scenario: No language is selected

- **WHEN** the User attempts to start a project without selecting a language
- **THEN** no session is registered
- **AND** no provider is called

#### Scenario: An unsupported language is submitted directly

- **WHEN** a start request carries a language outside the supported list
- **THEN** it is refused and no session is registered

### Requirement: The title, script and language cannot change after registration

From registration onward, the session's title, script and selected language SHALL NOT be modifiable. No operation SHALL offer a means of altering them, and the stored script SHALL be exactly what the User submitted.

#### Scenario: The stored script is compared with what was submitted

- **WHEN** a registered session's script is read back
- **THEN** it is identical to the text the User submitted

#### Scenario: A later operation attempts to alter locked content

- **WHEN** any operation attempts to change a registered session's title, script or language
- **THEN** the content is unchanged

### Requirement: The session records what its project folder name derives from

A session SHALL record the instant it was created, at a precision sufficient to derive the project folder name defined for local storage. That recorded instant SHALL be the basis of the folder name, rather than the time at which the folder is later created.

#### Scenario: The folder is created after registration

- **WHEN** a session's project folder is created some time after the session was registered
- **THEN** its name derives from the session's recorded creation instant

#### Scenario: Two sessions are registered in the same minute

- **WHEN** two sessions with the same title are registered within the same minute
- **THEN** each retains its own identifier and its own recorded creation instant
- **AND** neither session's stored data is attributed to the other

### Requirement: The User receives the identifier needed to return to the session

On successful registration the system SHALL present the session's identifier to the User, since a session is reached by its identifier.

#### Scenario: A project has just been started

- **WHEN** a session is registered
- **THEN** the User is shown its identifier

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

