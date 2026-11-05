## ADDED Requirements

### Requirement: The failures report is read-only, local and behind the Administrator password
`GET /admin/reports/failures` SHALL be computed on demand from the local store, SHALL write nothing and send nothing off the device, and SHALL be refused with 401 without the Administrator password. It SHALL NOT contain an API key, a script, a prompt or instruction, narration text, or any failure text of the image or video stage (a scene's failure text can carry the provider's own words).

#### Scenario: Report requested without the Administrator password
- **WHEN** a request for `GET /admin/reports/failures` arrives without the Administrator password, or with a wrong one
- **THEN** it is answered 401 and no report data is returned

#### Scenario: Scene failure text is never shown
- **WHEN** a scene's clip failed with a failure text holding a known marker, and the session's script, prompts and narration hold other known markers
- **THEN** none of those markers appears anywhere in the response

#### Scenario: Report changes nothing
- **WHEN** the failures report is requested
- **THEN** the row counts and contents of every table are the same before and after

### Requirement: The failures report takes the reports' period
The failures report SHALL take the period `[from, to)` of the other `/admin` reports and count only the attempts whose sent instant is in it; an absent `from` SHALL mean "from the first attempt" and an absent `to` SHALL mean "now". A manual retry that was never sent SHALL be placed in the period by the instant it was queued. A `from` that is not before `to`, or a value that is not an ISO 8601 date-time, SHALL be refused with 400.

#### Scenario: Only failures sent in the period are counted
- **WHEN** failed attempts were sent 3 days and 40 days ago and the report is requested for the last 7 days
- **THEN** only the attempt sent 3 days ago is counted

#### Scenario: Invalid period
- **WHEN** the report is requested with `from` after `to`
- **THEN** it is answered 400 naming the parameter

### Requirement: Failed attempts per stage and outcome
The report SHALL list each stage (voice, alignment, reasoning, image, video) that has at least one failed attempt, exhausted budget or manual retry in the period, with its transient failures, not-retryable failures and timed-out attempts. The attempts counted SHALL be the same ones the provider-usage report counts, so that for each stage these three numbers equal the sums of the same columns over that stage's provider-usage rows. Stages SHALL be listed in the order voice, alignment, reasoning, image, video.

#### Scenario: Failures per stage and outcome
- **WHEN** in the period a voice-over had two transient failures and one timed-out attempt, and a clip had one not-retryable failure
- **THEN** the voice row shows transient 2, not-retryable 0, timed out 1, and the video row shows transient 0, not-retryable 1, timed out 0

#### Scenario: Same counts as the usage report
- **WHEN** both reports are requested for the same period
- **THEN** each stage's failure counts in the failures report equal the sums of that stage's rows in the provider-usage report

#### Scenario: No failures in the period
- **WHEN** every attempt in the period succeeded and none was a manual retry
- **THEN** the report lists no stage

### Requirement: Exhausted retry budgets and manual retries of the session-level stages
For voice, alignment and reasoning, the report SHALL count the retry budgets exhausted (a cycle whose last allowed attempt ended transient or timed out) and the manual retries (attempts started by the Administrator or User rather than by the application). For image and video, which do not record cycles or manual retries, both values SHALL be reported as not recorded, never as zero.

#### Scenario: Exhausted budget
- **WHEN** a voice-over cycle's fourth attempt timed out in the period
- **THEN** the voice row shows one budget exhausted

#### Scenario: Manual retry
- **WHEN** a decomposition was retried manually once in the period
- **THEN** the reasoning row shows one manual retry

#### Scenario: Scene stages do not record retries
- **WHEN** the report shows an image or video row
- **THEN** its budgets exhausted and manual retries are "not recorded"

### Requirement: Most frequent failure wordings of the session-level stages
For voice, alignment and reasoning, the report SHALL list the failure wordings recorded on their failed attempts in the period, with how many attempts carried each, at most five per stage, most frequent first and then alphabetically. Failure wordings of the image and video stages SHALL NOT be listed.

#### Scenario: Wordings counted and ordered
- **WHEN** in the period five voice attempts failed with wording A and two with wording B
- **THEN** the voice wordings are A ×5 then B ×2

#### Scenario: At most five per stage
- **WHEN** seven different reasoning wordings occurred in the period
- **THEN** the five most frequent are listed

### Requirement: Scenes failed now by stage
The report SHALL count the scenes whose status is failed at the moment of the request, split into image (the scene has no image yet) and clip (the scene has its image but no clip). This count is a current state and SHALL NOT depend on the period.

#### Scenario: Failed scenes by stage
- **WHEN** one scene failed at its image and two scenes failed at their clip
- **THEN** the report shows image 1 and clip 2, whatever period is requested

### Requirement: Failures and retries in the Reports section
Under the period selector of the Reports section on `/admin`, the page SHALL show a "Failures and retries" table with one row per listed stage (stage, transient failures, not-retryable failures, timed out, budgets exhausted, manual retries), "not recorded" where a value is not recorded, the session-level failure wordings with their counts, and the scenes failed now by stage labelled as current. Changing the period SHALL reload it. A 401 answer SHALL lock the page as for any other `/admin` request.

#### Scenario: Table shown for the period
- **WHEN** the Administrator opens the Reports section with failures in the last 30 days
- **THEN** the "Failures and retries" table shows one row per stage with failures, the image and video rows show "not recorded" for budgets and manual retries, and the failure wordings are listed under it

#### Scenario: No failures
- **WHEN** the period holds no failure and no manual retry
- **THEN** the section says there were no failures in this period and still shows the scenes failed now

#### Scenario: Access lost
- **WHEN** the failures report request is answered 401
- **THEN** the page locks again
