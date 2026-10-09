# paused-session-display Specification

## Purpose
How a paused session is shown: the marker beside the state and progress, held work shown apart from running work at session and scene level, the `running` field that supports it, the pause never shown as success or failure, and Continue available whenever paused. Established by `distinguish-paused-session` (JOS-153).
## Requirements

### Requirement: A paused session shows its state and progress with a marker that waits for the User

When a session is paused, its page SHALL show the session's current state, and the progress reached, together with a paused marker that states the session is waiting for the User to continue. The marker SHALL be shown beside the state, never in place of it, and SHALL be identifiable by its text. The progress reached SHALL remain visible while paused: the failed phase and failed scenes when the state is `failed`, and every scene row with its current state (§8.1, §8.3, AC21).

#### Scenario: A paused session in progress

- **GIVEN** a session in `chunks-processing` that is paused
- **WHEN** its page is viewed
- **THEN** the state `chunks-processing` is shown
- **AND** a marker reading that the session is paused and waiting for the User to continue is shown beside it

#### Scenario: Progress stays visible while paused

- **GIVEN** a paused session with scenes in `chunk-complete`, `image-generating` and `submitted`
- **WHEN** its page is viewed
- **THEN** every scene row is shown with its current state
- **AND** no scene row is hidden or replaced by the paused marker

#### Scenario: The marker disappears on continue without a reload

- **GIVEN** an open page of a paused session
- **WHEN** the session is continued and the live event arrives
- **THEN** the paused marker is no longer shown and the state is unchanged
- **AND** the page was not reloaded

### Requirement: The representation reports running work separately from held work

The session representation SHALL include `running`: the stages with work actually in flight and the number of units in each, derived from the stored in-flight records. A scene counts as running for the image stage when it is `image-generating` and for the video stage when it is `video-generating`; a session-level stage counts as running when it has a stage attempt whose outcome is `in-flight`. `running` SHALL be computed whether or not the session is paused, SHALL list stages in pipeline order, and SHALL be read-only. A unit SHALL never be both running and held (§9).

#### Scenario: Running and held beside each other

- **GIVEN** a paused session with scene 1 `image-generating` (sent before the pause) and scenes 2 and 3 `submitted`
- **WHEN** the session is read
- **THEN** `running` lists the image stage with one unit
- **AND** `held` lists the image stage with two units

#### Scenario: Nothing running

- **GIVEN** a paused session whose scenes are all `submitted` or `chunk-complete`
- **WHEN** the session is read
- **THEN** `running` is empty

#### Scenario: A session-level phase in flight

- **GIVEN** a session with a `timestamps` stage attempt whose outcome is `in-flight`
- **WHEN** the session is read
- **THEN** `running` lists the decomposition stage with one unit

#### Scenario: Running is reported when not paused

- **GIVEN** a session that is not paused with two scenes `video-generating`
- **WHEN** the session is read
- **THEN** `running` lists the video stage with two units and `held` is empty

#### Scenario: Running reaches an open page live

- **GIVEN** an open page of a paused session with one scene `image-generating`
- **WHEN** that scene's image completes and the live event arrives
- **THEN** the page no longer counts it as running, without a reload

### Requirement: A generation still in progress during a pause is shown as in progress

While a session is paused, the page SHALL show work that is still generating as in progress, distinct from the paused marker and from held work. The header SHALL show, beside the marker, what is still generating from `running`, or that nothing is generating when `running` is empty; and what will start on continue from `held`. A scene that is generating SHALL say it is still generating; a held scene SHALL say it is waiting for continue. The page SHALL NOT compute either list itself (§9, AC21).

#### Scenario: A scene still generating beside held scenes

- **GIVEN** a paused session with scene 1 `image-generating` and scenes 2 and 3 held
- **WHEN** its page is viewed
- **THEN** the header shows one image still generating and two images waiting for continue, as separate statements
- **AND** scene 1's row says it is still generating and does not say it is waiting
- **AND** the rows of scenes 2 and 3 say they are waiting for continue and do not say they are generating

#### Scenario: Nothing is generating

- **GIVEN** a paused session whose `running` is empty
- **WHEN** its page is viewed
- **THEN** the header says nothing is generating

#### Scenario: Not paused

- **GIVEN** a session that is not paused
- **WHEN** its page is viewed
- **THEN** no paused marker, no held line, no "still generating" scene label and no "nothing is generating" line is shown

### Requirement: A pause is shown as neither success nor failure

The paused marker SHALL NOT use the success or the failure status styling, and SHALL NOT be presented as an alert. Pausing SHALL NOT change the status styling the session header or a scene row would have from its state, except that a held scene SHALL be styled as waiting rather than as in progress. A session paused in `failed` or `final-video` SHALL show that state's own styling and failure or download information exactly as when not paused (§8.3).

#### Scenario: A paused session in progress is not styled as complete or failed

- **GIVEN** a paused session in `chunks-processing`
- **WHEN** its page is viewed
- **THEN** neither the header nor the marker uses the complete or failed styling
- **AND** the marker is not announced as an alert

#### Scenario: A held scene is styled as waiting

- **GIVEN** a paused session with a held scene in `image-complete`
- **WHEN** its row is rendered
- **THEN** the row uses the waiting styling, not the in-progress styling

#### Scenario: A failed session that is paused

- **GIVEN** a session in `failed` with failed scenes that is paused
- **WHEN** its page is viewed
- **THEN** the failed phase and failed scenes are shown as when not paused
- **AND** the paused marker is shown as its own statement, separate from the failure

### Requirement: Continue is available whenever the session is paused

The page SHALL offer Continue whenever the session is paused, in every session state. It SHALL offer Pause whenever the session is not paused and has not reached `final-video`. It SHALL NOT offer both at once.

#### Scenario: Paused before the chunks exist

- **GIVEN** a session in `voice-over-complete` that is paused
- **WHEN** its page is viewed
- **THEN** a Continue control is offered and no Pause control is offered

#### Scenario: Paused while failed

- **GIVEN** a session in `failed` that is paused
- **WHEN** its page is viewed
- **THEN** a Continue control is offered

#### Scenario: Final video reached

- **GIVEN** a session in `final-video` that is not paused
- **WHEN** its page is viewed
- **THEN** no Pause control is offered
