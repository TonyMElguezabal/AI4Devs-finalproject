## MODIFIED Requirements

### Requirement: The Reports section and its period selector on /admin
Once unlocked, `/admin` SHALL show a "Reports" section in the "Reports" tab with a period selector, presented as a segmented control, offering "Last 7 days", "Last 30 days", "All time" and "Custom range". "Last 30 days" SHALL be selected when the section opens. A custom range SHALL be two dates read in the computer's time zone, from the start of the first day to the end of the last day. Changing the period SHALL reload the reports for the new period. Above the reports the section SHALL show summary tiles: attempts, success rate, estimated cost and failed scenes now; a tile whose report is not loaded or failed SHALL show "—". Each report SHALL be a collapsible panel; provider usage and sessions SHALL be open when the section opens. Every report table SHALL scroll horizontally inside its own wrapper, right-align its numbers, show instants in one format, and show a value that was not recorded as "n/a".

#### Scenario: Default period
- **WHEN** the Administrator opens the Reports section
- **THEN** "Last 30 days" is selected and the report is requested with `from` 30 days before now and no `to`

#### Scenario: Changing the period
- **WHEN** the Administrator selects "Last 7 days"
- **THEN** the report is requested again with `from` 7 days before now, and the table shows the new answer

#### Scenario: Custom range in local time
- **WHEN** the Administrator selects a custom range from 2026-10-01 to 2026-10-03
- **THEN** the report is requested with `from` at local midnight starting 2026-10-01 and `to` at local midnight starting 2026-10-04

#### Scenario: Access lost while reading a report
- **WHEN** the report request is answered 401
- **THEN** the page locks again as for any other `/admin` request

#### Scenario: Summary tiles
- **WHEN** the provider-usage, estimated-cost and failures reports are loaded
- **THEN** the tiles show the total attempts, the overall success rate, the estimated cost total and the number of scenes failed now

#### Scenario: A report that failed to load
- **WHEN** the estimated-cost report could not be loaded
- **THEN** its tile shows "—" and the other tiles and panels are unaffected

#### Scenario: Panels
- **WHEN** the Reports section opens
- **THEN** the provider-usage and sessions panels are open and the others are closed, and each can be opened or closed with the keyboard

#### Scenario: One footnote for unpriced providers
- **WHEN** the sessions report has rows whose estimated cost excludes unpriced providers
- **THEN** the note "excludes unpriced providers" appears once under the table, not in each row
