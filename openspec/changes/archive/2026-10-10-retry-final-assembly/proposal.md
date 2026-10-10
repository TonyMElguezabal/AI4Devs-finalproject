# Retry a failed final assembly

Linear-Issue: JOS-159 (US-27)

## Why

Assembly is the last step, run once every scene is complete. When it fails, §10.3 and AC13 promise that the User can retry it "with the components already generated": the narration, the images and the clips are kept and never regenerated. They are the expensive part of the project.

`assemble-final-video` (JOS-149, PR #25, open) runs assembly with up to four attempts. When those run out, or a failure is not retryable, it only completes the attempt record. As a result:

- **A failed assembly is invisible (AC1).** No session failure is recorded. The session keeps deriving `final-video-generating` forever, `failedPhase: "assembly"` is never produced (the open question in `view-progress-by-phase`, JOS-168), and the User sees a phase that never ends. A missing assembly tool or a missing voice-over returns silently in the same way.
- **There is no way to run it again (AC2).** No command exists. The only trigger is the last scene completing, which has already happened.
- **A failed attempt can leave a partial final video in the project folder.** The ffmpeg adapter writes its final mux directly to `final-video.mp4`, and the next attempt overwrites it.
- **A paused assembly is never resumed on continue.** On PR #25's branch, `assembly` has no launcher, and `continueSession` does not relaunch it. (Task 1 re-checks this against the merged code.)

## What Changes

- **An assembly failure is recorded on the session (AC1)**: when assembly runs out of attempts, fails not-retryably, or cannot start (no assembly tool, no voice-over), the session records `{ phase: "assembly", cause, retryable, occurredAt }`. A missing or unreadable clip file is not a separate "cannot start" case — it surfaces through the ordinary attempt, like any other tool failure. The cause is readable and says the narration, images and clips are kept. The session then derives `failed` with `failedPhase: "assembly"`. Success clears the failure.
- **Nothing generated is touched by a failure or a retry (AC1, AC3)**:
  - Assembly reads the voice-over, the chunks and the clip files, and writes none of them.
  - Each attempt writes its output to a temporary file outside the project folder. On success, it moves the file to `final-video.mp4` without replacing an existing file.
  - A failed attempt leaves nothing in the project folder.
- **A manual assembly retry command (AC2)**: `POST /sessions/:sessionId/assembly/retry`, with no request body, following the per-phase retry pattern from `retry-voice-over` (JOS-155) and `retry-decomposition` (JOS-156). It is accepted only when:
  - the session is `failed` with `failedPhase: "assembly"` (this one check also covers "no retry is already pending or running" — claiming the retry clears the failure atomically, so a second, losing concurrent request lands on this same reason, not a separate one);
  - every scene is still `chunk-complete`;
  - no final video exists.

  Refusals answer 409 with a reason code, an unknown session answers 404, and any body field answers 400.
- **A new cycle, through the gate**: the retry opens a new cycle on the session's `assembly` stage instance, giving up to four attempts, by re-launching through the same `assembly` stage launcher a first run uses (not JOS-184's `startNewCycle` — that primitive can't represent a failure with no attempt row yet, such as "no tool configured"). The same launcher resumes an assembly held by a pause, whether it is a first run or a retry. `assembly` comes off `NOT_YET_LAUNCHABLE`.
- **The session shows progress at once**: an accepted retry derives `final-video-generating` until its cycle ends. This adds the `assembly` row to the shared retry-rule table from JOS-168, JOS-155 and JOS-156.
- **A retry button on the page**: `phaseActions` returns `retry` for a failed assembly phase. The Final video phase section shows "Retry final video" and the cause.

## Capabilities

### New Capabilities

- `assembly-failure-recovery`: what a failed assembly records and keeps, and how the User retries it. It covers:
  - the session-level assembly failure and its derivation;
  - the guarantee that no voice-over, image or clip is written or regenerated;
  - the no-partial-output rule for the final video;
  - the retry command, its checks and refusals;
  - the new cycle and the `assembly` launcher;
  - the in-progress state during a retry;
  - the page action.

### Modified Capabilities

None in `openspec/specs/`. This change completes behaviour that the unarchived `assemble-final-video` (JOS-149) leaves open, and answers `view-progress-by-phase`'s (JOS-168) open question. Neither is archived, so both are referenced, not delta-specced. If PR #25 is archived first, task 1.3 turns the relevant parts into deltas against its archived spec.

## Impact

- **Backend**:
  - `orchestrator.ts`: assembly failure recording, `deriveSessionState` (`failedPhase: "assembly"` and the retry row), the temp-then-move output, and the `assembly` launcher.
  - `types.ts`: `AssemblyFailure` joins `SessionFailure`.
  - A new `assemblyRetry.ts` service.
  - `routes.ts`: the route.
  - No migration: `runs.failure` and `runs.final_video_path` exist.
- **Frontend**: `phaseActions.ts`, `PhaseSection.tsx` (Retry final video), and `api/client.ts` (`retryAssembly`).
- **API contract**: `docs/api-spec.yml` gains the route and the `assembly` failure phase.
- **Blocked on (gate before code)**:
  - **`assemble-final-video` (JOS-149, PR #25)**: merged into `feature/entrega-2-JAME`. This branch is cut from its head.
  - **`bounded-retry-policy` (JOS-184)**: `startNewCycle` and scheduled attempts. Like the voice-over and decomposition retries, a phase-level retry has no scene status to carry "retry accepted", so it relies on JOS-184's scheduled attempt.
  - **`view-progress-by-phase` (JOS-168)**: the Final video phase section and `phaseActions`.
- **Shared with JOS-155 and JOS-156**: the route pattern, the reason table, the retry-rule table and the retry-button component. Whichever lands first adds them; the others reuse them.
- **Out of scope**:
  - regenerating any scene or the narration (§10.3 forbids it);
  - changing the output format;
  - retrying a session whose final video exists;
  - assembly time limits (JOS-185).
