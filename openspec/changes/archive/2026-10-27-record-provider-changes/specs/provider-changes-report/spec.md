## ADDED Requirements

### Requirement: Provider-changes report
`GET /admin/reports/provider-changes` SHALL return the log entries whose instant is in the period `[from, to)`, newest first. An absent `from` SHALL mean "from the first entry" and an absent `to` SHALL mean "now"; a `from` that is not before `to`, or a value that is not an ISO 8601 date-time, SHALL be refused with 400. Each entry SHALL carry its instant, its kind (active-provider change or failed-stage move), the stage, the session id and title and the scene number when it is a move (null otherwise), and the previous and new provider ids and display names as logged.

#### Scenario: Entries in the period, newest first
- **WHEN** changes were logged 2 days, 5 days and 40 days ago and the report is requested for the last 7 days
- **THEN** the entries of 2 and 5 days ago are returned, the one of 2 days ago first

#### Scenario: Both kinds listed
- **WHEN** the period holds an active-provider change and a clip move
- **THEN** the change shows its stage and providers with no session, and the move shows its session title, scene number, stage and providers

#### Scenario: Invalid period
- **WHEN** the report is requested with `from` after `to`
- **THEN** it is answered 400 naming the parameter

### Requirement: The provider-changes report is gated, read-only and holds no content
The route SHALL be refused with 401 without the Administrator password. It SHALL write nothing, send nothing off the device, and contain no API key, script, prompt, instruction, narration text or failure text; the session title is the only User-written text shown.

#### Scenario: Refused without the password
- **WHEN** the report is requested without the Administrator password, or with a wrong one
- **THEN** it is answered 401 and no entry is returned

#### Scenario: Reading changes nothing
- **WHEN** the report is requested
- **THEN** the row counts and contents of every table are the same before and after

### Requirement: Provider changes in the Reports section
Under the period selector of the Reports section on `/admin`, the page SHALL show a "Provider changes" table with one row per entry, newest first: when (in the computer's time zone), what (active provider changed, or failed stage moved), stage, session and scene (blank for an active-provider change), from and to. An empty period SHALL say there were no provider changes in it. Changing the period SHALL reload the table, and a 401 answer SHALL lock the page.

#### Scenario: Table shown
- **WHEN** the Administrator opens the Reports section with one change and one move in the last 30 days
- **THEN** the table shows both, newest first, with their providers' names

#### Scenario: No changes
- **WHEN** the period holds no entry
- **THEN** the section says there were no provider changes in this period

#### Scenario: Access lost
- **WHEN** the report request is answered 401
- **THEN** the page locks again
