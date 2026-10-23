## ADDED Requirements

### Requirement: Sessions report
`GET /admin/reports/sessions` SHALL return one row for every session created in the period `[from, to)` (the period applies to the session's creation time; an absent `from` means from the first session, an absent `to` means now; the same 400 rules as the other reports apply), newest first. Each row SHALL carry: the session id, its title, its creation instant, its state, whether it is paused, its number of scenes, its number of failed scenes, its number of attempts, the seconds from creation to the voice-over, and the seconds from creation to the final video. The state SHALL be derived, never stored: `failed` with the failed phase (`voice-over`, `decomposition` or `assembly`) when the session records a failure; otherwise `final-video-ready` when an assembly attempt succeeded; otherwise `in-progress`. The attempts SHALL be the voice-over, timestamps and decomposition attempts that were sent, plus every scene image and clip request. The seconds to the voice-over SHALL be null until the voice-over is complete; the seconds to the final video SHALL be null until an assembly attempt succeeds. Seconds SHALL be rounded to one decimal. A session with no scenes SHALL still be listed. The Reports section SHALL show these rows in a table below the provider-usage table.

#### Scenario: Sessions created in the period
- **WHEN** sessions were created 3 days, 10 days and 40 days ago and the report is requested for the last 7 days
- **THEN** only the session created 3 days ago is listed

#### Scenario: Session facts
- **WHEN** a session with 2 scenes, 1 failed, 5 session-level attempts and 10 scene requests, whose voice-over completed 0.1 s and whose assembly succeeded 18.1 s after creation, is listed
- **THEN** its row shows 2 scenes, 1 failed scene, 15 attempts, 0.1 seconds to the voice-over, 18.1 seconds to the final video and the state `final-video-ready`

#### Scenario: Session in progress
- **WHEN** a session has a voice-over but no successful assembly and no failure
- **THEN** its state is `in-progress` and its seconds to the final video are null

#### Scenario: Paused session
- **WHEN** a session is paused
- **THEN** its row says it is paused and its state is the one it would have if it were not

#### Scenario: Session that failed before producing scenes
- **WHEN** a session failed in the voice-over or in decomposition before any scene was registered
- **THEN** it is listed with state `failed`, its failed phase, zero scenes and null seconds to the voice-over (when none was produced) and to the final video

#### Scenario: Failed session keeps its times
- **WHEN** a session whose voice-over completed fails in assembly
- **THEN** its row shows the failed phase and its seconds to the voice-over, and null seconds to the final video

### Requirement: Scene drill-down of a session
`GET /admin/reports/sessions/:sessionId/scenes` SHALL return one row per scene of that session in scene order, each with: the scene number, its status, the display names of its image and clip providers (null while unbound), its number of image requests and of clip requests, its requested clip duration in seconds, its speed factor, its duration warning and its speed-factor warning (each null when absent). An unknown session SHALL be answered 404. The Reports section SHALL let the Administrator open and close the drill-down of any listed session, and SHALL tell a session with no scenes that it has none.

#### Scenario: Scene rows
- **WHEN** the Administrator opens the drill-down of a session with 2 scenes
- **THEN** each scene shows its status, providers, image and clip request counts, requested duration, speed factor and both warnings, in scene order

#### Scenario: Scene with a warning
- **WHEN** a scene was stored with a duration warning and a speed-factor warning
- **THEN** both warnings are in its row

#### Scenario: Session without scenes
- **WHEN** the drill-down of a session that failed before producing scenes is opened
- **THEN** the response has no rows and the section says the session has no scenes

#### Scenario: Unknown session
- **WHEN** the drill-down of a session id that does not exist is requested
- **THEN** it is answered 404

### Requirement: The sessions report is gated and holds no content
Both sessions routes SHALL be refused with 401 without the Administrator password. Neither response SHALL contain a script, a prompt, an instruction, narration text, a failure message or cause, or an API key. Only the session title SHALL be shown as text the User wrote.

#### Scenario: Refused without the password
- **WHEN** either sessions route is requested without the Administrator password, or with a wrong one
- **THEN** it is answered 401 and no session data is returned

#### Scenario: No content in the responses
- **WHEN** the sessions list and a drill-down are produced from sessions whose scripts, prompts, instructions, narration and failure causes hold known marker texts, and whose providers have stored keys
- **THEN** none of those texts or keys appears in either response

#### Scenario: Reading changes nothing
- **WHEN** the sessions list and a drill-down are requested
- **THEN** the row counts and contents of every table are the same before and after
