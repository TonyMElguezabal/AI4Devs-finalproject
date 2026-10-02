# Backend foundation

Requirements established by choosing the backend stack. These govern the project's technical foundation, not user-facing product behaviour — the product behaviours this change's prototype exercises (retry budget, request limits, restart survival, idempotent confirmations) are specified by their own stories: US-22, US-37, US-28, US-29.

## ADDED Requirements

### Requirement: Single documented backend stack

The project SHALL record exactly one chosen backend language, runtime and framework in `docs/backend-standards.md`, together with an ADR stating the rejected alternatives and the evidence for the choice. Implementation work SHALL follow that record rather than selecting technology per ticket.

#### Scenario: An implementation story begins

- **WHEN** work starts on any backend implementation story
- **THEN** `docs/backend-standards.md` names the language, runtime and framework to use
- **AND** the story does not choose its own backend technology

#### Scenario: The standards document is inspected

- **WHEN** `docs/backend-standards.md` is read after this change
- **THEN** it describes Vid4You
- **AND** it contains no content inherited from the template of another application

### Requirement: Provider credentials outside source control

The backend SHALL read provider credentials from the local environment or a local secrets file that is excluded from version control. Credentials SHALL NOT appear in source code, in configuration committed to the repository, or in any artifact produced by this change.

#### Scenario: The repository is searched for credentials

- **WHEN** the repository is inspected at any commit produced by this change
- **THEN** no provider API key or secret is present

#### Scenario: A required credential is absent at startup

- **WHEN** the backend starts without a required provider credential in its environment
- **THEN** it reports which credential is missing
- **AND** the message contains no secret value

### Requirement: Recorded evidence for the hard runtime behaviours

Before implementation stories start on the chosen stack, the project SHALL hold recorded evidence that the stack can express the bounded retry budget, the per-stage concurrency limit shared across sessions, restart-safe resumption of in-flight provider requests, and idempotent handling of repeated success confirmations. Evidence SHALL state which observations depend on a temporary stand-in rather than a final component.

#### Scenario: Evidence is reviewed before implementation

- **WHEN** a reviewer opens the ADR produced by this change
- **THEN** each of the four behaviours has a recorded result, including any that failed
- **AND** any dependency on a disposable persistence stand-in is stated explicitly

#### Scenario: A behaviour could not be proven within the timebox

- **WHEN** the timebox ends with a behaviour unproven
- **THEN** the decision is still recorded
- **AND** the unproven behaviour is written down as a risk rather than left implicit
