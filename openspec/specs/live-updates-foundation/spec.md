# Live updates foundation

## Purpose

Requirements established by choosing the live progress update mechanism. These govern how state reaches an open page, not what the page renders with it — the rendering is specified by its own stories: US-18 and US-19 (progress by phase and by scene), US-21 (the paused marker), US-34 (diagnostics).

## Requirements

### Requirement: Single documented live-update mechanism

The project SHALL record exactly one chosen mechanism for pushing state changes, results and errors to an open session page, together with its reconnection and catch-up rule, in both `docs/backend-standards.md` and `docs/frontend-standards.md`. An ADR SHALL state the rejected alternatives and the evidence behind the choice. Implementation work SHALL follow that record rather than selecting a transport per story.

#### Scenario: An implementation story begins

- **WHEN** work starts on a story that shows live progress
- **THEN** `docs/backend-standards.md` and `docs/frontend-standards.md` name the same mechanism and the same reconnection and catch-up rule
- **AND** the story does not choose its own transport

#### Scenario: The direction of flow is examined

- **WHEN** the mechanism is chosen
- **THEN** the record states whether anything flows browser to server outside ordinary requests
- **AND** a one-way transport is recorded as a conclusion with its reasoning rather than as an assumption

### Requirement: A defined event payload

The project SHALL define the payload of a session event and of a scene event before implementation stories begin. A session event SHALL carry the session's current state and its paused marker as two separate fields. A scene event SHALL carry the scene identifier, the scene's current chunk state, the affected stage when one failed, the provider used and the attempt count for that stage. An event SHALL carry the entity's current state rather than a transition to be applied to a previous one.

#### Scenario: A page receives an event for an entity it already holds

- **WHEN** a scene event arrives for a scene the page already displays
- **THEN** the page replaces what it holds for that scene with the event's contents
- **AND** it does not need any earlier event for that scene to be correct

#### Scenario: The same event is delivered twice

- **WHEN** an event for an entity is delivered more than once
- **THEN** applying it again leaves the page in the same state as applying it once

#### Scenario: A session is paused

- **WHEN** a session is paused and later continued
- **THEN** the event carries the paused marker separately from the session state
- **AND** the session state reported before the pause and after continuing is unchanged by the pause itself

### Requirement: An open page reaches current state after a disconnection

The project SHALL record a single rule for what happens to state changes emitted while a page was disconnected, chosen explicitly between replaying missed events and resynchronising from current state, with the reason recorded. Following that rule, an open page SHALL reach the session's current state after a dropped connection or a backend restart without the user reloading. Where the rule is resynchronisation, the request the page uses to obtain current state SHALL be defined as part of this contract, returning the session state, the paused marker and every scene's current state.

#### Scenario: The connection drops while state changes

- **WHEN** the connection is lost, scenes change state, and the connection is restored
- **THEN** the open page reaches the current state of the session and of every scene
- **AND** the user does not reload the page

#### Scenario: The application restarts mid-session

- **WHEN** the application restarts while a session is in progress
- **THEN** an open page recovers and resumes receiving updates without a manual reload

#### Scenario: Transitions are missed during a disconnection

- **WHEN** state transitions occur while a page is disconnected
- **THEN** the recorded rule states whether those transitions reach the page or are superseded by current state
- **AND** any loss of intermediate transitions is recorded as a known consequence rather than left undefined

### Requirement: Session-scoped delivery

A stream SHALL be scoped to a single session identifier and SHALL deliver only that session's events. An open page SHALL use one stream for the session it displays rather than one per scene. Isolation between sessions SHALL be a property of how streams are addressed, not a filter applied to a shared feed.

#### Scenario: Two sessions are processing at the same time

- **WHEN** a page is open on one session while another session is also processing
- **THEN** the page receives no event belonging to the other session

#### Scenario: A session with hundreds of scenes is opened

- **WHEN** a page opens a session containing hundreds of scenes
- **THEN** it opens a single stream for that session

### Requirement: Updates survive bursts without loss or reordering

Where events for the same entity are collapsed to reduce burst cost, only the latest state for that entity SHALL be sent, and events for distinct scenes SHALL NOT be collapsed into one another. No entity's first pending event SHALL be delayed by an artificial interval. After a burst, the page SHALL hold the correct current state for every affected scene, and per-scene state changes SHALL arrive in the order they occurred.

#### Scenario: Many scenes transition at once

- **WHEN** roughly two hundred scenes change state at nearly the same time
- **THEN** the page holds the correct current state for every one of them
- **AND** no scene's updates arrive out of order relative to that same scene

#### Scenario: A scene transitions repeatedly during a burst

- **WHEN** a scene changes state more than once while a burst is being delivered
- **THEN** the page reaches that scene's latest state

### Requirement: An idle connection stays alive or reconnects transparently

The mechanism SHALL keep an otherwise idle connection alive, or reconnect transparently when it is closed. The client SHALL reconnect after a drop with bounded backoff, and every reconnection SHALL apply the recorded catch-up rule.

#### Scenario: A session is quiet for a long stretch

- **WHEN** a session produces no events for a long period and then produces one
- **THEN** the open page receives it without the user reloading

#### Scenario: The backend is briefly unavailable

- **WHEN** the backend stops responding and later recovers
- **THEN** the client's reconnection attempts are bounded rather than continuous
- **AND** the page reaches current state once the backend recovers

### Requirement: Recorded evidence before implementation

Before implementation stories start, the project SHALL hold recorded results for the burst, disconnection, restart and idle experiments, including any that failed or could not be completed within the timebox. The record SHALL state which observations depended on a stand-in rather than on the decided backend stack or store.

#### Scenario: Evidence is reviewed before implementation

- **WHEN** a reviewer opens the ADR produced by this change
- **THEN** the burst, disconnection, restart and idle results are each recorded
- **AND** any dependency on a stand-in is stated explicitly

#### Scenario: An experiment could not be completed within the timebox

- **WHEN** the timebox ends with an experiment unfinished
- **THEN** the decision is still recorded
- **AND** the unproven behaviour is written down as a risk rather than reported as passing
