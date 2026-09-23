# Provider configuration foundation

Requirements established by choosing the hardcoded providers and parameter values. These govern what the project commits to as its provider set and its constants, not the behaviour that consumes them — that belongs to its own stories: US-09 (segmentation), US-15 (speed factor recorded per scene), US-16 (assembly), US-22 (retry budget and per-phase limits), US-37 (per-stage request limit).

## ADDED Requirements

### Requirement: One recorded provider per stage, verified against its capability

The project SHALL record exactly one provider for each of the five stages — reasoning, voice, alignment, image and video — in `docs/PRD.md` §11, together with an ADR stating the rejected candidates and the evidence. Each provider's capability SHALL have been demonstrated by calling it against this project's own requirement, not established from published documentation. Implementation work SHALL use the recorded provider rather than selecting one per story.

#### Scenario: An implementation story calls a provider

- **WHEN** work starts on a story that calls a provider
- **THEN** `docs/PRD.md` §11 names the provider for that stage
- **AND** the story does not select its own provider

#### Scenario: A capability was not demonstrated

- **WHEN** a candidate's required capability could not be demonstrated by calling it
- **THEN** that candidate is not recorded as the chosen provider for the stage

#### Scenario: No candidate satisfies a stated capability

- **WHEN** no available provider satisfies a capability required by §11
- **THEN** the gap is raised as a product question
- **AND** the capability requirement is not weakened to fit an available provider

### Requirement: The timestamp mechanism is established before decomposition is built

The project SHALL record whether the chosen voice provider returns native timestamps, and whether their granularity is sufficient to locate the sentence boundaries segmentation cuts on. The record SHALL state which of the two mechanisms in §11.1 applies in practice — native timestamps, or forced alignment as the standing mechanism.

#### Scenario: Native timestamps are returned

- **WHEN** the chosen voice provider returns timestamps with the generated MP3
- **THEN** their granularity is verified against a script containing the structures segmentation cuts on
- **AND** the record states whether they are usable for that purpose

#### Scenario: Timestamps are absent or too coarse

- **WHEN** the voice provider returns no timestamps, or returns them at a granularity that cannot locate a sentence boundary
- **THEN** the record states that forced alignment is the standing mechanism rather than a fallback

### Requirement: A recorded not-retryable failure signal per provider

For each chosen provider, the project SHALL record how a failure the provider will never succeed at is distinguished from a transient failure, and what the system matches on to tell them apart.

#### Scenario: A provider rejects content

- **WHEN** a provider rejects a request for a reason that will not change on retry
- **THEN** the recorded signal identifies it as not retryable
- **AND** the system does not consume automatic retries on it

#### Scenario: A provider fails transiently

- **WHEN** a provider fails for a reason that may succeed on a later attempt
- **THEN** the recorded signal identifies it as retryable

### Requirement: A complete and internally consistent parameter set

The project SHALL record values for the narration voice, quality and speed; the video provider's admitted durations and maximum; the segmentation lower bound; the acceptable speed-factor limit; the per-phase maximum times; the output resolution and frame rate; the supported script languages; and the maximum simultaneous requests per stage. Derived values SHALL be consistent with the values they derive from: the segmentation lower bound SHALL be consistent with the shortest admitted duration of the chosen video provider, and the per-stage request maximum SHALL leave the automatic retry budget unable to exceed the provider's rate limit. A value that could not be settled SHALL be recorded as provisional with the dependency that settles it named.

#### Scenario: The parameter set is reviewed

- **WHEN** a reviewer opens §11 after this change
- **THEN** every parameter the section lists has a recorded value
- **AND** any provisional value names what will settle it

#### Scenario: The lower bound is checked against the video provider

- **WHEN** the segmentation lower bound is compared with the video provider's admitted durations
- **THEN** it is consistent with the shortest admitted duration

#### Scenario: The request maximum is checked against the retry budget

- **WHEN** every stage runs at its maximum simultaneous requests and failures trigger automatic retries
- **THEN** the provider's rate limit is not exceeded

### Requirement: A language is supported only where the whole chain supports it

A language SHALL appear in the supported list only where the voice provider narrates it, the alignment provider aligns it, and the reasoning provider segments it correctly, each confirmed with a real script in that language.

#### Scenario: A language is confirmed end to end

- **WHEN** a language is verified with a real script through narration, alignment and segmentation
- **THEN** it may appear in the supported list

#### Scenario: A language fails one stage

- **WHEN** a language is narrated but cannot be aligned
- **THEN** it does not appear in the supported list

### Requirement: Values live in one place in source and cannot drift from the PRD

The recorded values SHALL exist as typed constants in a single module in source, not as a configuration file and not as values supplied at runtime. A test SHALL assert that those constants match the values recorded in `docs/PRD.md` §11.

#### Scenario: A value is changed in source

- **WHEN** a constant is changed without the corresponding PRD entry being updated
- **THEN** the test fails

#### Scenario: Implementation needs a value

- **WHEN** code needs a hardcoded parameter
- **THEN** it reads it from the constants module
- **AND** it does not define its own copy

### Requirement: Credentials never enter the repository

Provider credentials SHALL be read from the machine's local environment or a local secrets file kept out of version control. No credential SHALL appear in source, in the recorded evidence this change produces, or in logs.

#### Scenario: The application calls a provider

- **WHEN** a provider is called
- **THEN** its credential is read from the local environment or the local secrets file

#### Scenario: Evidence is committed

- **WHEN** the transcripts and reports produced by this change are committed
- **THEN** they contain no credential material
