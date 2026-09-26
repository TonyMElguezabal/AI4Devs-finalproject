# Frontend foundation

## Purpose

Requirements established by choosing the frontend stack. These govern the project's user-facing foundation, not product behaviour — the behaviours this change's prototype exercises are specified by their own stories: US-18 and US-19 (progress by phase and by scene), US-21 (paused distinguishable from running), US-25 and US-26 (correction on failure only), US-31 and US-32 (downloads).

## Requirements

### Requirement: Single documented frontend stack

The project SHALL record exactly one chosen frontend framework and build tooling in `docs/frontend-standards.md`, together with an ADR stating the rejected alternatives and the evidence for the choice. The document SHALL describe this product and SHALL contain no content inherited from another application's template. Implementation work SHALL follow that record rather than selecting technology per ticket.

#### Scenario: An implementation story begins

- **WHEN** work starts on any user-facing story
- **THEN** `docs/frontend-standards.md` names the framework, build tooling and start command to use
- **AND** the story does not choose its own frontend technology

#### Scenario: The standards document is inspected

- **WHEN** `docs/frontend-standards.md` is read after this change
- **THEN** it describes this product
- **AND** no domain object from another application's template remains

### Requirement: A UI an agent can drive

The chosen stack SHALL produce a UI drivable through the accessibility tree, and the project SHALL document stable, predictable accessible names for phase sections, scene rows, scene detail fields and actions. The application SHALL start from one documented command at a fixed local URL. Automation SHALL NOT depend on selectors that exist only for tests.

#### Scenario: The mandatory E2E step runs

- **WHEN** an agent performs the Playwright MCP verification required by `docs/openspec-tasks-mandatory-steps.md`
- **THEN** it starts the application from the documented command
- **AND** it locates every element it must interact with through the accessibility tree

#### Scenario: A candidate stack cannot be driven

- **WHEN** a candidate's output cannot be reliably driven through the accessibility tree
- **THEN** it is eliminated regardless of its score on other criteria

### Requirement: Recorded evidence that the scene list holds at scale

Before implementation stories start, the project SHALL hold recorded evidence that the chosen stack renders a session with hundreds of scenes, receiving rapid concurrent state changes, in ascending scene-identifier order and without a reload. Evidence SHALL state which observations depend on a stand-in for the live-update mechanism rather than the chosen one.

#### Scenario: Evidence is reviewed before implementation

- **WHEN** a reviewer opens the ADR produced by this change
- **THEN** the scale, reconnection, conditional-editing, agent-driven and download-gating results are each recorded, including any that failed
- **AND** any dependency on a live-update stand-in is stated explicitly

#### Scenario: Scenes complete out of order

- **WHEN** scene updates arrive in an order different from the scene identifiers
- **THEN** the rendered list stays in ascending identifier order

#### Scenario: A behaviour could not be proven within the timebox

- **WHEN** the timebox ends with a behaviour unproven
- **THEN** the decision is still recorded
- **AND** the unproven behaviour is written down as a risk rather than left implicit

### Requirement: Editing surface derived from stage state

The correction form for a visual instruction SHALL be rendered only when that stage is failed, and SHALL be absent — not merely disabled — otherwise. The scene identifier, narration prompt and scene order SHALL NOT be rendered as editable inputs in any state.

#### Scenario: A stage succeeded

- **WHEN** a scene's image stage has completed successfully
- **THEN** no form for editing its image instruction is present

#### Scenario: A stage failed

- **WHEN** a scene's image stage is failed
- **THEN** a form for correcting its image instruction is present
- **AND** no input for the scene identifier, narration prompt or scene order is present

### Requirement: An open page recovers from a lost connection

The chosen stack SHALL keep an open session page correct across a dropped push connection and a backend restart, reaching current state without the user reloading.

#### Scenario: The connection drops while state changes

- **WHEN** the push connection is lost, state changes occur, and the connection is restored
- **THEN** the open page reaches the current state without a manual reload
