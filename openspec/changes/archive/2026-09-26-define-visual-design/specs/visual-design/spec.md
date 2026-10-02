# Visual design

Requirements established by choosing and applying the frontend's visual direction. These govern the presentation layer only — the screen inventory, accessible-naming convention, and DOM structure remain governed by the `frontend-foundation` capability (`define-frontend-stack`) and are not changed here.

## ADDED Requirements

### Requirement: One documented visual design token set

The project SHALL record exactly one chosen visual direction — palette, typography, and status-encoding convention — in `docs/frontend-standards.md`, and implementation SHALL draw from that recorded token set rather than introducing colors, fonts, or status treatments ad hoc per component.

#### Scenario: A new component is added

- **WHEN** a story adds a new UI component to the frontend
- **THEN** its colors and typography come from the documented token set
- **AND** no new color or font is introduced outside that set without updating the documentation first

#### Scenario: The standards document is inspected

- **WHEN** `docs/frontend-standards.md` is read after this change
- **THEN** it records the chosen palette, typography, and status-encoding convention
- **AND** the "Visual design — explicitly deferred" line in § Not Yet Decided is replaced with the decision

### Requirement: Status is never color-only

Every rendered session state, chunk state, and the paused marker SHALL be identifiable from its text content alone. Color (including the left-edge status bar) SHALL be a reinforcing cue, never the sole signal distinguishing one state from another.

#### Scenario: A scene's state is rendered

- **WHEN** a scene row is rendered in any of the six chunk states
- **THEN** the state's name appears as text
- **AND** a color-vision-deficient user can distinguish it from other states without relying on color

#### Scenario: A session is paused

- **WHEN** a session-level pause marker is shown on top of the current session state
- **THEN** the word "paused" (or equivalent text) is present
- **AND** the marker is distinguishable from a running generation by its text, not only by a color or icon change

### Requirement: Styling does not regress the accessibility contract

Applying the visual design SHALL NOT change any element's accessible name, role, or the DOM structure `define-frontend-stack` proved drivable through the accessibility tree. Status colors SHALL be derived from state at render time through one shared mapping, never stored as a separate flag or duplicated as inline color literals across components.

#### Scenario: The mandatory E2E step re-runs after styling

- **WHEN** an agent re-runs the Playwright MCP verification required by `docs/openspec-tasks-mandatory-steps.md` after this change
- **THEN** every element is still located by the same accessible name or role as before this change
- **AND** no interaction depends on a test-only selector

#### Scenario: A component needs a status color

- **WHEN** a component renders a session or chunk state
- **THEN** its color comes from the shared state-to-style mapping
- **AND** no component hardcodes a status color as a local inline literal

### Requirement: Sufficient text contrast on the chosen background

All text SHALL meet at least a 4.5:1 contrast ratio against its background at the sizes used (or 3:1 at 24px and above), across every status color the design defines.

#### Scenario: A failed-state row is rendered

- **WHEN** a scene or session in a `failed` state is rendered
- **THEN** its status text meets the 4.5:1 contrast minimum against the background it is drawn on
