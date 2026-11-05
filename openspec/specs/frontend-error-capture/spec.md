# frontend-error-capture Specification

## Purpose
TBD - created by archiving change cover-error-reporting. Update Purpose after archive.
## Requirements
### Requirement: Uncaught frontend errors are sent to the backend
The frontend SHALL send each uncaught error (`window` `error` event) and each unhandled promise rejection (`window` `unhandledrejection` event) to `POST /telemetry/frontend-errors`, with `kind` `error` or `unhandledrejection`, the error's message and its stack when there is one. A rejection reason that is not an `Error` SHALL be sent as its `String()` value. Before sending, the frontend SHALL cut the message to 1000 characters and the stack to 8000. Sending SHALL never throw, and a failed send SHALL NOT be reported again.

#### Scenario: Uncaught error
- **WHEN** a click handler throws `TypeError: x is undefined`
- **THEN** one report is sent with `kind` `error` and message `x is undefined`

#### Scenario: Unhandled rejection with a non-Error reason
- **WHEN** a promise rejects with the string `boom` and nothing handles it
- **THEN** one report is sent with `kind` `unhandledrejection` and message `boom`

#### Scenario: Backend unreachable
- **WHEN** the report request fails
- **THEN** the page keeps working and no second report is sent for that failure

#### Scenario: Long message
- **WHEN** an error's message is 5000 characters
- **THEN** the report's message is its first 1000 characters

### Requirement: Render errors show a fallback and are reported
The frontend SHALL wrap the whole app in an error boundary. When a component throws while rendering, the boundary SHALL replace the app with a fallback that says something went wrong and offers a button that reloads the page, and SHALL send one report with `kind` `render`. The fallback SHALL follow the visual design in `docs/frontend-standards.md` and be reachable by keyboard.

#### Scenario: A component throws while rendering
- **WHEN** a component throws during render
- **THEN** the page shows the fallback instead of a blank page, and one report with `kind` `render` is sent

#### Scenario: Reload from the fallback
- **WHEN** the user activates the reload button on the fallback
- **THEN** the page reloads

### Requirement: Frontend reports carry no user content
A frontend report SHALL hold only the error's kind, message and stack. It SHALL NOT include component props or state, form values, the script, the session title, or the page URL beyond what the browser puts in the stack.

#### Scenario: Report shape
- **WHEN** any frontend report is sent
- **THEN** its body has only the keys `kind`, `message` and, when present, `stack`
