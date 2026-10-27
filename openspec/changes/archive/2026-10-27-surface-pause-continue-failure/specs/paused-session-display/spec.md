## ADDED Requirements

### Requirement: A failed pause or continue is shown as a sentence and leaves its control usable

The Pause and Continue controls SHALL be disabled while their request is outstanding and enabled again when it settles. When the request fails, whether the backend refuses it or it never reaches the backend, the page SHALL show a plain-language sentence beside the control and SHALL NOT show the raw error text. A refusal because the session does not exist SHALL read "This session could not be found."; any other failure SHALL read "The session could not be paused." for Pause and "The session could not be continued." for Continue. A new click SHALL clear the previous sentence. A request that succeeds SHALL show no sentence and SHALL NOT change the displayed state itself: the live update does (JOS-217; §8.3, §9).

#### Scenario: Pause fails with a network error

- **GIVEN** a session page for a session that is not paused
- **WHEN** the User clicks `Pause session` and the request fails without reaching the backend
- **THEN** the page shows "The session could not be paused."
- **AND** the `Pause session` button is enabled again

#### Scenario: Continue fails with a network error

- **GIVEN** a session page for a paused session
- **WHEN** the User clicks `Continue session` and the request fails without reaching the backend
- **THEN** the page shows "The session could not be continued."
- **AND** the `Continue session` button is enabled again

#### Scenario: The backend refuses because the session is unknown

- **GIVEN** a session page
- **WHEN** the User clicks `Pause session` or `Continue session` and the backend answers 404 with reason `unknown session`
- **THEN** the page shows "This session could not be found."

#### Scenario: The control is disabled while the request is outstanding

- **GIVEN** a session page for a session that is not paused
- **WHEN** the User clicks `Pause session` and the request has not settled
- **THEN** the `Pause session` button is disabled

#### Scenario: A successful request shows no sentence

- **GIVEN** a session page for a session that is not paused
- **WHEN** the User clicks `Pause session` and the request succeeds
- **THEN** no failure sentence is shown
- **AND** the header keeps showing the session as not paused until the live update reports the pause

#### Scenario: A new click clears the previous sentence

- **GIVEN** a session page showing "The session could not be paused."
- **WHEN** the User clicks `Pause session` again
- **THEN** the sentence is removed while the new request is outstanding
