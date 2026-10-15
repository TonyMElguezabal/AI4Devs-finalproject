## MODIFIED Requirements

### Requirement: One documented visual design token set

The project SHALL record exactly one chosen visual direction — light and dark palettes, typography, depth (surface extrusion and shadow scale), spacing scale, motion timing, and status-encoding convention — in `docs/frontend-standards.md`, and implementation SHALL draw from that recorded token set rather than introducing colors, fonts, shadows, or status treatments ad hoc per component. Every color token SHALL be defined for both the light and the dark theme.

#### Scenario: A new component is added

- **WHEN** a story adds a new UI component to the frontend
- **THEN** its colors, typography, shadows and spacing come from the documented token set
- **AND** no new color, font or shadow is introduced outside that set without updating the documentation first

#### Scenario: The standards document is inspected

- **WHEN** `docs/frontend-standards.md` is read after this change
- **THEN** it records the "Studio" direction: both palettes, the typography, the depth and motion tokens, and the status-encoding convention
- **AND** it no longer describes the "Render Console" direction as current

#### Scenario: The operating system switches theme

- **WHEN** the operating system's color scheme preference is dark
- **THEN** every surface, text and status color comes from the dark palette
- **AND** when the preference is light, every one comes from the light palette, with no color defined for only one theme

### Requirement: Status is never color-only

Every rendered session state, chunk state, phase status, held marker and the paused marker SHALL be identifiable from its text content alone, shown as a plain-language label (for example "Generating image", "Done", "Needs attention") rather than the raw wire state string. Each label SHALL come from one shared state-to-label mapping. Color and icon SHALL be reinforcing cues, never the sole signal distinguishing one state from another.

#### Scenario: A scene's state is rendered

- **WHEN** a scene card is rendered in any of the six chunk states
- **THEN** that state's plain-language label appears as text in the card
- **AND** the raw state string (for example `image-generating`) does not appear as visible text
- **AND** a color-vision-deficient user can distinguish it from other states without relying on color or icon

#### Scenario: A session is paused

- **WHEN** a session-level pause marker is shown on top of the current session state
- **THEN** the word "Paused" (or equivalent text) is present
- **AND** the marker is distinguishable from a running generation by its text, not only by a color or icon change

#### Scenario: A phase status is rendered

- **WHEN** the phase stepper and the phase cards are rendered
- **THEN** each phase shows its status label ("Not started", "In progress", "Complete", "Failed") as text beside its icon

### Requirement: Styling does not regress the accessibility contract

Applying the visual design SHALL NOT change any element's accessible name or role listed in `docs/frontend-standards.md` § Accessible Naming Convention, and SHALL NOT add a test-only attribute. Markup MAY gain wrapper elements, decorative icons and layout regions, provided decorative icons are hidden from the accessibility tree and every named element stays reachable by the same name and role. Status colors SHALL be derived from state at render time through one shared mapping, never stored as a separate flag or duplicated as inline color literals across components.

#### Scenario: The mandatory E2E step re-runs after the redesign

- **WHEN** an agent re-runs the Playwright MCP verification required by `docs/openspec-tasks-mandatory-steps.md` after this change
- **THEN** every element is still located by the same accessible name or role as before this change
- **AND** no interaction depends on a test-only selector

#### Scenario: A decorative icon is rendered beside a label

- **WHEN** a status pill, button or step shows an icon next to its text
- **THEN** the icon is hidden from the accessibility tree
- **AND** the element's accessible name is unchanged by the icon

#### Scenario: A component needs a status color

- **WHEN** a component renders a session state, chunk state or phase status
- **THEN** its color comes from the shared state-to-style mapping
- **AND** no component hardcodes a status color as a local inline literal

### Requirement: Sufficient text contrast on the chosen background

All text SHALL meet at least a 4.5:1 contrast ratio against the surface it is drawn on at the sizes used (or 3:1 at 24px and above), in both the light and the dark theme, across every status color and tinted status background the design defines.

#### Scenario: A failed-state card is rendered

- **WHEN** a scene, phase or session in a failed state is rendered in either theme
- **THEN** its status text meets the 4.5:1 contrast minimum against the tinted background it is drawn on

#### Scenario: Contrast is verified

- **WHEN** the token set is changed
- **THEN** every text/background token pair is checked with the WCAG relative-luminance formula in both themes
- **AND** the computed ratios are recorded in the change's verification report

## ADDED Requirements

### Requirement: Layout adapts to the window width

The start form and session page SHALL be usable from 375px to 1440px wide without the page body scrolling horizontally. At 1024px and wider, the project panel SHALL sit beside the pipeline; below 1024px it SHALL stack above it. The scene list SHALL reflow its column count to the available width while keeping ascending scene order.

#### Scenario: The session page is shown at phone width

- **WHEN** the session page is rendered 375px wide
- **THEN** the project panel appears above the pipeline
- **AND** the page body has no horizontal scroll

#### Scenario: The session page is shown on a desktop

- **WHEN** the session page is rendered 1024px wide or wider
- **THEN** the project panel and the pipeline appear side by side

#### Scenario: Scenes reflow

- **WHEN** the width changes so a different number of scene cards fits per row
- **THEN** the scenes still read in ascending scene-identifier order, left to right and top to bottom

### Requirement: Motion respects user preferences

Interface motion (press feedback, details unfolding, content entrance) SHALL only use `transform` and `opacity`, SHALL never block input while it runs, and SHALL be replaced by an instant change when the user's `prefers-reduced-motion` preference is `reduce`. Translucent surfaces SHALL become opaque when `prefers-reduced-transparency` is `reduce`. A live update SHALL NOT replay the entrance animation of content that was already on screen.

#### Scenario: Reduced motion is requested

- **WHEN** `prefers-reduced-motion: reduce` is set and the user opens a scene's details
- **THEN** the details appear without any movement animation

#### Scenario: A live update arrives

- **WHEN** a scene's state changes through a live update while the page is open
- **THEN** only the changed scene's label, icon and color update
- **AND** the other cards on the page do not replay an entrance animation

#### Scenario: Reduced transparency is requested

- **WHEN** `prefers-reduced-transparency: reduce` is set
- **THEN** the top bar is drawn with an opaque background and no blur
