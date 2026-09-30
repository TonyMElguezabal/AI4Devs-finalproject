# Design — Generate the image of each scene (JOS-145)

## Context

The backend skeleton already has a per-scene pipeline. `orchestrator.ts`'s `launchScene` takes a slot from `concurrency.ts`, respects the session pause, records an append-only `provider_requests` row, and sends the request to a deterministic stub (`provider.ts`). On success the scene jumps straight to `chunk-complete`. The `scenes` table already has `status`, `attempts`, `result` (a relative path under the session's `project_folder`) and `provider`. `scene_results` makes a repeated success confirmation harmless.

JOS-145 turns this generic stand-in into the real **image** stage:

- it calls the provider recorded in PRD §11.3 (Fal.ai `fal-ai/flux/dev`, request size 1920×1088);
- it checks the output against §7.1;
- it ends in `image-complete` rather than `chunk-complete`;
- it binds the provider to the chunk's image stage (§11.2).

Retries, the time limit and concurrency belong to sibling tickets (JOS-184/154, JOS-185, JOS-167). This story calls their mechanisms and does not redefine them.

## Goals / Non-Goals

**Goals:**
- A `submitted → image-generating → image-complete | failed` lifecycle per chunk, launched automatically (AC1, AC2).
- An output check that the recorded provider can actually pass (AC2).
- Chunks that progress independently of each other, on success as well as on failure (AC3).
- A stored provider binding that later retries honour (AC4).
- Image results that never depend on an expiring link (§12.2).

**Non-Goals:**
- The correction path (JOS-157), individual downloads (JOS-163), showing diagnostics (JOS-166), the clip precondition (JOS-146).
- Changing the recorded provider or its request size (a JOS-165 decision).
- Any frontend change. The session page already renders per-scene status from the snapshot, and `image-complete` is already a member of the `SceneState` union.

## Decisions

**Decision 1 — The output check uses dimensions with a ±1% aspect tolerance, measured from the stored file.**
The image is accepted when `width ≥ 1920`, `height ≥ 1080`, and `|w/h − 16/9| / (16/9) ≤ 0.01`. The dimensions are read from the downloaded file's own header (PNG/JPEG), not from the provider's response metadata, so the check validates what is actually stored.
- 1920×1088 → 0.74% off → accepted.
- A portrait or under-size image → rejected. A rejection counts as a failed attempt, retryable like a transient error, since a new generation may succeed.
*Alternatives rejected:*
- An exact 16:9 check would reject every image the recorded 1920×1088 setting produces.
- Requesting 2560×1440 would change a verified JOS-165 value and cost more.
- Cropping to 1920×1080 adds an image-processing step that assembly already does when it normalises to 1920×1080 (PRD §11.3).

**Decision 2 — A temporary link is resolved to a local file in the same step that marks success.**
The adapter returns either the image bytes or a temporary URL. The orchestrator writes the file under `project_folder`, runs the Decision 1 check on it, and only then commits `scene_results` and moves the chunk to `image-complete`. A failed download or write counts as a failed attempt.
*Alternative rejected:* marking the stage complete first and downloading afterwards. That leaves a window where `image-complete` is true but no file exists, and JOS-146 would then have to re-verify the file instead of trusting the state.

**Decision 3 — The provider binding is the scene's `provider` column, written once on the first attempt.**
Before the first request of a chunk's image stage is sent, `scenes.provider` is set to the current image provider's identifier (for example `fal-ai/flux/dev`), and only if it is still unbound. Every later attempt resolves its adapter from the stored value, not from the current hardcoded configuration. If the stored identifier has no adapter in the running build, the attempt fails with a not-retryable cause and no silent switch happens (§11.2: there is no provider change in the MVP).
*Alternative rejected:* storing the provider only on each `provider_requests` row. That records what happened but does not bind anything: a retry would still read the current configuration.
*Implementation detail confirmed 2026-09-30:* `scenes.provider` is `NOT NULL DEFAULT 'stub-image-provider'` (`STUB_PROVIDER_NAME`), not nullable, and `insertRegisteredScenes` (JOS-144) omits it so every registered chunk starts at that default. Per the Migration Plan below, no migration changes this column. "Still unbound" therefore means the column still equals `STUB_PROVIDER_NAME`; the first attempt overwrites it with the real provider identifier, and nothing else ever writes `stub-image-provider` back once bound.

**Decision 3a — The image request reads `imageInstruction`; the generic `instruction` field and its correction route are untouched.**
`launchScene`'s provider request carries `scene.imageInstruction`, not `scene.instruction`. JOS-144 left `instruction` in place (registration sets it equal to `imageInstruction` at creation, per JOS-144 Decision 3) because the skeleton's `correctAndRetry` (§10.3) still reads and writes only `instruction`, and correcting a failed image instruction is JOS-157's scope (explicitly out of scope for this story). Reading `imageInstruction` for generation is what makes the two fields able to diverge in a way that matters (a correction updates `instruction` but not `imageInstruction`), which is exactly the JOS-144 finding this story exists to act on for generation — but retiring or deleting `instruction` itself is left to JOS-157, which owns replacing `correctAndRetry`'s target field with `imageInstruction`.
*Alternative rejected:* deleting `instruction` and `correctAndRetry`'s use of it now. That would break the existing (skeleton) correction route with no replacement, since JOS-157 has not implemented image-instruction correction yet.

**Decision 4 — `image-complete` is the last state a chunk reaches until JOS-146 lands.**
The skeleton's `image-generating → chunk-complete` shortcut is removed. The derived session state treats `image-complete` as "still processing": the session never derives to `final-video` from image-complete chunks. JOS-146 will add `image-complete → video-generating`.
*Alternative rejected:* keeping the shortcut until JOS-146 exists. That would break AC2, which requires `image-complete`.

**Decision 5 — Independent progression comes from the existing per-scene scheduling, and is proven by a test rather than new code.**
Each scene already has its own request, its own delivery callback and its own state transition. No session-wide barrier exists between image results. This story adds tests showing a finished scene advances while a sibling is still `image-generating` (AC3). It also adds a check that the new code introduces no such barrier.

## Risks / Trade-offs

- **JOS-144 has not landed yet**, so the skeleton's `instruction` field conflates `PROMPT`/`IMAGE`/`VIDEO`. → The task gate stops if a distinct `IMAGE` instruction is not available, rather than building against the conflated field.
- **The concurrency cap of 200 is provisional** (PRD §11.3). → It is used as recorded. JOS-167 owns refining it.
- **No distinguishable not-retryable signal was found for Fal.ai** (ADR 0005, Decision 5). → Content rejections are classified as transient until JOS-165's open finding is resolved. The adapter's classification sits in one place so it can be changed without touching the orchestrator.
- **Real provider calls cost money.** → Automated tests use the stub adapter only. At most one real call is made during manual verification, and it is recorded in the report.
- **`deriveSessionState` is shared with JOS-136.** `generate-voice-over` task 5.15 also extends `deriveSessionState` (voice-over states derived from records, its Decision 12), and this story changes how `image-complete` chunks count. Whichever lands second merges the other's precedence rules and re-runs both suites; neither adds a stored state column.

## Migration Plan

- No schema migration is needed: `scenes.provider` and `scenes.result` already exist.
- Existing skeleton rows in `chunk-complete` stay as they are. Sessions never expire, and no data is rewritten.
- Rollback: revert the code. The data stays readable because no columns change.

## Open Questions

None blocking. The aspect tolerance was confirmed by the product owner on 2026-09-27.
