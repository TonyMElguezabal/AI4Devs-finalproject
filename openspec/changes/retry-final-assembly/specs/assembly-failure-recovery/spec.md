# assembly-failure-recovery

Requirements for what a failed final assembly records and keeps, and how the User retries it (PRD §7.3, §10.2, §10.3 assembly row, §12.2, AC13, AC15; US-27). The assembly itself is owned by `assemble-final-video` (US-16), retry cycles by `stage-retry-policy` (US-22), pause by `session-pause` (US-20), and the phase sections by `session-phase-progress` (US-18).

## ADDED Requirements

### Requirement: A failed assembly is recorded on the session

When assembly exhausts its attempts, fails not-retryably, or cannot start, the session SHALL record an assembly failure with a readable cause, its retryability and the time. Cannot start means: no assembly tool, no stored voice-over, or a chunk's clip missing or unreadable. The session SHALL then derive `failed` with `failedPhase: "assembly"`. A failure before any attempt SHALL send nothing to the assembly tool. A successful assembly SHALL clear the failure (§8.1, §10.1).

#### Scenario: Attempts exhausted

- **GIVEN** a session whose scenes are all `chunk-complete`
- **WHEN** every assembly attempt of the cycle fails transiently
- **THEN** the session is `failed` with `failedPhase: "assembly"`, its cause and `retryable: true`

#### Scenario: Not-retryable failure

- **WHEN** an assembly attempt fails not-retryably
- **THEN** the session is `failed` with `failedPhase: "assembly"` and `retryable: false`, and no further attempt is made

#### Scenario: A clip file is missing

- **GIVEN** a session whose scenes are all `chunk-complete` but one clip file cannot be read
- **WHEN** assembly is launched
- **THEN** the assembly tool is not called and the session is `failed` in assembly with a cause naming the scene

### Requirement: A failed assembly keeps everything generated

An assembly attempt, failed or retried, SHALL NOT write, delete or regenerate the voice-over, any image, any clip, or their records (§10.3, AC13).

#### Scenario: Failure keeps the components

- **GIVEN** a session with the hashes of its MP3, images and clips recorded
- **WHEN** assembly fails
- **THEN** every hash is unchanged, and the voice-over, scene, image-result and clip-result records are unchanged

### Requirement: The final video appears only on success and never replaces a file

An assembly attempt SHALL write its output outside the project folder, and SHALL place `final-video.mp4` in the project folder only on success, without replacing an existing file. A failed attempt SHALL leave no file in the project folder. If `final-video.mp4` exists with no final video recorded, the next attempt SHALL check that it is a readable MP4 and record it, without overwriting it (§12.2, AC15).

#### Scenario: Failed attempt leaves nothing

- **GIVEN** the listing of a session's project folder
- **WHEN** an assembly attempt fails midway
- **THEN** the project folder listing is unchanged

#### Scenario: Successful retry after failures

- **WHEN** assembly succeeds after earlier failed attempts
- **THEN** the project folder gains exactly `final-video.mp4`, and the session reaches `final-video`

### Requirement: A failed assembly can be retried by command

The system SHALL accept `POST /sessions/:sessionId/assembly/retry` for a session that is `failed` with `failedPhase: "assembly"`, whether its failure is retryable or not. An accepted retry SHALL answer 200 with `held` saying whether a pause holds it. The command SHALL refuse with 409 and a reason, and SHALL call no tool, when:

- the session is not failed in assembly (`not-failed-in-assembly`);
- a scene is not `chunk-complete` (`scenes-not-complete`);
- a final video exists (`final-video-already-generated`);
- a retry is already pending or running (`retry-already-pending`).

An unknown or malformed session SHALL answer 404. A body with any field SHALL answer 400.

#### Scenario: Retry accepted and succeeds

- **GIVEN** a session `failed` in assembly
- **WHEN** the User retries the assembly and the tool succeeds
- **THEN** the command answers 200, the tool receives the persisted clips in scene order and the stored voice-over, and the session reaches `final-video`

#### Scenario: Not failed in assembly

- **GIVEN** a session in `chunks-processing`, or `failed` with `failedPhase: "scenes"`
- **WHEN** an assembly retry is requested
- **THEN** the command answers 409 with `not-failed-in-assembly` and the tool is not called

#### Scenario: Two retries at once

- **WHEN** two assembly retry requests arrive concurrently for a session `failed` in assembly
- **THEN** exactly one answers 200, the other answers 409 with `retry-already-pending`, and one cycle is opened

### Requirement: An assembly retry uses only the components already generated

A retry SHALL build its input from the persisted chunks in ascending index order, their stored narration intervals and clip files, and the stored voice-over. It SHALL NOT call the voice, image or video provider, SHALL NOT launch any scene stage, and SHALL NOT write any voice-over, scene, image or clip record or file (§10.3, AC13).

#### Scenario: Nothing regenerated

- **GIVEN** a session `failed` in assembly, with the hashes of its MP3, images and clips recorded
- **WHEN** the User retries the assembly, whether it succeeds or fails again
- **THEN** the voice, image and video providers receive no request, and every hash and component record is unchanged

### Requirement: A retry opens a new cycle; pause holds assembly until continue

An accepted retry SHALL open a new cycle on the session's `assembly` stage instance, allowing up to four attempts, and SHALL keep earlier attempts recorded (§10.2, D06). Assembly, both the first run and a retry, SHALL be launched through the phase-launch gate by the `assembly` stage launcher. While the session is paused, it SHALL be counted as one held unit of the assembly stage, and launched exactly once when the User continues (§9).

#### Scenario: Retry during a pause

- **GIVEN** a paused session `failed` in assembly
- **WHEN** the User retries the assembly
- **THEN** the command answers 200 with `held: true`, the tool is not called, and the held list shows the assembly stage with one unit
- **AND** when the User continues, assembly runs exactly once

#### Scenario: First assembly held by a pause

- **GIVEN** a paused session whose last scene reaches `chunk-complete`
- **WHEN** the User continues
- **THEN** assembly runs exactly once

### Requirement: An accepted retry shows the final video in progress

From the moment an assembly retry is accepted until its cycle ends, the session SHALL derive `final-video-generating`, and the assembly phase SHALL be `in-progress` with no `failure`, whether the attempt is scheduled, held or running (§8.1).

#### Scenario: Retry in progress

- **WHEN** an assembly retry is accepted
- **THEN** the session derives `final-video-generating` until it reaches `final-video` or fails again

### Requirement: The page offers the retry on a failed assembly phase

`phaseActions` SHALL return a retry action for the assembly phase when it is `failed`, and none otherwise. The Final video phase section SHALL show the failure cause and a `Retry final video` button. A click SHALL call the retry command, and the button SHALL be disabled while the request is outstanding. A 409 refusal SHALL be shown as a readable sentence. The new state SHALL come from the live update.

#### Scenario: Button on a failed assembly

- **GIVEN** a session read with the assembly phase `failed`
- **WHEN** the page renders
- **THEN** the Final video phase section shows the cause and `Retry final video`, and no download

#### Scenario: No button otherwise

- **GIVEN** an assembly phase `pending`, `in-progress` or `complete`
- **WHEN** the page renders
- **THEN** no `Retry final video` button is shown
