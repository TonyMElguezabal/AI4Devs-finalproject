# Session consultation

Requirements for reaching a session by its identifier. Live updates on the open page (US-18), per-phase and per-scene rendering (US-18, US-19), downloads (US-31, US-32) and diagnostics (US-34) are owned by their own stories; this capability covers what the read returns, what the page shows, how an unknown identifier is reported, and the guarantee that a consulted session exposes only its own data.

## ADDED Requirements

### Requirement: A session can be consulted by its identifier

The system SHALL return a session's content when given its identifier: its title, its script exactly as submitted, its language, its current state, its paused marker, its creation time, and each of its scenes with the scene's current state and available results. The session page SHALL show the title, the script, the session's progress and the results available.

#### Scenario: An existing session is consulted

- **WHEN** the User consults an existing session by its identifier
- **THEN** its title, script, progress and available results are shown

#### Scenario: The script is shown as submitted

- **WHEN** a session is consulted
- **THEN** the script shown is identical to the script stored at registration

#### Scenario: A session that has just been registered is consulted

- **WHEN** a session with no scenes yet is consulted
- **THEN** its title, script and current state are shown
- **AND** the absence of scenes is shown as such, not as an error

### Requirement: A consulted session shows only its own data

Every lookup made while consulting a session SHALL be scoped by that session's identifier. A consulted session SHALL show only its own scenes, files and results, even when another session has the same title or contains scenes with the same scene identifiers.

#### Scenario: Two sessions share a title

- **WHEN** two sessions with the same title exist and one is consulted by its identifier
- **THEN** only that session's scenes, files and results are shown

#### Scenario: Two sessions each contain a scene with ID 1

- **WHEN** two sessions each contain a scene with ID 1 and one session is consulted
- **THEN** the other session's scene is not shown

#### Scenario: A file of one session is requested through another

- **WHEN** a request for a session's result refers to a file belonging to a different session
- **THEN** the file is not returned

### Requirement: Scenes are presented in identifier order

The read and the page SHALL present a session's scenes in ascending scene identifier order, regardless of the order in which they were created or completed.

#### Scenario: Scenes complete out of order

- **WHEN** scene 3 reached its current state before scene 2 and the session is consulted
- **THEN** the scenes are presented in the order 1, 2, 3

### Requirement: An unknown identifier is reported as not found

When no session exists for a given identifier, or the identifier is not well formed, the system SHALL report that the session was not found, distinguishably from a server failure, and SHALL reveal nothing about other sessions. The page SHALL offer the User a way to start a new project.

#### Scenario: The identifier does not exist

- **WHEN** a session is consulted with an identifier that matches no session
- **THEN** the response reports that the session was not found
- **AND** no data from any other session is returned

#### Scenario: The identifier is malformed

- **WHEN** a session is consulted with an identifier that is not well formed
- **THEN** the response reports that the session was not found

#### Scenario: The User opens a page for an unknown identifier

- **WHEN** the User opens the session page for an identifier that matches no session
- **THEN** the page states that the session was not found
- **AND** offers a way to start a new project

### Requirement: No account or authentication is requested

Consulting a session SHALL NOT require an account, a login, a password or any credential.

#### Scenario: A session is consulted on the local installation

- **WHEN** the User consults a session
- **THEN** no account, login or credential is requested

### Requirement: Sessions remain consultable indefinitely

The system SHALL NOT refuse to return a session because of its age.

#### Scenario: An old session is consulted

- **WHEN** a session created long ago is consulted
- **THEN** it is returned like any other session

### Requirement: The session page is addressable by its identifier

The session page SHALL be reachable at an address that contains the session identifier, so the User can bookmark it and return to it later. On successful registration, the User SHALL be taken to, or shown, that address.

#### Scenario: The User bookmarks a session

- **WHEN** the User opens a session page and later reopens the same address
- **THEN** the same session is shown

#### Scenario: A project has just been started

- **WHEN** a session is registered from the start form
- **THEN** the User is shown the session page address for that identifier

### Requirement: Locally-only artefacts are not exposed

The read and the page SHALL NOT expose a download of, or the content of, the voice-over MP3, the timestamps or the generated texts.

#### Scenario: A session with a completed voice-over is consulted

- **WHEN** a session whose voice-over is complete is consulted
- **THEN** no download or content of the MP3 or its timestamps is offered

### Requirement: One read serves consultation and resynchronisation

The session read SHALL be the same request the live-update mechanism uses to resynchronise an open page after a disconnection, returning the payload shapes that mechanism defines for a session and for each scene.

#### Scenario: An open page resynchronises

- **WHEN** an open session page reconnects after a disconnection
- **THEN** it obtains current state through the session read
- **AND** the session and scene fields it receives have the same shape as the live-update events
