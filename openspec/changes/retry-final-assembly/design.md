# Design — Retry a failed final assembly

## Context

**Re-read against `feature/entrega-2-JAME` at task 1 (154 commits ahead of the propose commit; this branch rebased onto it).** PR #25 (JOS-149) merged long ago, and several things the original Context assumed were still missing are not:

- **Trigger**: unchanged in spirit. `triggerAssemblyIfReady(runId)` runs after every chunk reaches `chunk-complete` or `failed`; if `admitLaunch` admits and `assemblyGate` is open, it calls `launchAssemblyPhase`, which calls `runAssemblyAttempt(runId, attemptNumber)`.
- **An attempt** (`runAssemblyAttempt`), still accurate in shape:
  1. Returns silently, with no record, when no assembly tool is set, the session has no voice-over, **or `run.finalVideoPath` is already set, or an `assembly` attempt is already `in-flight`** (`ignore-repeated-success-confirmations`, JOS-161, added after the original Context was written).
  2. Builds the clip list from the persisted chunks, in index order.
  3. Records an `assembly` stage attempt via `recordStageAttempt` (`providerId: null`) — this already writes to `stage_attempts`, with `cycle`/`sequence_in_cycle` computed by the store itself (defaults to the stage instance's current `MAX(cycle)`, next `sequence_in_cycle`; see Decision 3 — **`runAssemblyAttempt`'s own `attemptNumber` parameter is a separate, redundant in-memory budget counter that never reads or writes `cycle`**).
  4. Calls `tool.assemble({ clips, voiceOverPath, outputPath: <project>/final-video.mp4, … })` — **still writes directly into the project folder**, not a temp path. Decision 2's gap is real and unaddressed.
  5. On success, `setFinalVideoPath` (a conditional write since JOS-161 — `WHERE final_video_path IS NULL`) and completes the attempt `success` or `superseded`.
  6. On a not-retryable failure, completes the attempt and stops.
  7. On a transient failure, completes the attempt `transient` and recurses with `attemptNumber + 1`, up to `1 + RETRY_BUDGET`, then stops.

  **None of these paths call `setRunFailure`.** Decision 1's core gap — a failed assembly is invisible — is confirmed still real.
- **Session state** (`deriveSessionState`): confirmed still true — once scenes exist and the gate is open, it unconditionally returns `final-video-generating`/`final-video`; `run.failure` is read only in the zero-scenes branch. `SessionFailure = VoiceOverFailure | DecompositionFailure` — no `AssemblyFailure` variant exists. Decision 1's derivation change is still needed, exactly as designed.
- **The `assembly` stage launcher already exists and is registered** (`preserve-progress-across-restarts`, JOS-160, added after the original Context) — this invalidates the original Context's "no launcher" and "`continueSession` does not resume assembly" claims:
  ```ts
  export const assemblyStageLauncher: StageLauncher = {
    stage: "assembly",
    heldWork: (sessionId) => {
      const run = getRun(sessionId);
      const gate = assemblyGate(getScenesForRun(sessionId));
      const inFlight = getStageAttempts(sessionId, "assembly").some((a) => a.outcome === "in-flight");
      return { count: run && !run.finalVideoPath && gate.open && !inFlight ? 1 : 0, sceneIds: [] };
    },
    pendingAtBoot: (sessionId) => { /* restart-recovery, stricter than heldWork */ },
    settleInFlight: settleAssemblyInFlight,
    launch: triggerAssemblyIfReady,
  };
  ```
  `assembly` is off `NOT_YET_LAUNCHABLE`. **A newly-found gap this surfaces**: `heldWork` does not check `run.failure` at all. A session paused after assembly exhausts its budget still reports `heldWork` count 1 (finalVideoPath null, gate open, nothing in-flight), so `continueSession` → `launchHeldWork` → `triggerAssemblyIfReady` would silently relaunch a fresh cycle today, bypassing any explicit retry command. Decision 4 below closes this.
- **ffmpeg adapter**: unchanged — normalizes clips in a `mkdtemp` work directory it removes afterwards, but still writes the final mux directly to `outputPath` (`<project>/final-video.mp4`). Decision 2's gap is real.
- **JOS-149 Decision 4** (isolation): confirmed unchanged — no assembly code path writes a chunk or voice-over row.
- **`bounded-retry-policy` (JOS-184) is merged.** `startNewCycle(ref: StageInstanceRef, options?)` in `backend/src/retry/stageAttemptRecorder.ts` returns `{ started: true, attempt }` (a **`scheduled`** row, `cycle: latest.cycle + 1`, `sequenceInCycle: 1`, due now) or `{ started: false, reason: "not-failed" | "not-retryable" }`. **It does not replace `runAssemblyAttempt`'s attempt-number parameter** — assembly was never routed through the recorder/scheduler (`registerAttemptSender`), unlike voice-over and decomposition. Calling `startNewCycle` and then separately calling `launchAssemblyPhase` (which makes its own `recordStageAttempt` call) would insert two rows for the new cycle's first slot and leave the `scheduled` row from `startNewCycle` permanently unclaimed — Decision 3 below closes this by claiming it explicitly.
- **`view-progress-by-phase` (JOS-168) is merged.** `phaseActions(phase)` and `PhaseSection`/`PhaseRetryButton` exist; `phaseActions` currently returns `retry` only for decomposition (`phase.status === "failed" && phase.failure?.retryable === true`).
- **`retry-decomposition` (JOS-156) is merged; `retry-voice-over` (JOS-155) is not** (no branch exists). The decomposition retry route (`POST /sessions/:sessionId/decomposition/retry`, `decompositionRetry.ts`) is the only merged per-phase retry pattern to reuse: `looseSessionParamsSchema` (so a malformed id is checked and 404'd in the handler, not 400'd by the schema), `emptyBodySchema`, `retryAcceptedSchema` (`{ok: true, held}`), and the `retryRefusalSentence` table/`PhaseRetryButton` on the frontend.

## Goals / Non-Goals

**Goals:**
- A failed assembly is recorded, visible and attributed to the assembly phase, with everything generated kept (AC1).
- One command re-runs assembly from the persisted components (AC2).
- No narration, image or clip is written, deleted or regenerated by a failure or a retry (AC3).
- The project folder never holds a partial final video.
- A paused assembly, first run or retry, resumes on continue.

**Non-Goals:**
- Retrying individual scenes (JOS-157, JOS-158).
- Assembly time limits (JOS-185).
- Changing the assembly algorithm or output format.

## Decisions

**Decision 1 — Record an assembly failure on the session, exactly like the voice-over and decomposition failures.**
`AssemblyFailure = { phase: "assembly", cause, retryable, manualRetryAvailable: true, cycle, attemptsInCycle, occurredAt }` joins `SessionFailure` (the same shape as `VoiceOverFailure`/`DecompositionFailure`, so `runs.failure` stays one column and every reader that already handles `SessionFailure` generically needs no change). `manualRetryAvailable` is always `true` for assembly — see Decision 7. It is written with `setRunFailure` in these cases:

| Case | `retryable` | `cycle`/`attemptsInCycle` |
|---|---|---|
| The last attempt of a cycle fails transiently (budget exhausted) | `true` | from the completed attempt row (`recordStageAttempt`'s return already carries `cycle`/`sequenceInCycle`) |
| An attempt fails not-retryably | `false` | from the completed attempt row |
| Before any attempt: no assembly tool configured, or no voice-over stored | `false`; nothing is sent to the tool | `cycle: 1, attemptsInCycle: 0` — no row exists yet |

A missing or unreadable clip file is **not** a separate pre-check (a simplification from the original design — see "Found during implementation" below): it surfaces through the ordinary attempt path instead, the same as any other tool failure.

The cause is written for a person. It names what failed, never contains a filesystem path outside the project-relative name, and ends with "Your narration, images and clips are kept." A success clears the failure (`clearRunFailure`).

**Found during implementation — no eager `existsSync` check for a missing clip file.** The original design's table listed "a chunk's clip path missing or its file unreadable" as a third pre-attempt, not-retryable case, checked with `existsSync` before building the clip list. Implementing it broke several already-passing tests across the suite (`repeated-confirmations.test.ts`'s `deliverClipSuccessForTests`/`completeVideoStage`, and others) that complete a scene's clip at the store level only, by design, with no real file on disk — exactly the same tension `retry-or-correct-image` (JOS-157) hit and resolved the same way with its `.strict()` body schema. Dropped the pre-check: a missing/unreadable file now surfaces through the real ffmpeg adapter throwing (`probeVideoDuration`/`execFileSync`), caught by the existing generic `try/catch` around `tool.assemble()` as a transient failure, exhausting the normal retry budget before being recorded — one fewer special case, and every existing store-level test fixture keeps working unmodified.

`deriveSessionState`'s gate-open branch (where scenes exist and every one is `chunk-complete`) changes to check the failure first, mirroring the zero-scenes branch's existing `if (failure && progress.retryInFlight) … else if (failure) …` pattern one-for-one:

```ts
if (gate.open) {
  if (failure?.phase === "assembly" && !progress.retryInFlight) return { state: "failed", failedPhase: "assembly" };
  return { state: progress.hasFinalVideo ? "final-video" : "final-video-generating" };
}
```

`progress.retryInFlight` is computed by the existing, already stage-generic `isRetryInFlight(runId, failure)` (`toSnapshot`'s caller), which needs only `RETRY_ATTEMPT_STAGE.assembly = "assembly"` added (and `RETRY_STATE.assembly = "final-video-generating"` for the `Record`'s type completeness, even though the zero-scenes branch that reads it never actually reaches an assembly failure).

*Alternative rejected:* deriving the failure from the latest `assembly` attempt row. It cannot represent a failure before any attempt (no tool, missing clip). It is the same reason JOS-136 Decision 9 rejected that approach for the voice-over.

**Decision 2 — The final video appears in the project folder only on success, and never replaces a file.**
`runAssemblyAttempt` passes the tool an `outputPath` inside a per-attempt temporary directory **created under `PROJECTS_ROOT`** (`mkdtempSync(join(PROJECTS_ROOT, ".assembly-tmp-"))`), not `os.tmpdir()`. This app's project folders and `PROJECTS_ROOT` are always one local, single-root filesystem (`db.ts`'s own layout, unconditionally), so a hard link from the temp path to `<project>/final-video.mp4` can never cross a device boundary — no copy-then-unlink fallback is needed. *(Simplification from the original design, which put the temp directory in `os.tmpdir()` and planned a cross-device copy fallback for it; dropped as unneeded complexity for a single-root local app, not a correctness gap — `ponytail: if PROJECTS_ROOT ever moves to a different filesystem than a session's project folder, add the EXDEV → copyFileSync fallback back into `adoptAssemblyOutput`.)* On `success`:

1. moves the file with `linkSync(tempPath, finalPath)` + `unlinkSync(tempPath)` — `linkSync` is atomic and fails with `EEXIST` when the target exists, mirroring `writeArtefactOnce`'s established idiom (`db.ts`) exactly; **if the tool wrote nothing to `tempPath`** (every stub in this test suite — `createStubAssemblyTool`'s `"success"` case returns `{kind:"success", outputPath}` without writing bytes), the move is skipped (nothing to move) and only the store write happens, so existing stub-driven tests are unaffected;
2. then sets `final_video_path` (unchanged — `setFinalVideoPath`'s existing conditional write).

On failure, the temporary directory (and anything the tool wrote into it before failing) is removed with one `rmSync(work, { recursive: true, force: true })`. A failed attempt therefore leaves nothing in the project folder, and a retry never overwrites a file there (AC15).

If `final-video.mp4` already exists without `final_video_path` recorded, for example after a crash between the move and the database write, the **next** attempt adopts it before calling the tool at all: checks the file is a non-empty, readable MP4 (`ftyp` box present — the same check `buildMp4()` in tests constructs), then calls `setFinalVideoPath` and returns, without building clips or touching the tool. It does not overwrite it.

*Alternative rejected:* letting the retry overwrite the partial file. "Local files are not deleted automatically" (§12.2, AC15), and a partial MP4 next to a "failed" state misleads anyone opening the folder.

**Decision 3 — The retry route follows the per-phase pattern. The cycle is opened with `startNewCycle`, then claimed and run synchronously in the same request — not left for the scheduler.**
`POST /sessions/:sessionId/assembly/retry` takes an empty body (`emptyBodySchema`, same as decomposition's route — `z.object({}).strict().nullish()`), with `looseSessionParamsSchema` so a malformed id answers 404 in the handler, not 400 from the schema. The responses are:

- **200** `{ ok: true, held }`.
- **404** for an unknown or malformed session (`session-not-found`).
- **409** `{ ok: false, reason }`, where `reason` is one of:
  - `not-failed-in-assembly`
  - `scenes-not-complete`: a guard; a failed assembly implies an open gate, and chunks cannot revert.
  - `final-video-already-generated`: a guard.
  - `retry-already-pending`

`retryAssembly(sessionId)` in `assemblyRetry.ts` runs the checks in that order, then calls `startNewCycle({ sessionId, stage: "assembly" })`. Unlike `retryDecomposition`, it does not stop there — assembly has no registered attempt sender for the scheduler to release later (Context), so the same call:

1. On `{started: false}`, maps the reason (`"not-retryable"` can't happen here — Decision 7 never leaves a not-retryable assembly failure unretryable — so this is always a lost race against another request already past `startNewCycle`, and maps to `retry-already-pending`).
2. On `{started: true, attempt}`, claims that exact scheduled row at once: `claimScheduledAttempt(attempt.id, nowIso())` (always succeeds — nothing else could have claimed a row this request just created). This is what gives the concurrent-request guarantee: `startNewCycle`'s own read-then-insert is wrapped in one transaction, so of two racing calls only one gets `{started: true}`.
3. Calls a small adapted entry point — `runAssemblyAttempt`'s body unchanged, but invoked with the claimed attempt's id and `sequenceInCycle` instead of calling `recordStageAttempt` again, so it **completes** that row (via `completeStageAttempt`) rather than inserting a second one for the same slot. Automatic retries within this new cycle (on a transient failure) continue exactly as today, through `recordStageAttempt`'s own cycle/sequence defaulting, which now correctly continues from the cycle `startNewCycle` opened.
4. `clearRunFailure(sessionId)` before launching, so a live view does not show `failed` for even one broadcast.

No tool is called before step 2 succeeds.

**Decision 4 — Register the `assembly` stage launcher.** It already exists (Context) and already serves first runs correctly (`launch: triggerAssemblyIfReady`, already off `NOT_YET_LAUNCHABLE`, already resumed by `continueSession` through `launchHeldWork`). The one change: **`heldWork` must not count a failed, non-retrying assembly as held work**, or `continueSession` silently relaunches it with no explicit retry (Context).

```ts
heldWork: (sessionId) => {
  const run = getRun(sessionId);
  const gate = assemblyGate(getScenesForRun(sessionId));
  const inFlight = getStageAttempts(sessionId, "assembly").some((a) => a.outcome === "in-flight");
  const blockedByFailure = run?.failure?.phase === "assembly";
  return { count: run && !run.finalVideoPath && gate.open && !inFlight && !blockedByFailure ? 1 : 0, sceneIds: [] };
},
```

A session paused while a retry's own attempt is in-flight is still correctly held (the `inFlight` check already covers it — `completeStageAttempt` on that row clears `in-flight` either way, independent of `run.failure`). A session paused *before* any assembly has ever run is unaffected (`run.failure` is `null`, same as today).

*Alternative rejected:* "a scheduled manual attempt newer than the failure" as a second, held-retry case in `heldWork`, per the original design. Dropped because Decision 3 claims the `startNewCycle` row synchronously, in the same request — it is never left `scheduled` for `heldWork`/`continueSession` to find later. (If the retry route itself runs while the session is paused, `admitLaunch` inside `runAssemblyAttempt` holds the actual provider-equivalent call exactly as a first run would — the attempt sits `in-flight` with nothing sent, and `continueSession`'s normal `in-flight` handling resumes it; no special case needed.)

**Decision 5 — The retry-in-progress rule gains its assembly row.**
This is the shared table from JOS-168 Decision 5 and JOS-156 Decision 5 (JOS-155 is not merged; its row is for whoever adds it):

| Failed phase | Attempt stage (`RETRY_ATTEMPT_STAGE`) | In-progress state (`RETRY_STATE`) |
|---|---|---|
| assembly | `assembly` | `final-video-generating` |

An `in-flight` `assembly` attempt queued at or after the failure's `occurredAt` (the existing, stage-generic `isRetryInFlight`) derives `final-video-generating` instead of `failed` (Decision 1); the assembly phase (JOS-168's `derivePhaseProgress`) is `in-progress` with no `failure` shown for it.

**Decision 6 — Retries read only persisted components.**
A retry rebuilds the clip list exactly as a first run does: from the persisted chunks in index order, their `narrationInterval` and `videoResult`, and the stored voice-over path. It calls no voice, image or video provider, and launches no scene stage. Tests prove AC3 by checking that:

- the voice, image and video stubs receive nothing;
- the hashes of the MP3, every image and every clip are unchanged;
- the `voice_overs`, `scenes`, `scene_results` and `scene_video_results` rows are unchanged.

**Decision 7 — The page action.**
`phaseActions(phase): { retry: boolean }` (its real current shape — Context) returns `retry: true` for the assembly entry whenever it is `failed`, whatever `retryable` is — unlike decomposition's `phase.failure?.retryable === true` gate. This is a deliberate difference, not an oversight: §10.3/AC13's promise is that nothing generated is lost, so a retry costs nothing extra to offer even after a not-retryable failure (a missing clip file, for instance, is worth letting the User try again after fixing the filesystem issue outside the app). JOS-155's own open question (whether a not-retryable voice-over failure should still offer retry) is the same question for a different phase and remains open there; this change does not block on it; it makes the explicit, reasoned choice for assembly. The Final video section shows the cause and a `Retry final video` button through `PhaseRetryButton`. The final-video download stays hidden until `final-video`.

## Risks / Trade-offs

- **[PR #25 changes before merging]** → Task 1 re-reads the merged assembly code. Decisions 1, 2 and 4 are re-checked against it, and design.md is updated before coding. This branch is cut from PR #25's head only so that the proposal sits next to the code it extends.
- **[PR #25 is behind the integration branch]** → Its merge must reconcile the video launcher and other integration changes first. This change rebases after that.
- **[Moving a large MP4 across devices]** → The copy-then-rename fallback costs time and disk once per success. The temp directory is created on the same volume as the projects folder when one is configured.
- **[A crash between the move and the database write]** → Covered by the adopt rule in Decision 2.
- **[Retrying a deterministic failure (a missing clip file)]** → No longer a zero-attempt refusal (Decision 1's "found during implementation" note) — it goes through the normal 4-attempt budget and fails the same way every time, costing one wasted cycle before the User sees the (accurate) cause and can fix the file outside the app.

## Migration Plan

No migration. Sessions stuck in `final-video-generating` because of an unrecorded assembly failure (only possible on PR #25's code) can be found by their last `assembly` attempt being failed with no final video. Task 4.4 adds a one-time boot step that records their failure, so they become retryable. Rolling back means removing the route, the launcher and the failure derivation; recorded failures are then ignored, as before.

## Open Questions

1. Manual retry after a not-retryable assembly failure: shared with JOS-155 Open Question 1.
