# Design — Generate a chunk's image

## Context

Every chunk from `decompose-script-into-chunks` carries an `IMAGE` instruction and starts in `submitted`. This story is the first per-chunk provider call, and the first place the PRD lets a single scene fail and recover independently of the rest of the session (§10.2) — unlike the session-level stages (voice, timestamps, decomposition, assembly), where one failure affects the whole session's progress. It is also where the PRD's single visual-correction exception lives (§10.3, AC09): the only field a User can ever edit on an otherwise-locked chunk is `IMAGE`, and only while the image stage is `failed`.

`generate-voice-over` already established the pattern this story follows at chunk scope: a provider port, a stubbed adapter for tests, a phase-launch gate shared with the retry and concurrency mechanisms, and a `StageExecution`-shaped diagnostic record. This design's job is mostly to confirm that pattern transfers to a chunk-scoped, independently-failing stage instance without inventing a second mechanism for the same concerns.

## Goals / Non-Goals

**Goals:**
- Specify the image stage instance's lifecycle (`submitted → image-generating → image-complete | failed`) and its precondition on `generate-chunk-video`.
- Specify the temporary-link persistence rule precisely enough to test: the record is never a link, always a locally stored file, by the time the stage reports success.
- Specify the one correction path (§10.3) as a state-derived capability, not a stored flag — the form exists because the stage is `failed`, not because of a separate "editable" bit.
- Confirm that per-chunk failure isolation requires no new mechanism beyond what `stage-retry-policy` already scopes per stage instance.

**Non-Goals:**
- Video generation, assembly, or the phase-launch gate's own concurrency/pause mechanics — each already specified or owned elsewhere.
- Choosing the image provider — `define-provider-configuration`'s decision.
- Any UI layout for the correction form — `define-frontend-stack`'s concern once it lands.

## Decisions

**Decision 1 — The image stage instance is keyed by (session, chunk, stage), exactly as `stage-retry-policy` already defines for per-scene stages.**
No new keying scheme is introduced; this story is the first to actually populate that key with `stage = image`.
*Alternative rejected:* a chunk-level "current stage" pointer instead of per-stage instances. It would make the video stage's own independent retry budget (owned by `generate-chunk-video`) harder to keep separate from the image stage's, reintroducing exactly the coupling `stage-retry-policy`'s design already avoided for session-level stages.

**Decision 2 — The provider's temporary link is resolved to a local file inside the same operation that marks the stage successful, never after.**
If the download fails, the stage instance is not marked `image-complete` — a failed download is a failed attempt, subject to the same retry budget as a failed generation call.
*Alternative rejected:* marking the stage complete on the provider's response and downloading asynchronously afterward. It creates a window where `image-complete` is true but no image exists locally, which `generate-chunk-video`'s precondition check (§7.1, AC05) would then have to re-verify rather than trust.

**Decision 3 — The `IMAGE` correction endpoint is a variant of the stage's manual retry, not a separate edit operation.**
Correcting `IMAGE` and retrying with the same instruction differ only in whether the stored instruction changes before the retry fires; both go through `stage-retry-policy`'s manual-retry mechanism (new cycle, budget reset) unmodified.
*Alternative rejected:* a generic `PATCH chunk` endpoint gated by a server-side check of which fields are mutable. §10.3's rule ("only while the image stage is `failed`, only `IMAGE`") is narrow enough that a dedicated action expresses it directly; a generic field-level mutability check invites the exact drift `define-frontend-stack`'s Decision 4 already rejected for the frontend side of this same rule.

## Risks / Trade-offs

- **A large image blocks the request thread during download** → Left to the stack decision (streaming vs. buffering); this design only requires that the stage isn't marked complete until the file is durably stored, not how the download is implemented.
- **A chunk stuck failing here silently stalls only itself, not the session** → This is the intended behaviour (§10.2), not a defect, but it means the session-level progress view must surface which specific chunks are failed rather than a single session-wide failure — `consult-session`'s existing per-scene rendering already covers this.
- **Coupling with the stack spikes** → Same acceptance as every sibling story.

## Migration Plan

Nothing is deployed and no per-chunk provider code exists yet. This change adds the `chunk-image-generation` capability and, once implemented, the first `Chunk.image_result_path` values and `image`-named `StageExecution` rows. Rollback before implementation is deleting the change directory.

## Open Questions

1. **Does the image provider return a native content type/size the record should keep alongside the path?** Left to `define-provider-configuration`'s adapter work; this design does not add fields beyond `image_result_path` without evidence they are needed.
