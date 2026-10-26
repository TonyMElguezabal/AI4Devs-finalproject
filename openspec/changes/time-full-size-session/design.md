## Context

`stage_attempts` already stores, per attempt, the stage, the scene (for image and video), `sent_at`, `finished_at` and the outcome (`success`, `transient`, `not-retryable`, `timed-out`, `late-success`, `superseded`); `phase_instants` stores phase starts and ends (JOS-228). The Administrator's pipeline-time report (`GET /admin/reports/pipeline-time`) gives per-phase elapsed time across sessions but not per clip, not the margin, and not for one session in the shape the ticket wants. The limits live in the settings files (`backend/config/settings.default.json`, with the measured history in `backend/src/config/providers.ts`).

The run happens on a Windows machine with the packaged executable, which also validates JOS-205. The packaged executable has no developer tooling, but its data is one SQLite file under `%APPDATA%\Vid4You`.

## Goals / Non-Goals

**Goals:**

- The tables of JOS-209's acceptance criteria 2 and 3, produced from stored data with no estimates.
- No change to the product at runtime; the measurement must not disturb what it measures.
- Runnable on the developer's machine from a copy of the Windows database.

**Non-Goals:**

- A new endpoint or admin screen (a one-off measurement does not justify API surface and PRD changes).
- Changing a limit or the concurrency here.
- Probing the final video; that is `ffprobe` by hand (criterion 4) and is recorded in the report.

## Decisions

### Decision 1: An offline script over a copy of the database

`backend/scripts/sessionTimingReport.ts <db-file> <run-id>` opens the file read-only (`node:sqlite`, `readOnly: true`) and prints Markdown. The owner copies `vid4you.sqlite` from the Windows data folder after the run (the app closed, so the file is consistent) and the report is produced on the development machine, where Node 26 and the repository exist.

*Alternative:* an admin endpoint, usable inside the packaged build (adds API surface, an `api-spec` entry and a PRD note for a one-off need; the path stays open if the report proves useful again).

### Decision 2: The query is a pure function over rows

The script's core takes the attempt rows and the limits and returns the tables, so the test seeds rows and needs no database file for the logic, and one test opens a real read-only database to prove nothing is written.

### Decision 3: Elapsed time of a stage is first send to last finish

For stages with retries the elapsed time includes the waits between attempts, which is what the user experiences; per-attempt times are listed as well so a limit margin uses attempt durations (`finished_at - sent_at`), which is what the limit applies to.

### Decision 4: Margin uses successful attempts only

Margin is the stage limit divided by the slowest successful attempt time; a timed-out attempt tells us the limit is too small for some request but not by how much. When nothing succeeded the margin is "not computable". A `late-success` is listed with its real duration and excluded from the margin because the system had already given up on it.

### Decision 5: Spend and interruptions are protocol, not code

The owner approves the clip count and balance before the run. A billing or balance error is recorded in the report as an interruption and the run is resumed or repeated; it is never counted as a limit failure (criterion 5). The report's interruption section is typed by hand from the run log.

### Decision 6: One Windows session serves two tickets

Before the paid run, the same build starts with stub providers for the JOS-205 checks (health, interface, a stubbed session to `final-video`, second launch). The paid run then uses the same build with real keys in the data folder. The two results are recorded separately, in this change's `reports/` and in `package-executables-build/reports/`.

## Risks / Trade-offs

- [The requested clip duration may not be stored per scene] → Task 1.1 finds where it lives (the decomposition artefact or the scene row); if it is only in a file, the script reads that file from the project folder copy, and the owner copies the project folder as well.
- [A 1.5-2 hour run can fail midway on a balance error] → Resume rather than restart; the report states the interruption (Decision 5).
- [The Windows packaged build is the first real use of the build] → A defect found there is a JOS-205 finding, recorded and fixed under that ticket, and the paid run waits for it.
- [One run is one sample] → The report states it is a single run and gives the margin; a recommendation to keep a limit is conditional on the margin, not a proof.

## Open Questions

- ~~Where the requested clip duration is stored~~ Answered (task 1.1): `scenes.requested_duration_seconds` (nullable for scenes made by the pre-decomposition path). Image and video attempts are rows of `stage_attempts` with `scene_id`, `sent_at`, `finished_at` and `outcome`, so no file from the project folder is needed. The limits come from `maxTimeSeconds` in the settings file (`voice`, `alignment`, `decomposition`, `image`, `video`, `assembly`), which map to the attempt stages `voice-over`, `timestamps`, `decomposition`, `image`, `video`, `assembly`; the script reads the shipped defaults unless given the settings file the run used (task 1.2). The script must not import `src/db.ts`, which opens the configured database on import.
- The script and the real clip count: the owner chooses the script (1,500-1,800 words) and confirms the spend.
