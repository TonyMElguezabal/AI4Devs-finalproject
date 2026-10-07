# Persistence foundation

## Purpose

Requirements established by choosing how session state is stored. These govern the project's persistence foundation, not user-facing product behaviour — the behaviours built on it are specified by their own stories: US-28 (restart survival), US-29 (idempotent confirmations), US-30 (local files and folder naming).
## Requirements
### Requirement: Documented data model for this product

The project SHALL document its data model in `docs/data-model.md`, covering sessions, chunks and stage attempts with the fields the PRD requires, together with their relationships. The document SHALL contain no entities inherited from another application's domain.

#### Scenario: The data model is inspected after this change

- **WHEN** `docs/data-model.md` is read
- **THEN** it describes sessions, chunks and stage attempts for this product
- **AND** no entity from an unrelated inherited domain remains

#### Scenario: An implementation story needs a field

- **WHEN** work begins on a story that reads or writes session state
- **THEN** the documented model names the record and field to use
- **AND** the story does not invent a parallel representation

### Requirement: Provider requests recorded before they are sent

The system SHALL persist a provider request's stage, provider and external identifier **before** the request is sent, so that a restart can determine what was in flight. A request whose record exists SHALL be resolvable after restart either to its original result or to exactly one failed attempt.

#### Scenario: The process stops between sending and responding

- **WHEN** the application restarts after a provider request was sent but before its result arrived
- **THEN** the stored record identifies the stage, provider and external identifier of that request

#### Scenario: The provider no longer holds the result

- **WHEN** a recorded in-flight request cannot be recovered from its provider after restart
- **THEN** exactly one failed attempt is recorded for that stage
- **AND** no duplicate attempt is created for the same request

### Requirement: Repeated confirmations rejected by the store

The store SHALL enforce uniqueness for a completed generation, so that a repeated success confirmation cannot create a second result, launch the next stage twice, or add a scene to the assembly set more than once. Uniqueness SHALL be enforced by the store itself rather than by a prior read in application code. A confirmation the store refuses SHALL change nothing else: no scene or session state, no stored result reference, and no launch. This applies to every generation stage: voice-over, narration timestamps, decomposition, scene image, scene clip and final assembly (§12.1, AC14).

#### Scenario: The same confirmation arrives twice

- **WHEN** a success confirmation for a generation that already completed is processed again
- **THEN** no second result is stored
- **AND** the next stage is not launched again

#### Scenario: Two confirmations arrive concurrently

- **WHEN** two confirmations for the same generation are processed at the same time
- **THEN** exactly one succeeds and the other is rejected by the store

#### Scenario: A refused image confirmation leaves the scene as it is

- **GIVEN** a scene whose image was confirmed and whose clip stage has started or completed
- **WHEN** another success confirmation for its image arrives
- **THEN** the scene keeps its state and its stored image reference
- **AND** no clip request is sent for it

#### Scenario: The final video is recorded once

- **GIVEN** a session whose final video is already recorded
- **WHEN** another assembly success is confirmed for it
- **THEN** the recorded final video is not replaced

#### Scenario: Assembly is not started twice

- **GIVEN** a session that already has a final video, or an assembly attempt in flight
- **WHEN** an assembly launch is requested for it, by a scene completion or by continue
- **THEN** no assembly attempt is recorded and the assembly tool is not run

#### Scenario: A scene is assembled once

- **GIVEN** a scene whose clip was confirmed more than once
- **WHEN** the final assembly runs
- **THEN** that scene contributes exactly one clip to the assembly input

### Requirement: File references bound to the owning project folder

Each session SHALL record its project folder, and artefact records SHALL reference files by paths relative to that folder, so that two projects sharing a title never resolve to each other's files.

#### Scenario: Two projects share a title

- **WHEN** two sessions created with the same title store their artefacts
- **THEN** each session's records resolve only to files inside its own folder

#### Scenario: A project folder is renamed in place

- **WHEN** a project folder is renamed and the session's recorded folder is updated
- **THEN** every artefact reference for that session resolves correctly without further changes

### Requirement: Verification process reconciled with the chosen store

The project SHALL record whether the mandatory pre- and post-test state verification in `docs/openspec-tasks-mandatory-steps.md` is executable against the chosen store, and where it is not, SHALL propose an amendment to that document rather than leaving the step unperformed.

#### Scenario: The chosen store is not a database

- **WHEN** the selected store cannot satisfy the step as written
- **THEN** an amendment to the mandatory steps document is proposed
- **AND** the reason is recorded in the ADR

