## ADDED Requirements

### Requirement: Reports are read-only, local and behind the Administrator password
Every `/admin` report SHALL be computed on demand from the local store, SHALL write nothing and send nothing off the device, and SHALL be refused without the Administrator password. A report SHALL NOT contain an API key, a script, a prompt or instruction, narration text, or a provider's own words in a failure message.

#### Scenario: Report requested without the Administrator password
- **WHEN** a request for `GET /admin/reports/provider-usage` arrives without the Administrator password, or with a wrong one
- **THEN** it is answered 401 and no report data is returned

#### Scenario: Report contains no secret and no content
- **WHEN** the provider-usage report is produced from sessions whose scripts, prompts, narration and failure messages hold known marker texts, and whose providers have stored keys
- **THEN** none of those texts or keys appears anywhere in the response

#### Scenario: Report changes nothing
- **WHEN** the provider-usage report is requested
- **THEN** the row counts and contents of every table are the same before and after

### Requirement: Reports take a period applied to the instant an attempt was sent
An aggregate report SHALL take a period `[from, to)` and count only the attempts whose sent instant is at or after `from` and before `to`. An absent `from` SHALL mean "from the first attempt"; an absent `to` SHALL mean "now". A `from` that is not before `to`, or a value that is not an ISO 8601 date-time, SHALL be refused with 400.

#### Scenario: Only attempts sent in the period are counted
- **WHEN** attempts were sent 3 days, 10 days and 40 days ago and the report is requested for the last 7 days
- **THEN** only the attempt sent 3 days ago is counted

#### Scenario: The period's end is excluded
- **WHEN** an attempt was sent exactly at `to`
- **THEN** it is not counted

#### Scenario: All time
- **WHEN** the report is requested without `from` and without `to`
- **THEN** every sent attempt is counted

#### Scenario: Invalid period
- **WHEN** the report is requested with `from` after `to`, or with `from=yesterday`
- **THEN** it is answered 400 naming the parameter

### Requirement: The Reports section and its period selector on /admin
Once unlocked, `/admin` SHALL show a "Reports" section with a period selector offering "Last 7 days", "Last 30 days", "All time" and "Custom range". "Last 30 days" SHALL be selected when the section opens. A custom range SHALL be two dates read in the computer's time zone, from the start of the first day to the end of the last day. Changing the period SHALL reload the report for the new period.

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

### Requirement: Provider-usage report
`GET /admin/reports/provider-usage` SHALL return one row per stage (voice, alignment, reasoning, image, video) and provider that has at least one counted attempt in the period, each with: the provider id and its display name, attempts, successes, transient failures, not-retryable failures, timed-out attempts, success rate (successes over attempts, in percent, one decimal), the median and the 95th-percentile request latency in milliseconds (nearest rank), and the billed units with their unit. A counted attempt is one that was sent and has a final outcome; a late success SHALL count as a success. Billed units SHALL count successful attempts only: voice characters (the script's length) for voice, audio seconds (the voice-over's duration) for alignment, one request for reasoning, one image for image, and the requested clip seconds for video. The Reports section SHALL show these rows in a table.

#### Scenario: Usage per stage and provider
- **WHEN** sessions in the last 30 days made voice, alignment, reasoning, image and clip attempts with known outcomes and latencies
- **THEN** each stage and provider is one row with the counts, the success rate, the median and 95th-percentile latency and the billed units that those attempts give

#### Scenario: Provider without attempts in the period is not listed
- **WHEN** a provider profile exists, or had attempts before the period, but has no attempt sent in the period
- **THEN** it has no row

#### Scenario: Native timestamps are not an alignment call
- **WHEN** a session's alignment used the voice provider's native timestamps
- **THEN** that attempt is not counted in any alignment row

#### Scenario: Attempts not sent or not finished are not counted
- **WHEN** an attempt is scheduled, in flight, superseded or cancelled
- **THEN** it is not counted

#### Scenario: Failed attempts bill nothing
- **WHEN** a clip attempt failed and a later one for the same scene succeeded
- **THEN** both are attempts, and only the successful one adds its requested seconds to the billed units

#### Scenario: Empty period
- **WHEN** no attempt was sent in the period
- **THEN** the report has no rows and the section says there was no provider activity in the period

### Requirement: Scene attempts follow the scene's current provider until it is recorded
Until the provider is recorded on each image and clip attempt (JOS-222), the report SHALL attribute those attempts to the scene's currently bound image or video provider, and the response and the Reports section SHALL say that image and clip attempts follow the scene's current provider.

#### Scenario: Scene moved to another provider
- **WHEN** a scene's clip attempts failed on one provider and the scene was then moved to another provider (JOS-172)
- **THEN** all of that scene's clip attempts are counted for the provider the scene is bound to now

#### Scenario: The attribution is stated
- **WHEN** the report has image or video rows
- **THEN** the section shows that image and clip attempts follow the scene's current provider
