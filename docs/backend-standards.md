---
description: Backend development standards, best practices, and conventions for the Vid4You Node.js/TypeScript/Fastify application, covering stack, orchestration architecture, validation, API/OpenAPI conventions, testing and diagnostics
globs: ["backend/src/**/*.ts", "backend/test/**/*.ts", "backend/tsconfig.json", "backend/package.json", "backend/vitest.config.ts"]
alwaysApply: true
---

# Backend Project Standards and Best Practices

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [Why not classic DDD/CRUD layering](#why-not-classic-dddcrud-layering)
  - [Core components](#core-components)
  - [Provider adapters](#provider-adapters)
  - [Retries and attempts](#retries-and-attempts)
- [Coding Standards](#coding-standards)
  - [Naming Conventions](#naming-conventions)
  - [Error Handling](#error-handling)
  - [Runtime constraint: erasable TypeScript only](#runtime-constraint-erasable-typescript-only)
  - [Validation](#validation)
- [API and OpenAPI Conventions](#api-and-openapi-conventions)
- [Live Updates](#live-updates)
- [Persistence](#persistence)
- [Testing Standards](#testing-standards)
  - [Unit Testing](#unit-testing)
  - [Manual Endpoint Testing](#manual-endpoint-testing)
  - [End-to-End Testing](#end-to-end-testing)
- [Logging and Diagnostics](#logging-and-diagnostics)
- [Security and Configuration](#security-and-configuration)
- [Development Workflow](#development-workflow)
- [Media Assembly Pipeline](#media-assembly-pipeline)
- [Not Yet Decided](#not-yet-decided)

---

## Overview

This document describes the backend standards for Vid4You: a local, single-user application that turns a script into a narrated MP4 through five provider-backed stages (voice, timestamps/decomposition, per-scene image, per-scene video, final assembly — `docs/PRD.md` §5). The backend's central problem is **long-running, resumable, per-scene orchestration** under a bounded retry budget and a concurrency cap shared across sessions — not CRUD. Standards here are chosen to serve that problem, not a generic REST-over-a-database template.

This document replaces the previous version, which described an unrelated inherited template application and its stack. That content had no bearing on Vid4You and has been fully removed.

The stack decision, its rejected alternatives, and the live evidence behind it are recorded in `docs/adr/0001-backend-stack.md`. Read it before this document for the "why"; this document is the "how."

## Technology Stack

- **Node.js** — runtime. Modern versions run TypeScript source directly (type-stripped) without a separate build step for development; a `tsc` compile step is used for the type-check gate and for producing what actually ships.
- **TypeScript**, `strict: true` — per `docs/base-standards.md`'s project-wide "all code must be fully typed."
- **Fastify** — HTTP framework. Chosen over AdonisJS/NestJS as the lighter-ceremony option for a backend that is primarily a background orchestrator with an HTTP surface, not a CRUD API (ADR 0001).
- **Zod**, via `fastify-type-provider-zod` — request/response validation, with types inferred from the same schemas (no separate DTO duplication).
- **`@fastify/swagger`** + **`@fastify/swagger-ui`** — OpenAPI generated from the Zod schemas, served at `/docs`.
- **Vitest** — unit testing.
- **Fastify's built-in logger (Pino)** — structured JSON logging.
- **ffmpeg**, invoked as a subprocess — media assembly, per `define-media-assembly` (JOS-182); the pipeline itself is documented there, not duplicated here.
- Persistence engine: embedded SQLite via `node:sqlite` — see [Persistence](#persistence) below.

## Project Structure

`backend/src/` is **flat**: one module per concern, with three small subfolders. The role of each module is described below instead of being encoded in folders (the `domain/` / `persistence/` / `http/` split this document used to show was never built; the product owner chose, on 2026-10-04, to make the document match the code rather than move every file while several stage branches were open).

```
backend/
├── src/
│   ├── server.ts, routes.ts                 # HTTP: Fastify instance, plugins, boot reconciliation call; every route with its Zod schemas
│   ├── db.ts                                # persistence: embedded SQLite via `node:sqlite`, migrations, every repository function
│   ├── orchestrator.ts                      # orchestration: launch, retry, idempotent result handling, boot reconciliation
│   ├── concurrency.ts, launchGate.ts        # orchestration: per-stage FIFO semaphore; pause gate and held-work launchers
│   ├── sessionStateMachine.ts, assemblyGate.ts, *Phase.ts, *Retry.ts, voiceLaunchGuard.ts, decompositionDependencies.ts
│   │                                        # orchestration: derived session state and the per-phase flows (voice-over, timestamps, decomposition, assembly)
│   ├── provider.ts, imageProvider.ts, videoProvider.ts, voiceProvider.ts, alignmentProvider.ts,
│   │   visualInstructions.ts, assemblyTool.ts, ffmpegAssemblyTool.ts, stubAssemblyTool.ts, imageOutputCheck.ts
│   │                                        # provider adapters and their ports, plus the stubs used by tests and manual runs
│   ├── sentences.ts, sentenceTimings.ts, segmentation.ts, clauseSplitting.ts, clauseBoundaries.ts,
│   │   narrationTimestamps.ts, sceneRegistration.ts, admittedDurations.ts, types.ts
│   │                                        # pure domain helpers and shared types (no side effects)
│   ├── retry/                               # retryPolicy.ts (pure), retryScheduler.ts, stageAttemptRecorder.ts
│   ├── config/                              # providers.ts (every hardcoded PRD value), credentials.ts
│   └── util/                                # ulid.ts
├── test/                                    # vitest, one file per behaviour; setup.ts resets the voice provider stub
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**`backend/` now exists** — promoted from the throwaway skeleton (`start-video-project`, JOS-134, extending `docs/adr/0001-backend-stack.md` § Consequences' "kept as the project seed" decision). Each stage's own change implements its slice of the five-stage model (voice-over, decomposition, image, video and assembly are real stages); `provider.ts`'s generic stub remains only for scenes registered without a decomposition (see [Not Yet Decided](#not-yet-decided)).

## Architecture

### Why not classic DDD/CRUD layering

The previous version of this document prescribed a Presentation → Application → Domain → Infrastructure layering built around ORM-backed entities belonging to an unrelated application. That shape fits a CRUD application. It does not fit Vid4You's actual hard problem: a request can be *sent*, the process can *die*, and on restart the code must determine whether the external provider still holds a result, without duplicating work or losing the attempt budget. That is a state-machine-and-scheduler problem, not an entity-repository problem. The architecture below is organized around that instead.

### Core components

- **`RetryPolicy`** — a pure function: `(outcome, attemptsInCycle) → Complete | ScheduleNext | Fail`. No I/O, no side effects; fully unit-testable without a running server or database. This mirrors `bounded-retry-policy` (JOS-184)'s Decision 2, which owns the real policy (backoff, `stageInstanceKey` keying by `(sessionId, stage)` or `(sessionId, sceneId, stage)`); this document does not restate that design, only conforms to it.
- **`orchestrator`** — everything with side effects sits here: launching a stage, applying `RetryPolicy`'s decision, handling a (possibly duplicate) provider result idempotently, and reconciling in-flight work on boot. Proven live in the walking skeleton (`docs/adr/0001-backend-stack.md` § Evidence) against all four PRD behaviours hardest to retrofit (bounded retries, shared concurrency, restart resumption, idempotency).
- **`concurrency`** — a FIFO semaphore per stage, shared across all sessions (PRD §10.1). A queued request has not been sent: no attempt is consumed and no per-phase clock starts for it. **Every slot belongs to a holder** (the scene id): `acquire(stage, holder, onAcquired)` and `release(stage, holder)`, so a release by a holder with no slot, or a second release of the same slot, changes nothing, and a scene that already holds a slot or is queued in a stage is not queued twice. `occupy(stage, holder)` counts a request that was **already sent** (before a restart) against the cap even at or above the limit, and never queues; `recoverOnBoot` calls it for every resumed request before processing any scene, so the in-flight count may sit **above** the cap after a restart and no new request is sent until it drains below it. The semaphore is in memory only: boot rebuilds the count from `provider_requests` and scene state, and then relaunches waiting work (`relaunchPendingWork`) for sessions that are not paused. (`harden-backend-foundation`, JOS-186; evidence in `openspec/changes/harden-backend-foundation/reports/`.)
- **Provider adapters** — see below.
- **`assemblyGate`** (`gate-assembly-on-complete-scenes`, JOS-150) — a pure function over the scenes: open only when every scene is `chunk-complete`, otherwise closed with the ascending `processingSceneIndexes` and `failedSceneIndexes`. It is the single launch condition for final assembly (PRD §7.3, AC12): anything that starts assembly calls it, and nothing re-derives the rule. A scene is *settled* when it is `chunk-complete` or `failed` (`isSceneSettled`); "still generating" is the complement, so a new non-final scene status counts as generating without editing a hand-written list. `deriveSessionState` is built on the same two functions, so the session state and the launch condition cannot disagree.

Stage attempts are recorded **append-only**, written *before* the request is sent (not after the response returns), per `define-persistence` (JOS-181)'s Decision 1 and Decision 2 — write-then-send is what makes restart resumption possible at all; write-after-response leaves no trace of a request that was in flight when the process died. Each attempt record carries its stage, sequence within the 1 + 3 budget, provider, outcome, external request identifier, and queued-versus-executing time (`define-persistence` Decision 1). Idempotency (a repeated success confirmation) is enforced by a **uniqueness constraint in the store**, not an application-level check-then-write (`define-persistence` Decision 3) — a check-then-write has a race window that a store constraint does not.

### Provider adapters

One adapter per stage (voice, alignment, image, video, assembly). Per `generate-voice-over` (JOS-136)'s Decision 4, an adapter returns an **already-classified** outcome (success, transient failure, or not-retryable failure) — classification is the adapter's job, not the orchestrator's, since only the adapter knows a given provider's error shapes. Per `bounded-retry-policy`'s Decision 6, every adapter disables its own HTTP client's/SDK's built-in retries; the bounded retry budget (§10.1) is the *only* retry mechanism, or an internal library retry loop would silently multiply it.

**Rule for every new adapter (image, video, reasoning, alignment, assembly and any later one):** one provider request per call, made with `fetch` directly or an SDK client configured with automatic retries off (`maxRetries: 0` or the equivalent); no retry loop, no backoff, no `Retry-After` handling inside the adapter. A `Retry-After` is only reported upward so the retry policy can respect it. The guard is `backend/test/adapters-no-hidden-retries.test.ts`: add the new adapter to it, and the story is not done until a failing call is shown to be made exactly once.

**The reasoning adapter** (`backend/src/visualInstructions.ts`, `assign-scene-identifiers`, JOS-144) follows the same rule: `VisualInstructionGenerator` is the port and the OpenAI adapter sends **one** chat-completions request for all fragments (`response_format: json_object`, the shape verified in JOS-165), validates the answer with Zod (exactly one non-empty `image` and `video` per fragment), and classifies failures by HTTP status the way the product owner set for voice (not retryable: 4xx except 408 and 429; transient: 408, 429, 5xx, network errors and the phase time limit). It uses `fetch` directly, with no SDK and no retry loop, reads `OPENAI_KEY` through `loadCredential`, and never puts the provider's raw body or the key in a reason. Real calls run only in the opt-in contract test (`RUN_PROVIDER_CONTRACT_TESTS=1`).

**The alignment adapter and the timestamps step** (`backend/src/alignmentProvider.ts`, `narrationTimestampsPhase.ts`, `obtain-narration-timestamps`, JOS-139) follow the same rules. `AlignmentProvider` is the port; the ElevenLabs Forced Alignment adapter sends one multipart request (the stored MP3 as `file`, the locked script as `text`, unaltered), with the 5 s phase limit, no retry and the HTTP-status classification. `obtainNarrationTimestamps(runId, alignmentProvider)` takes only the alignment port, so the voice provider cannot be called again and the MP3 cannot be regenerated. **Usable** timestamps (`narrationTimestamps.ts`, pure) are those with at least one character, characters that reproduce the script (exactly for native, apart from whitespace for alignment), finite non-negative ordered times, and a last end within the narration's duration plus half a second; gaps are allowed. Native first, alignment in the same attempt when native are missing or unusable, and straight to alignment on every later attempt once native were judged unusable. Nothing in the running app calls it yet: the voice phase (JOS-136) calls it once a narration completes.

**The voice stage and the voice-over phase** (`backend/src/voiceProvider.ts`, `voiceOverPhase.ts`, `generate-voice-over`, JOS-136) are the first session-level stage, launched once per session rather than once per scene, and follow the same rules. `VoiceProvider` is the port (`synthesize(request)`), and the ElevenLabs adapter sends **one** synchronous text-to-speech request with timestamps for the whole script, sent exactly as stored: no SDK, no retry loop, no default time limit (the per-phase limit is passed in by the time-limits story, JOS-185). It classifies by HTTP status (4xx except 408 and 429 is not retryable, everything else transient), reads its credential only through `loadCredential`, and never copies the provider's body into a failure reason. The registry (`getVoiceProviderRegistry`, `setVoiceProviderRegistry`, `resetVoiceProviderRegistry`) mirrors the video provider's, and the session binds its provider on the first attempt (`voice_provider_id`) so a later change of the default cannot split one narration across providers. `createStubVoiceProvider(mode)` is the stand-in every test uses, and `USE_STUB_VOICE_PROVIDER=<mode>` selects it at server start for manual and end-to-end runs; the real ElevenLabs is never called from tests.

**The phase-launch gate for the voice stage.** The phase registers its own `StageLauncher` (`voiceOverLauncher`, stage `voice-over`) with `registerStageLauncher`, as the image and video stages do, and every start goes through `launchVoiceOverFor(sessionId)`, which asks `admitLaunch` before anything is claimed: a paused session keeps its voice-over as held work (count 1, no scenes) and `continueSession` launches it. `startVoiceAttempt` is the one write that moves a session to `voice-over-generating`: it binds the provider, clears an earlier failure and records the `in-flight` stage attempt in one transaction, before the request is sent. A confirmed result is stored through `confirmVoiceOver`, which measures the duration of the stored MP3 with `ffprobe` (a prerequisite of the backend), writes the MP3 and the raw timestamps once and inserts the locked record; a duplicate or concurrent confirmation changes nothing. The session state is derived from these records (`deriveSessionState`); no state column exists.

**The retry hook** is `setTransientFailureHook` / `resetTransientFailureHook` in `voiceOverPhase.ts`: a transient failure is handed to the hook with `{ runId, attemptNumber, cause }`, and it answers `"handled"` (the policy took over: nothing is stored as a failure, and the policy starts the next attempt itself through `startVoiceAttempt`, which is what moves the session back to `voice-over-generating`) or `"fail"` (the phase stores the failure). Either way the failed attempt itself is already recorded as `transient`. The default hook answers `"fail"`, so until the bounded retry policy (JOS-184) installs its own, a transient failure fails the session with `retryable: true`. Manual retry (JOS-155), the pause and continue stories and the time limits (JOS-185) extend the launcher and this hook; they do not wrap the phase or re-derive its state.

**Registering chunks** goes through one entry point, `registerDecomposition(runId, fragments, generator, voiceOverDurationSeconds)` (`backend/src/sceneRegistration.ts`). It validates the fragments first (non-empty, the 5-15 s bounds with the two §6.1.1 exceptions, script reconstruction), then checks that the fragments' narration intervals partition the voice-over (`assign-narration-intervals`, JOS-143; see below), then asks the generator, then inserts every chunk in one transaction; an invalid result records a `decomposition` failure and writes no chunk. Nothing in the running app calls it yet: the segmentation story (JOS-140) wires it in.

**Narration intervals** (`assign-narration-intervals`, JOS-143) are never computed a second time. `segmentScript` takes each fragment's interval from the one `unitBoundaries` array that also measured it, `[boundaries[first], boundaries[last + 1]]`, and hands it over as `SegmentedFragment.narrationInterval`; the fragment's narrated duration is derived from it with `intervalDurationSeconds`, so a duration and an interval cannot disagree. Registration receives the voice-over's duration as an explicit parameter (the same value segmentation measured with) and checks the partition with **exact `!==` comparisons, no tolerance**: the first interval starts at 0, each starts where the previous ends, none is empty, the last ends at the voice-over's duration. A tolerance would only hide a second boundary rule creeping in. A violation is a retryable `decomposition` failure naming the scene and writes no chunk; a duration that is not finite and positive is a not-retryable one. The intervals are written in the registration transaction into `scenes.narration_start_seconds` / `narration_end_seconds` and locked by triggers (migration 9); they are exposed read-only as `narrationInterval` and no request schema accepts one. Anything that needs to place a chunk on the narration (assembly, speed-factor warnings) reads these columns instead of re-deriving them.

**The requested clip duration** (`request-admitted-clip-duration`, JOS-147) is decided once at registration, from the chunk's own stored interval, and never recomputed — the same pattern as the narration interval above. `requestedClipDuration(interval, admitted?)` (`admittedDurations.ts`) wraps `closestAdmittedDuration` (JOS-140): it measures the interval with `intervalDurationSeconds` (moved into this module from `sceneRegistration.ts` so the two can depend on each other in only one direction — `admittedDurations.ts` has no dependency on `sceneRegistration.ts`), picks the admitted duration needing the smallest speed change (never the fewest seconds, an exact tie going to the longer duration — the same §7.2 measure segmentation's grouping search already uses), and sets the warning `exceeds-maximum` only when the interval is narrated longer than the largest admitted duration (an unsplittable sentence, §6.1.1) — not a failure. `closestAdmittedDuration`'s admitted-durations list is now an optional second argument (default `VIDEO_ADMITTED_DURATIONS_SECONDS`), added without changing its existing callers, so a later build's admitted set can never reach back and change an already-registered chunk's request: `registerDecomposition` computes both values once per fragment, after the partition check, and `insertRegisteredScenes` writes `requested_duration_seconds` / `duration_warning` in the same transaction as the interval, locked by their own triggers (migration 10). They are exposed read-only as `requestedDurationSeconds` / `durationWarning`; no request schema accepts either.

**The speed-adjustment factor** (`record-speed-adjustment-factor`, JOS-148) is the ratio `closestAdmittedDuration` already computes while picking the requested duration above — `RequestedClipDuration.factor`, `closestAdmittedDuration`'s own `speedRatio` passed through unchanged, never recomputed from `requestedDurationSeconds`/the interval after the fact (that would be the same formula run twice on values already in hand, the kind of repeated pattern this project's standards flag). `registerDecomposition` compares it against `SPEED_FACTOR_LIMIT` (`config/providers.ts`, `2.0` — the unsigned mapping of `define-media-assembly`'s 0.5×-2.0× signed-rate recommendation, ADR 0005 Decision 5) right after `requestedClipDuration` returns, and `insertRegisteredScenes` writes `speed_factor` / `speed_factor_warning` in the same transaction and the same migration-10-style lock triggers (migration 11). `speed_factor_warning` (`exceeds-limit`) is independent of `duration_warning` (`exceeds-maximum`) — a chunk may carry either, both, or neither. Exposed read-only as `speedFactor` / `speedFactorWarning` on the session/scene read and, on the frontend, in `SceneRow.tsx`'s scene-details panel; no request schema accepts either.

**Segmenting the script** (`segment-script-into-chunks`, JOS-140) turns the stored timestamps into fragments, in four small pure modules and one phase entry point. `sentences.ts`: a sentence ends at `.`, `!`, `?` or `…` (a run of them, plus closing quotes or brackets) followed by whitespace or the end, except after a listed abbreviation (English or Spanish lists; other languages use the English one) or a single capital letter; sentences are exact substrings with offsets. `sentenceTimings.ts`: characters are matched to the script by walking the non-whitespace characters of both (native timestamps list whitespace, alignment does not); a sentence's speech span runs from its first to its last spoken character; **one duration rule, D11's decided answer**, partitions the narration (`decide-silence-allocation`, JOS-142, product owner decision 2026-09-29): the boundary between two units is the *following* unit's own speech start — the previous unit absorbs the silence after it, so a scene change always falls exactly when the next sentence's narration begins, never mid-silence — the first boundary is 0 and the last is the MP3's duration. Chosen over splitting the silence between the two scenes (the rule this replaces) from a rendered comparison of real narration the product owner judged. A clip sustains up to 2 s of silence acceptably (3 s starts dragging); no third rule was needed since no real measured pause reached it. This is the one function the interval story (JOS-143) must reuse rather than re-deriving; full evidence and the rejected alternative are in `docs/adr/0006-silence-allocation.md`. `segmentation.ts`: `segmentScript(script, language, characters, mp3Duration)` runs an exhaustive dynamic programme over sentences; a fragment is allowed at 5-15 s (a sentence over 15 s alone, or a short sentence plus the next one over 15 s, are kept whole and flagged `unsplittable-sentence` only when neither has a clause boundary to split at (JOS-141, below); a whole script under 5 s is one fragment flagged `script-below-lower-bound`); the chosen grouping has the fewest fragments ending on a short sentence, then the smallest total speed change (the sum of `ln` of §7.2's ratio to the closest admitted duration, a tie going to the longer), then fewer fragments, then the later first cut. Forbidding a fragment from ending on a short sentence outright left real narration (mostly 3-5 s sentences) with no valid grouping, hence "prefer, but allow". No valid grouping returns an error, never fragments. `admittedDurations.ts` and `VIDEO_ADMITTED_DURATIONS_SECONDS` (`config/providers.ts`, whole seconds 5-15, verified at 5, 8, 11 and 15) define "closest"; the provider returns clips slightly off the requested length (5 s gave 5.17, 11 s gave 11.54), so use a clip's measured duration. `decompositionPhase.ts`: `segmentStoredTimestamps(runId, instructionGenerator)` reads the stored timestamps, segments, and registers through `registerDecomposition`; no valid grouping, or unreadable stored timestamps, records a not-retryable `decomposition` failure worded as the system's; `runDecompositionPhase(runId, { alignmentProvider, instructionGenerator })` obtains the timestamps first when missing and stops at the first failing step. Nothing in the running app calls it yet: the voice phase (JOS-136) calls it once a narration completes.

**Splitting a sentence at a clause boundary** (`split-sentences-at-clause-boundaries`, JOS-141) replaces `segmentScript`'s interim "always whole" rule with a real split wherever one is possible, in two small pure modules that run before the search. `clauseBoundaries.ts`: `findClauseBoundaries(sentence, language)` finds a boundary right after a comma or semicolon followed by whitespace, or right before a listed conjunction (English or Spanish, a fixed constant per language) preceded by whitespace and never the sentence's first word; a comma or semicolon directly followed by a conjunction counts once, after the punctuation. `cutAtClauseBoundaries` cuts at those offsets into trimmed exact substrings. A real bug this surfaced: JS's plain `\b` treats an accented letter as a non-word character, so the Spanish conjunction "ni" falsely matched the first two letters of "niña"; fixed with a Unicode-aware end-of-word check (`(?![\p{L}\p{N}])`) instead of `\b` — worth remembering for any future per-language word-matching regex. `clauseSplitting.ts`: `classifyMustSplit(durations)` marks, from sentence durations alone, which sentences must split — **free** (its own narration exceeds 15 s) or **borrowed** (it follows a short sentence and their sum exceeds 15 s; a sentence can be both, in which case the free rule's full boundary list applies). `buildUnits` then turns sentences into the flat unit list `segmentScript` searches over: a sentence that is neither stays exactly one unit however many commas it has (AC3); a free sentence is cut at every clause boundary; a borrowed-only sentence is cut at only its first boundary, so its remainder stays one unit unless it is also free; a must-split sentence with no boundary stays whole and keeps the `unsplittable-sentence` flag. `segmentScript` needs no other change: the same allowed-chunk rules and cost (including the short-ended-fragment preference, which now applies to a short clause piece exactly like a short sentence) run over units instead of sentences, and a unit's fragment text is still an exact script slice, so pieces reproduce the sentence. The opt-in contract test needs an MP3 (`ALIGNMENT_CONTRACT_MP3`, `ALIGNMENT_CONTRACT_SCRIPT`, `ALIGNMENT_CONTRACT_DURATION`, `RUN_PROVIDER_CONTRACT_TESTS=1`).

**The image stage** (`backend/src/imageProvider.ts`, `orchestrator.ts`, `generate-chunk-image`, JOS-145) turns this story's real, launched-per-scene stage into the second kind of provider adapter this codebase has: `ImageProvider` is the port (`generate(instruction)`), and the Fal.ai adapter (`createFalAiImageProvider`) sends **one** synchronous `POST` to `fal-ai/flux/dev` with the instruction and the recorded `{width: 1920, height: 1088}` request size, `Authorization: Key <FAL_API_KEY>` through `loadCredential`, and the product owner's HTTP-status classification. Unlike the reasoning and alignment adapters (called once per phase, directly, with their dependency passed as a function parameter), the image stage is launched from many places over a session's lifetime — after registration, on resume from pause, on automatic retry, on boot — so `imageProvider.ts` keeps a small module-level `ImageProviderRegistry` (`defaultIdentifier` plus an identifier→adapter map, `getImageProviderRegistry`/`setImageProviderRegistry`) instead of threading the adapter through every one of those call sites; tests swap it for a stub the same way `concurrency.ts`'s `setLimit` and `provider.ts`'s own module-level stub are already configured per test. The *first* attempt of a chunk's image stage binds `scenes.provider` to the registry's current default, atomically (`bindSceneImageProvider`, an `UPDATE ... WHERE provider = <unbound sentinel>`) so a caller never needs a prior read to know whether it is safe to write; every later attempt resolves the *bound* identifier from the registry, and a bound identifier absent from it (a retired provider) fails not-retryable with no other adapter tried (PRD §11.2: no provider switching in the MVP). A successful generation is checked against `isAcceptedImageSize`/`readImageDimensions` (`imageOutputCheck.ts`: at least 1920×1080, horizontal, within ±1% of 16:9 — an exact 16:9 check would reject the recorded 1920×1088 request size) measured from the stored file's own bytes, never from provider-reported metadata; a temporary-link result is downloaded first (`downloadGeneratedImage`, itself swappable for tests the same way). Fal.ai's call has nothing to poll after it returns (unlike a job-based provider), so it is not modelled through `provider.ts`'s submit/poll simulation: `launchImageStage` awaits the adapter directly, and a scene found `image-generating` at boot with a bound (non-sentinel) provider is always reconciled as one interrupted, failed attempt — never as "still pending" — which is how the image stage's boot settle tells a real in-flight scene apart from the skeleton's own generic-stub ones (still at the sentinel, resolved through `provider.ts` as before).

**The video stage** (`backend/src/videoProvider.ts`, `orchestrator.ts`, `generate-chunk-video`, JOS-146) adds the third provider adapter. `VideoProvider` is the port — a submit-and-poll shape unlike the image stage's single synchronous call:

```typescript
interface VideoProvider {
  submit(params: { imageBytes: Buffer; instruction: string; durationSeconds: number }): Promise<VideoSubmitResult>;
  poll(requestId: string): Promise<VideoGenerationResult>;
}
```

`submit` returns `{ kind: "submitted"; requestId }` or a failure; `poll` returns `pending`, `success`, `not_found` or a failure. The RunningHub adapter uploads the image via `POST /openapi/v2/media/upload/binary`, submits a task (`POST /openapi/v2/task/openapi/create`) with `{ prompt, duration, resolution: "2K", firstFrameUrl }`, and polls status (`POST /openapi/v2/task/openapi/status`); the `taskId` becomes the `requestId`. HTTP 4xx (except 408/429) is not-retryable; everything else is transient — there is no distinguishable not-retryable signal from RunningHub (`JOS-165`). The registry follows the same pattern as `imageProvider.ts` (`getVideoProviderRegistry`/`setVideoProviderRegistry`/`resetVideoProviderRegistry`), and binding uses `bindSceneVideoProvider` with the same atomic sentinel pattern.

**Per-stage concurrency key**: the video stage uses `"video"` (not `"image"`) as the stage key to `concurrency.acquire`/`release` (the holder is the scene id), provisionally capped at 3 (`PROVISIONAL_VIDEO_CONCURRENCY`, `config/providers.ts`). The image stage uses `"image"`. A correct implementation never touches the other stage's semaphore slot — mixing the two keys would silently consume the wrong budget.

**Per-stage attempts**: the `scenes.attempts` counter resets to 0 at the start of the video stage (`resetAttemptsForVideoStart`), so a chunk that consumed 3 image-stage attempts starts the video stage fresh at 1. The full attempt history for both stages lives in `provider_requests` rows, distinguished by `provider_requests.stage` (`'image'` or `'video'`). Boot recovery (`recoverOnBoot`) uses this column to decide which adapter to resume polling with.

**Clip-retry refusal**: `manualRetry` and `correctAndRetry` refuse a video-stage failure (`scene.result !== null`) with `{ ok: false, reason: "retrying a failed clip is not available yet" }` (HTTP 409). The clip retry path is deferred to JOS-150 (`gate-assembly-on-complete-scenes`) or later. Callers must check `affectedStage` on a failed scene to distinguish image-stage failures (retryable via these endpoints) from video-stage failures (not yet retryable). This refusal is tested in Group 6.3 of `test/video-stage.test.ts`.

**MP4 validation**: `completeVideoStage` checks the first 8 bytes of the downloaded clip for the `ftyp` box before writing it to disk — `bytes[4..7] === 'ftyp'` — and rejects non-MP4 data as a transient failure.

### Stage diagnostics: what may reach the page

`see-provider-and-attempts` (JOS-166, PRD §3) shows, per scene stage and per phase, which provider was used and how many attempts were made. The rule for anything an attempt record could add to that:

- **A stage diagnostic is exactly `{ stage, provider: { name, model }, attempts }`**, declared as a closed object in the response schema (`.strict()`, `additionalProperties: false` in the generated spec). A field added by mistake fails validation; nothing is filtered out after the fact (an allow-list, not a deny-list, so a new column cannot leak by default).
- **Never** put a credential, an endpoint path, an external request id, a raw error code or message, or the script in a diagnostic. `test/stage-diagnostics-surface.test.ts` seeds sentinel values in every free-text column and in the credential environment and asserts none of them, nor `VIDEO_PROVIDER.endpoint`, appears in the read or the live snapshot. A new diagnostic field needs a sentinel in that test.
- **Every provider identifier a stage can bind or record needs a display entry** in `src/stageDiagnostics.ts` (`describeProvider`). An identifier with no entry is shown as `Unknown provider` and logged once, never echoed; `test/stage-diagnostics.test.ts` lists every known identifier.
- **Derive the counts from the append-only records on read** (`provider_requests`, `stage_attempts`), never from `scenes.attempts`, and read them for the whole session in one query: a snapshot is built on every change.

### Retries and attempts

`bounded-retry-policy` (JOS-184, PRD §10.1) owns every retry: a stage instance (`stageInstanceKey`) gets at most four attempts per cycle, and nothing but a new cycle started by the User adds more.

- **Record every outcome through `recordAttemptOutcome`** (`src/retry/stageAttemptRecorder.ts`). It completes the attempt, decides with the pure `decideRetry`, and schedules the next one in a single transaction. A stage never sets its own failure on a transient error and never decides whether to retry.
- **Fail the stage instance only on the recorder's `failed` result** (cap spent, or not retryable). Until then the session stays in progress and shows no failure.
- **Never enable client or SDK retries**; see the checklist under *Provider adapters*. `test/adapters-no-hidden-retries.test.ts` is the guard.
- **Retries go through the launch gate.** A scheduled attempt is released by `releaseAttempt` (`src/retry/retryScheduler.ts`), which asks `admitLaunch` first, so a paused session holds its retries and `continue` releases them.
- **A new cycle is opened only by `startNewCycle`**, which refuses an instance that has not failed or whose failure is not retryable.
- **A stage that wants retries registers a sender** with `registerAttemptSender(stage, sender)`; the scheduler calls it when an attempt is due and after a restart (`rebuildScheduler`). The sender must not make its own scheduling decisions.
- **The execution clock starts at `sent_at`** (`stage-execution-time-limit`, JOS-185, PRD §10.1). Time an attempt spends queued behind the request cap, held by a pause or waiting as a scheduled retry is never counted, and an unsent attempt has no deadline. The deadline is `sent_at` plus the stage's `PER_PHASE_MAX_TIME_SECONDS` (`src/retry/attemptDeadline.ts`, pure); a stage whose limit is `"undetermined"` has none. There are no per-attempt timers: `AttemptTimeoutWatcher` (`src/retry/attemptTimeoutWatcher.ts`) sweeps stored `in-flight` attempts at startup, after resumption, and then every second.
- **A stage opts into the watcher with `registerTimeoutHandler(stage, handler)`.** The recorder (`recordAttemptTimeout`) has already moved the attempt to `timed-out` and applied the policy; the handler only presents the stage's failure and logs. A stage with no handler is never timed out there. Today only `voice-over` registers; the image stage records no attempt row, so its limit is the Fal.ai adapter's default `timeoutMs`, and alignment and decomposition adapters abort at their own limit.
- **A late result goes through the same completion path as an on-time one.** After `await`ing the provider, a stage checks whether its attempt is now `timed-out` and, if so, lets the store decide (`handleLateResult` in `voiceOverPhase.ts`): accepted as `late-success` (cancelling any scheduled retry and lifting an exhaustion failure), or `superseded`; a late failure is only recorded. Never write a second completion path.
- **Each adapter records whether a result can arrive late.** A call that is aborted at the limit (decomposition, alignment, image) cannot; a call that keeps running (voice) or a job polled by id (video) can. See the table in `openspec/changes/stage-execution-time-limit/design.md` § Pre-implementation findings.
- **Delays are injected**, never read from a constant inside the policy. The defaults are `PROVISIONAL_RETRY_DELAY_SECONDS` until US-33 records the PRD values; tests call `setRetryDelayConfig`, and `RETRY_BASE_DELAY_SECONDS` / `RETRY_CAP_DELAY_SECONDS` shorten them for manual runs.

### Restart recovery

`preserve-progress-across-restarts` (JOS-160, PRD §12.1, AC14). `recoverOnBoot()` (`orchestrator.ts`) replaces the old `reconcileOnBoot` and runs in `server.ts` before `listen()`, in two passes:

1. **Settle.** The cap slots of every request that is resumed rather than failed are taken first (`occupy`, JOS-186). Then `settleAllInFlight()` calls each registered launcher's `settleInFlight()`: wait for the original result if the provider still holds the request, otherwise complete the attempt as `transient` with the cause `RESTART_CAUSE` ("interrupted by a restart") through the stage's own failure path. Settling does not launch new work.
2. **Relaunch.** For every session that is not paused, `relaunchPendingWork(sessionId)` launches each stage's pending work through the gate. Candidates are sessions with `submitted` or `image-complete` scenes, and unfinished sessions with scenes (assembly).

The recovery contract of a `StageLauncher`: `heldWork` and `launch` as before (the set `continue` launches), plus `settleInFlight()` (required), plus the optional `pendingAtBoot` when boot must relaunch less than `heldWork` reports. A stage that records attempts and has no time limit and no timeout handler must settle its orphaned in-flight attempts itself, or they stay in flight forever. A stage with no registered launcher is listed under `noRestartRecovery` in the boot log line.

| Stage | Settle at boot | Pending work relaunched |
|---|---|---|
| image | real provider: transient failure, retry through the retry rule; stub: poll | `submitted` scenes |
| clip | resume polling the original task; missing binding or request id: transient | `image-complete` scenes with a requested duration |
| voice-over | none; the timeout watcher's startup sweep ends it (10 s limit) | unchanged (held-work rule) |
| timestamps | transient, and a retryable decomposition failure on the session | none |
| decomposition (instructions) | transient, and a retryable decomposition failure on the session | none: nothing in the running app starts decomposition yet, so its pending rule belongs to the story that does |
| assembly | transient | all scenes complete, no final video, nothing in flight, latest attempt settled by a restart and fewer than four attempts in its cycle (`pendingAtBoot`); the relaunch continues the attempt sequence so the budget is not reset |

An acquire callback re-checks the unit's state and releases its slot when it finds nothing to do (JOS-186), which is what makes a unit that boot recovery and a live event both queue send once.

## Coding Standards

Naming, typing, TDD and English-only rules are inherited from `docs/base-standards.md` and are not restated here. This section covers what's specific to this backend.

### Naming Conventions

- **Files**: camelCase (`orchestrator.ts`, `retryPolicy.ts`)
- **Types/interfaces/Zod schemas**: PascalCase (`SceneStatus`, `CreateRunBody`)
- **The decomposition stage has two senders and one launcher.** (`retry-decomposition`, JOS-156; `backend/src/decompositionPhase.ts`, `decompositionRetry.ts`, `decompositionDependencies.ts`.) `timestamps` and `decomposition` both register `sendDecompositionAttempt`, which runs the step the attempt names with the providers from `getDecompositionDependencies()` (the alignment and visual-instruction providers, installed by `setDecompositionDependencies` in tests, the way `voiceProvider.ts` holds its registry); a scheduled attempt is claimed first and passed to the step as `claimedAttempt`, so the step completes it instead of recording a second one. `decompositionLauncher` (stage `decomposition`) reports a scheduled attempt of either stage, for a session with no chunks, as held work (count 1) and launches by releasing the session's attempts through the gate. `retryDecomposition(sessionId)` is the one service behind `POST /sessions/:sessionId/decomposition/retry`: it checks, in order, that the session exists, has no chunks, has no pending retry, failed in decomposition and that the failure is retryable; opens the cycle with `startNewCycle`; releases the attempt; and **publishes the session state with `broadcast`**, because a held retry runs no step and nothing else would tell live subscribers the failure was cleared. Any new retry path must publish after it records its attempt.
- **Stage identifiers**: the PRD's own stage names, not invented synonyms (`voice`, `alignment`, `decomposition`, `image`, `video`, `assembly`)
- **Constants**: UPPER_SNAKE_CASE, and every hardcoded PRD value (retry budget, concurrency caps, per-phase timeouts) lives in one constants module, **`backend/src/config/providers.ts`**, sourced from `define-provider-configuration` (JOS-165, `docs/adr/0005-provider-selection.md`) — never inlined at the call site. Values are read from it, never redefined; a value still pending another change is marked `"undetermined"` there rather than guessed (the speed-factor limit was marked this way pending `define-media-assembly`'s measurement; `record-speed-adjustment-factor`, JOS-148, set it to `2.0` once that measurement was available).

### Error Handling

- Domain errors are typed values returned from adapters and the orchestrator (`ProviderOutcome`, per the skeleton's `types.ts`), not thrown exceptions used for control flow. Exceptions are reserved for genuine bugs (an invariant violated, an unreachable branch).
- HTTP-layer errors map typed domain outcomes to responses at the route boundary; the mapping lives with the routes, not scattered across the domain layer.
- Never swallow an error silently: a caught error is either handled (with a recorded reason) or re-thrown.

### Runtime constraint: erasable TypeScript only

- The server runs as `node src/server.ts`, so Node strips the types and does not compile the file. Node refuses TypeScript syntax that emits code: **constructor parameter properties** (`constructor(readonly x: T)`), **enums** and **namespaces**. Declare class fields explicitly and assign them in the constructor; use union types or `as const` objects instead of enums.
- Vitest and `tsc` both accept the forbidden syntax, so two guards exist: `erasableSyntaxOnly` in `backend/tsconfig.json` (`npm run typecheck` rejects it) and `backend/test/server-runtime-load.test.ts`, which imports the server in a real `node` process. Found in `lock-script-and-narration` (JOS-137) and `generate-voice-over` (JOS-136), where such a class would have passed every test and crashed `npm start`.

### Validation

- Every route's body, params, and response are Zod schemas, registered through `fastify-type-provider-zod` so validation and the generated OpenAPI document can never drift apart.
- Schemas live next to the route that uses them, not in a separate, hard-to-find validator module (the shape that made the previous version's `validator.ts` a bottleneck).
- Validate at the edge (the HTTP boundary); once past it, code works with typed values, not `req.body` shapes.

## API and OpenAPI Conventions

- OpenAPI is **generated** from the Zod route schemas (`@fastify/swagger` + `jsonSchemaTransform`), never hand-written and never allowed to drift from the actual validators — proven in the skeleton (`GET /docs`).
- Resource-oriented URLs matching the PRD's own vocabulary: `/sessions`, `/sessions/:sessionId`, `/sessions/:sessionId/scenes/:sceneId/{retry,correct}`, `/sessions/:sessionId/{pause,continue}`. The consultation read and the live-update resync are the **same** endpoint (`GET /sessions/:sessionId` — `consult-session`, JOS-135, Decision 1), never two representations that could drift apart.
- Standard status codes: `200`/`201` for success, `400` for validation failure (Zod's own error shape, not a hand-rolled one), `404` for an unknown identifier (including an unknown session id on the live-update stream itself — see below), `409` for a state-conflict action (e.g. retrying a scene that isn't `failed`, or correcting one that hasn't).
- **Exception, deliberate:** on `GET /sessions/:sessionId`, a malformed identifier returns the same `404` as an unknown one, not `400` (`consult-session`, JOS-135, Decision 4) — the two must look identical, so this one route's request-side param schema is a plain string, not the strict ULID pattern used elsewhere; the not-found rule is enforced in the handler instead of pre-empted by framework-level validation.

## Live Updates

**Decided:** Server-Sent Events (`docs/adr/0003-live-updates.md`) — confirmed on independently-scored merits against WebSocket and polling, not inherited as a stand-in.

**Stream:** `GET /events?sessionId=<id>` — one stream per open session page, scoped by session identifier. A request naming an unknown session is rejected with `404` **before** upgrading to a stream — an unknown id must never open a live-forever-empty connection that looks identical to a quiet session (a real bug found and fixed while writing this change's mandatory curl transcript).

**Payload — the one contract, referenced from `docs/frontend-standards.md` rather than duplicated there:**
```ts
interface SessionEventPayload {
  type: "session"; sessionId: string; title: string; language: string;
  state: SessionState;      // PRD §8.1, the eight session states
  paused: boolean;          // always its own field, never folded into `state`
  failedPhase?: string;
  updatedAt: string;
}

interface SceneEventPayload {
  type: "scene"; sessionId: string; sceneId: string; index: number;
  state: SceneState;        // PRD §8.2, the six chunk states
  affectedStage?: "image" | "video"; errorCause?: string | null;
  provider?: string; attempts?: number;
  result?: { imageUrl?: string; videoUrl?: string };
  instruction?: string; updatedAt: string;
}
```
Every message carries **current state, never a delta** — a duplicate delivery is a no-op to apply, and a missed one is superseded by the next. The snapshot read (`GET /sessions/:sessionId`) returns `{ session, scenes: [...] }` in these exact same shapes.

**Coalescing:** the skeleton broadcasts a full snapshot synchronously on every state change rather than batching pending changes into fewer messages — proven safe under a 200-scene burst (no scene lost or corrupted) precisely *because* every message is a complete, current-state snapshot rather than a delta. This trades message volume for simplicity: literal batching (collapsing several rapid changes for the same entity into one message within a short window) was found unnecessary for correctness at the scale this MVP targets, but a future implementation may still want it purely to reduce bandwidth/render cost at larger scale — that would be a performance optimization on top of this contract, not a correctness requirement of it.

**Catch-up rule: resync, not replay.** A reconnecting client refetches the full snapshot; the server keeps no event log for replay. Consequence, stated once rather than left implicit: intermediate transitions occurring entirely within a disconnection window are never individually seen — only the latest state is. A complete transition history, if a story ever needs one, comes from the persisted stage-attempt records (`docs/data-model.md`), not this stream.

**A client must resync on every (re)connect, not only render pushed deltas.** An SSE stream has no backlog; a client that only fetches state once on load can go stale forever after a drop, with no visible symptom. This was a real gap found and fixed during `define-backend-stack`'s own E2E testing (`docs/adr/0001-backend-stack.md` § Evidence) — resync belongs in the reconnect handler (`onopen`, which fires on the first connect **and** every automatic browser reconnect), not only at mount.

**Heartbeat:** a periodic comment line on an otherwise idle stream keeps it from being mistaken for dead by an intermediary; proven to hold a connection open through a quiet stretch with zero reconnects.

**Manual verification of a held-open stream** (the mandatory curl step, adapted — a stream doesn't return, so the usual request/response pattern doesn't apply):
```bash
# Create the session and start the held-open capture in the SAME script —
# starting them as two separate commands risks missing the whole burst if
# the scenes complete faster than the gap between commands.
SID=$(curl -s -X POST http://127.0.0.1:3100/sessions -H "Content-Type: application/json" -d '{...}' | jq -r .session.sessionId)
curl -s -N --max-time 30 "http://127.0.0.1:3100/events?sessionId=$SID"
```

## Persistence

**Decided:** embedded SQLite via Node's built-in `node:sqlite` (`docs/adr/0002-persistence.md`) — this confirms the walking skeleton's stand-in as the real engine, on independently-scored merits, not by default. The data model it stores is documented in `docs/data-model.md`.

What's fixed, because it comes directly from the PRD and is proven against the real store (not assumed):

- **Append-only attempts, mutable read model.** `provider_requests` rows are never rewritten — each retry inserts a new row (Decision 1); `scenes.status`/`result` is a derived, idempotently-updatable read model on top of that history.
- **Write-ahead recording.** A provider request's external id, stage and send time are persisted **before** the request is sent (Decision 2) — the window between send and response is exactly what restart resumption depends on.
- **Idempotency is a store-level uniqueness constraint, not an application check.** A repeated success confirmation is rejected by a `PRIMARY KEY`/`UNIQUE` constraint on the commit table, never by a prior `if (alreadyDone) return` read — that check-then-act pattern is only safe by accident (e.g. a synchronous single-threaded driver) and is exactly what this project got wrong once and then fixed (`docs/adr/0002-persistence.md` Decision 3). Catch the driver's specific constraint-violation error (not every error) and treat only that as "already applied."
- **File references are relative, always.** Every artefact path is relative to the owning session's recorded project-folder root, never absolute (Decision 4) — project folders are user-facing and named for humans (PRD §12.2), so they get renamed. Renaming in place means updating the one recorded root column; every existing artefact reference keeps resolving with no further change.
- **Stored artefacts are read through the same project-folder guard as they are written, and scoped by `(session, scene)`.** (`show-scene-results-and-actions`, JOS-151, Decisions 1 and 2.) `GET /sessions/:sessionId/scenes/:sceneId/image` resolves the stored path with `resolveArtefactPath` (the write-side guard), so a path that escapes the session's project folder is refused, and looks the scene up with `getSceneForRun(sessionId, sceneId)`, so another session's address returns 404. It is read-only, serves only `.png`/`.jpg`/`.jpeg` (the content type comes from the extension), and answers 404 for every failure (no result, unknown extension, escaping path, missing file) without saying which. The session payload carries only the route's path (`result.imageUrl`), never the stored path. A new artefact route (for example the final-video or clip routes) follows the same three rules.
- **Every data-access method is scoped by session identifier, not by convention.** (`consult-session`, JOS-135, Decision 2.) A scene's `id` is only unique *within* its session, so a lookup that took just the scene id could silently return a different session's scene of the same id. Repository methods take the session identifier as a required argument (`getSceneForRun(runId, sceneId)`, not `getScene(sceneId)`), and a resolved file path is checked against the requesting session's own recorded project folder before use — a resolved path outside it is refused, not merely trusted (`assertWithinProjectFolder`). This is a functional-integrity guarantee (one project must never show or overwrite another's data, PRD §12.3), not an access-control layer — there are no accounts or permissions in this model.
- **The readiness queue is rebuilt at startup; only the pause marker is persisted** (Decision 5) — everything else is derivable, and a stale persisted queue after a crash is worse than a freshly rebuilt one.
- **Schema migrations are versioned from the first commit** (Decision 6): a small migration runner takes the target database handle explicitly (not a module-level singleton), so the exact same runner can be pointed at a fixture database in tests — this is what makes "an existing session survives a schema upgrade" a real, repeatable test rather than a claim.

- **What must never change is locked by store triggers, not by convention.** (`lock-script-and-narration`, JOS-137.) A session's `title`, `script` and `language` cannot be updated in any state, and a completed `voice_overs` record can be neither updated nor deleted; each is a `BEFORE UPDATE`/`BEFORE DELETE` trigger that aborts with a message naming what was touched, so a future caller that forgets the rule fails loudly. Chunk `idx`, `prompt`, `run_id`, the narration interval and the requested duration/warning are locked the same way. A new immutable field gets its own trigger in a **new migration** (an applied migration is never edited), with its definition kept in a named constant next to the others in `db.ts`. The full list is in `docs/data-model.md`, *Store-enforced locks*. The only code allowed to lift one is the test-only `resetAll()`, inside one transaction that recreates the trigger from the same constant.
- **An artefact that must never be replaced is written with `writeArtefactOnce`.** (`lock-script-and-narration`, JOS-137, Decision 3.) It writes to a temporary file beside the target and hard-links it to the final name; the link is atomic and fails when the target exists (`ArtefactAlreadyExistsError`), where `rename` would silently replace it and an `existsSync` check would be a read-then-write race. It keeps the same project-folder scoping as `writeArtefact`. Use it for the voice-over MP3; artefacts that a retry may legitimately overwrite keep using `writeArtefact`.
- **Every provider launch asks `admitLaunch` before sending and has no `await` between the second gate check and the in-flight mark.** (`pause-and-continue-session`, JOS-152, Design Decision 2; `backend/src/launchGate.ts`.) `admitLaunch(runId)` returns `{ admitted: true }` if the session exists and is not paused, or `{ admitted: false, reason }` otherwise. The gate is checked **twice** — once on entry (before reserving a concurrency slot) and once inside the slot callback immediately before `markSceneInFlight`, with no `await` between the second check and the mark. This ensures a pause landing between the two checks is still acted on. A launch that returns `{ admitted: false }` must not call `provider.send` or claim an attempt; the scene stays in `submitted` and is re-launched when the session is continued. Automatic and manual retries also ask `admitLaunch`; a retry that is held records the pending-retry state before it asks (so the scheduler's record exists and `continueSession` will find it). Each stage registers a launcher with `registerStageLauncher` (a `{ stage, heldWork, launch }` object) and removes itself from `NOT_YET_LAUNCHABLE`; `continueSession` calls every launcher's `launch` after clearing the pause marker.

- **The in-progress state of a retried phase is derived from an in-flight attempt newer than the recorded failure.** (`view-progress-by-phase`, JOS-168, Decision 5; `deriveSessionState` and `isRetryInFlight` in `orchestrator.ts`.) A session with no scenes and a recorded failure reads `voice-over-generating` or `chunk-decomposing` when the latest attempt of the failed phase's stage (`voice-over`, or `timestamps` for decomposition) is `in-flight` and was queued at or after the failure's `occurredAt`. The failure is not cleared to make this work (a retry that fails again must still carry its cause). Any new retry path must record its attempt before it launches, or the session will keep reading `failed` while it runs. `session.phases` is derived from the resulting state by `derivePhaseProgress`, never stored, and carries only a failure's `cause` and `retryable`.

- **Voice generation asks `canLaunchVoiceOver` before it launches.** (`lock-script-and-narration`, JOS-137, Decision 4; `backend/src/voiceLaunchGuard.ts`.) Every caller (the first launch and the automatic and manual retries) uses it. It decides from whether the session has a voice-over record, not from the derived session state, so a session that failed before producing valid audio can be retried while one that already has a narration cannot be regenerated.

**Test isolation:** tests that touch persisted state run against an **isolated** database path and an isolated project-folder root (`DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run`), never the same paths used for manual/E2E testing or real use. The test-reset helper wipes **both** the database rows and the real project-folder directory — a store that also writes real files needs its filesystem state reset alongside its rows, or a second test run collides with the first's leftovers (a real gap found and fixed while verifying this, `openspec/changes/define-persistence/reports/2026-09-25-step-7-unit-test-and-db-verification.md`).

## Testing Standards

Commands (run from `backend/`, or from `openspec/changes/define-backend-stack/skeleton/` while the skeleton is the active harness):

```bash
npx tsc --noEmit      # fully-typed check
npx vitest run        # unit tests
npm start             # start the server for manual/E2E testing
```

### Unit Testing

- Vitest, colocated `test/` directory. Prefer testing `RetryPolicy` and similar pure functions directly, with no mocking required — that is the point of keeping them pure (see Architecture).
- Tests that touch persisted state must run against an **isolated** database path (e.g. `DB_PATH=data/test.sqlite`), never the same file used for manual/E2E testing or real use — mixing them destroys evidence from one to satisfy the other, as documented in `openspec/changes/define-backend-stack/reports/2026-09-25-step-6-unit-test-and-state-verification.md`.
- Every test that exercises persisted state must reset it in `beforeEach`, not rely on execution order.
- Coverage target: exercise every branch of `RetryPolicy` and every idempotency guard explicitly (happy path, transient failure, not-retryable failure, duplicate delivery) — these are exactly the branches PRD §10 and §12.1 turn into acceptance criteria; a coverage percentage without covering these specific branches by name is not sufficient.

### Manual Endpoint Testing

Per `docs/openspec-tasks-mandatory-steps.md` (generalized here from "database" to "persisted state" — see `docs/adr/0001-backend-stack.md` Decision 1): start the server, exercise each endpoint with `curl`, verify status codes and response bodies, verify persisted state before/after, and restore it. Reports go under the active change's `reports/` folder. When killing/restarting the server as part of a restart-resumption test, identify the live process by the port it holds (`lsof -tiTCP:<port> -sTCP:LISTEN`), not by matching its command line with `pgrep` — the latter was found unreliable in this sandbox (`openspec/changes/define-backend-stack/reports/2026-09-25-step-7-curl-manual-testing.md`, Outcome).

### End-to-End Testing

Playwright MCP is the tool named by `docs/openspec-tasks-mandatory-steps.md`. If it is unavailable in a session, Claude in Chrome (or an equivalent agent-driven real-browser tool) is an acceptable substitute for the same intent — agent-executed, real-browser verification — and the substitution must be stated explicitly in the report, as it was in `openspec/changes/define-backend-stack/reports/2026-09-25-step-8-e2e-live-push.md`.

## Logging and Diagnostics

Structured JSON logging (Fastify's built-in Pino logger), one event per line, never string-interpolated messages that bury the data. Every log line about a provider call or a stage attempt carries enough correlation fields to reconstruct the record US-34 must display, without needing to query the store first:

- `sessionId`, `sceneId` (when the stage is per-scene), `stage`
- `stageInstanceKey` (per `bounded-retry-policy`'s Decision 1: `(sessionId, stage)` or `(sessionId, sceneId, stage)`)
- `cycle` and `sequenceInCycle` (which automatic-retry cycle, and which of the 1 + 3 attempts within it — `bounded-retry-policy` Decision 7)
- `trigger` (`initial` | `automatic` | `manual`), and `queuedMs` (time from the attempt being queued or scheduled to it being sent) next to `latencyMs`
- `providerRequestId` (the external request identifier, recorded before the request is sent)
- `outcome` (`success` | `failed_transient` | `failed_not_retryable`) once known

**Never log a provider credential or secret value**, even at debug level — this is a hard requirement of `backend-foundation`'s "Provider credentials outside source control" (`specs/backend-foundation/spec.md`), not just good practice. A missing required credential at startup must report *which* credential is missing without ever printing its value.

**Script text is never logged.** The script is the User's content and may be long or private, so neither the voice-over phase nor any adapter writes it, a prefix of it, or the provider's response body to a log line or to a failure cause. The voice-over phase logs only `scriptLength` and `scriptSha256` (a fingerprint that identifies a script without revealing it) beside `sessionId`, `stage`, `provider`, `attemptNumber`, `providerRequestId`, `outcome`, `latencyMs` and a `reason` written for a person (`VoiceOverLogEntry`, `setVoiceOverLogger`). The same rule holds for the failure cause the API returns. A new phase that sends the script to a provider follows it.

## Security and Configuration

- Provider credentials are read from the local environment or a local secrets file excluded from version control — never hardcoded, never committed (PRD §12.3, §11).
- Required environment variables are validated at startup, failing fast with a clear message naming the missing variable (never its value).
- No accounts, sessions, or authentication in the MVP (PRD §12.3) — this is a local, single-user install. Session/data isolation (a run cannot see or overwrite another run's data) is a **functional integrity requirement**, not a security control, per PRD §12.3 — do not conflate the two when reasoning about what "isolation" needs to guarantee.
- **Request body size ceiling**: PRD §4.1 imposes no product-side script length limit, but Fastify's own `bodyLimit` is the real, finite ceiling underneath that (`start-video-project`, JOS-134, Decision 6) — set to 50MB (`BODY_LIMIT_BYTES` env var, `server.ts`), far beyond any realistic script while still a named ceiling rather than "no limit at all." A request exceeding it gets Fastify's own `413`, structurally distinct from the `400`s this app's own Zod validation returns — never leave the framework default (1MB) in place, which would look identical to a product limit that does not exist.

## Development Workflow

- Feature branches, descriptive English commit messages, small focused changes — per `docs/base-standards.md`.
- `npx tsc --noEmit` and `npx vitest run` must both pass before any commit touching `backend/`.
- Every backend implementation story follows this document rather than choosing its own technology or layering (`backend-foundation` requirement, `specs/backend-foundation/spec.md`).

## Not Yet Decided

Tracked here so this document is never mistaken for settling more than it has:

- ~~Persistence engine and schema~~ — **decided**: embedded SQLite (`docs/adr/0002-persistence.md`). See [Persistence](#persistence).
- ~~Live-update transport~~ — **decided**: Server-Sent Events (`docs/adr/0003-live-updates.md`). See [Live Updates](#live-updates).
- **Frontend stack and its interop contract with this backend** — `define-frontend-stack` (US-42b, JOS-180).
- ~~Hardcoded values~~ (retry backoff base/cap, per-phase max execution times, concurrency caps, speed-factor limits) — **decided**: `backend/src/config/providers.ts` (`define-provider-configuration`, US-33, JOS-165, `docs/adr/0005-provider-selection.md`). The speed-factor limit (`2.0`) was fixed by `record-speed-adjustment-factor` (JOS-148) from `define-media-assembly` (JOS-182)'s measurement. **Still open**: assembly's per-phase max time, pending implementation of the assembly stage; voice/alignment/video's per-stage request caps, no real rate limit found yet for those three.
- ~~Whether the walking skeleton becomes `backend/`'s seed~~ — **decided**: yes, promoted (`start-video-project`, JOS-134). The five-stage model is implemented stage by stage, each in its own change (`generate-voice-over`, `decompose-script-into-chunks`, `generate-chunk-image`, `generate-chunk-video`, `assemble-final-video`); `harden-backend-foundation` (JOS-186) closed the two checks the spikes left open (concurrency accounting after a restart, write capacity at 300 scenes) and made this document match the real layout.

## Media Assembly Pipeline

The assembly design and measurements are recorded in [ADR 0005](adr/0005-media-assembly.md). The archived JOS-182 change contains the experimental reference script, fixture, and tests; it proves the pipeline choices but is not the production assembly implementation.

**Production implementation** (`assemble-final-video`, JOS-149): `backend/src/ffmpegAssemblyTool.ts` implements the `AssemblyTool` port (`backend/src/assemblyTool.ts`). The orchestrator calls `AssemblyTool.assemble(input)` from `runAssemblyAttempt` after the assembly gate fires. The contract for any implementation:

- **Clip ordering**: scenes sorted by ascending `index`; each clip's `cumulativeStartFrame` and `frameCount` come from persisted `narration_start_seconds` / `narration_end_seconds` (never recomputed from clip duration).
- **Audio replacement**: clip audio excluded at input (`-map 0:v:0`); voice-over muxed as the only audio track via stream copy (`-c:a copy`).
- **Output format**: H.264 video, AAC audio, hardcoded resolution/frame rate from `FINAL_OUTPUT` in `config/providers.ts`.
- **Retry policy**: `RETRY_BUDGET = 3` (4 attempts total); transient failures retry, not-retryable failures stop. `provider_id` is NULL in `stage_attempts` for assembly (no external provider). On success, `runs.final_video_path` is set and the session transitions to `final-video`.
- **Isolation**: assembly attempts never modify chunk records, voice-over records, or timestamps.

The production stage must preserve these measured constraints:

1. Retiming applies to video only; never alter the voice-over. Exclude each source clip's audio at input (`-map 0:v:0`) and mux the voice-over as the only audio stream using stream copy (`-c:a copy`) when its format is compatible. Re-encoding AAC was measured to shift reported duration through encoder priming.
2. Normalize each clip to the target resolution and frame rate before joining. Order clips by ascending scene identifier from interval data, not by filesystem listing.
3. Derive each clip's frame count from the cumulative target end: `round(cumulativeEndSeconds * fps) - previousRoundedEndFrame`. Independently rounding every clip's duration caused cumulative drift beyond tolerance on long sessions; cumulative accounting bounds drift at every join.
4. The measured speed-factor recommendation is 0.5×–2.0×. The slowdown bound is based on synthetic footage and should be revisited against real provider footage.

The archived reference pipeline and its automated `ffprobe` assertions can be run from the repository root:

```bash
cd openspec/changes/archive/2026-09-26-define-media-assembly
./test/assembly.test.sh
```

This requires `ffmpeg`, `ffprobe`, `python3`, and Bash. The test assembles the committed synthetic fixture and a generated 60-scene session, checking output stream properties and exact target frame counts.
