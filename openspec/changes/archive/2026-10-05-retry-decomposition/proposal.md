# Manually retry a failed decomposition

Linear-Issue: JOS-156 (US-24)

## Why

A decomposition can fail in two steps. Either way, it leaves the session `failed` with `failedPhase: "decomposition"` and no chunks:

- **Obtaining the timestamps** (JOS-139): native timestamps unusable, the alignment provider unavailable, or an unusable alignment result.
- **Dividing the script into chunks** (JOS-140, JOS-144): segmentation refused, a decomposition that fails validation, or the reasoning provider failing to write the `IMAGE` and `VIDEO` instructions.

The narration is already paid for and locked. §10.3 says both steps are retried on what already exists:

- timestamps on the same audio, going straight to forced alignment once native timestamps were judged unusable (§11.1);
- the decomposition on the same script, without rewriting it or regenerating the audio.

Today the User has no command for either, so a decomposition failure ends the project.

The entry points already exist, and the ticket's hand-off comments describe them. `runDecompositionPhase` obtains the timestamps only if they are missing, then segments and registers the chunks. Calling it again *is* the retry. What is missing is:

- the command;
- the checks around it;
- the retry cycle (JOS-184);
- what the session shows while the retry runs;
- the button.

## What Changes

- **A manual decomposition retry command**: `POST /sessions/:sessionId/decomposition/retry`, with no request body. It follows the route pattern from `retry-voice-over` (JOS-155). It is accepted only when:
  - the session is `failed` with `failedPhase: "decomposition"`;
  - it has no chunks;
  - its failure is retryable (JOS-184: a not-retryable failure offers no manual retry);
  - no retry for it is already pending or running.

  Each refusal answers 409 with a reason. An unknown session answers 404, and any body field answers 400.
- **The retry resumes at the step that failed**, decided from the records:
  - **No timestamps stored → the timestamps step (AC1).** It runs on the same stored MP3. If an earlier attempt judged the native timestamps unusable, it goes straight to forced alignment.
  - **Timestamps stored → the division step (AC2).** The same locked script is divided again from the stored timestamps, and new `IMAGE` and `VIDEO` instructions are requested. Nothing is rewritten.
- **Never the voice-over (AC3)**: the retry has no path to the voice provider. The MP3, its record and its native timestamps file are read, never written. Tests check that the voice stub receives nothing and that the MP3's bytes are unchanged.
- **A new retry cycle on the stage that failed**: `startNewCycle` (JOS-184) opens a cycle on the decomposition stage instance, which both steps share, with an attempt of the stage that failed (`timestamps` or `decomposition`, §10.3's two rows). Earlier attempts stay recorded (§10.2, D06).
- **The division step records its attempts**: today it records none, so a division failure has nothing to open a cycle on. This change adds the `decomposition` attempt stage and records one attempt per division try, as the timestamps step already does.
- **The retry runs on the scheduled attempt**: the `timestamps` and `decomposition` stages get attempt senders, so the attempt `startNewCycle` leaves is claimed and used rather than duplicated, and a small registry supplies the alignment and instruction providers at runtime.
- **A decomposition launcher for pause and continue**: the `decomposition` stage gets a registered launcher (JOS-152), so a retry requested while paused is accepted, counted as held, and launched on continue. The stage comes off `NOT_YET_LAUNCHABLE`.
- **The session shows progress at once**: an accepted retry derives `chunk-decomposing` until it ends (§8.1). The existing rules already give this, because `startNewCycle` clears the failure and earlier `timestamps` attempts exist; tests pin it.
- **A retry button on the page**: `phaseActions` returns `retry` for a failed, retryable decomposition phase. The Decomposition phase section shows a "Retry decomposition" button.

## Capabilities

### New Capabilities

- `decomposition-manual-retry`: retrying a failed decomposition by hand. It covers:
  - when the retry is allowed and how a refusal is reported;
  - resuming at the failed step: timestamps on the same audio, with the alignment switch, or division of the same script;
  - the guarantee that the voice-over is never regenerated;
  - the new cycle on the right stage instance;
  - pause handling through the decomposition launcher;
  - the derived state while the retry runs;
  - the retry action on the page.

### Modified Capabilities

None in `openspec/specs/`. Two requirements of the unarchived umbrella change `decompose-script-into-chunks` describe this behaviour:

- "A manual retry of timestamps stays on the same audio and mechanism-appropriate provider";
- "A manual retry of decomposition re-splits the same script".

This change owns and implements them. The umbrella's artifacts must then point here, so the requirement is not kept in two places (task 1.4, with the user's approval).

## Impact

- **Backend**:
  - A new `decompositionRetry.ts` service: checks, choice of the failed step, `startNewCycle`, then the gate.
  - `AttemptStage` gains `decomposition`; `segmentStoredTimestamps` records its attempts; both steps accept a claimed attempt (`narrationTimestampsPhase.ts`, `decompositionPhase.ts`, `sceneRegistration.ts`).
  - Attempt senders for `timestamps` and `decomposition`, and a `decompositionDependencies.ts` registry for the two providers.
  - The `decomposition` stage launcher, registered next to the image and video launchers, with `heldWork` and `launch`.
  - `routes.ts`: the route and its Zod schemas.
  - No new table and no migration; the pending retry is JOS-184's scheduled attempt.
- **Frontend**: `phaseActions.ts`, `PhaseSection.tsx` (button, pending state, refusal text), and `api/client.ts` (`retryDecomposition`).
- **API contract**: `docs/api-spec.yml` gains the route.
- **Built on (all merged into `feature/entrega-2-JAME`)**:
  - **`bounded-retry-policy` (JOS-184)**: `startNewCycle`, scheduled attempts and the attempt senders.
  - **`view-progress-by-phase` (JOS-168)**: phase sections and `phaseActions`.
  - **`generate-voice-over` (JOS-136)**: the stored voice-over. Tests create it through the store, as the existing decomposition tests do.
- **Product decision (answered with JOS-155)**: a manual retry is not offered after a not-retryable failure, so segmentation refusals, which are recorded as not retryable, offer no retry.
- **Relationship to `retry-voice-over` (JOS-155)**: JOS-155 has merged its service only. Its route schemas, reason table, button and derived-state change are still to come. Whichever lands first adds them, and the other reuses them.
- **Out of scope**:
  - automatic retries and delays (JOS-184);
  - per-phase time limits (JOS-185);
  - launching the decomposition after the narration completes (JOS-136);
  - correcting instructions (US-25, US-26);
  - replacing established chunks, which the store forbids.
