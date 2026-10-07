# Design — Ignore repeated success confirmations

## Context

On `feature/entrega-2-JAME` (`5498360`), each stage's handling of a second success confirmation for the same generation:

| Stage | Where the success lands | Store guard | Repeat today |
|---|---|---|---|
| voice-over | `confirmVoiceOver` → `insertVoiceOver` | one `voice_overs` row per session | refused as `already-stored`; the attempt ends `success` or `superseded` (JOS-185) |
| timestamps | `storeTimestamps` | one `narration_timestamps` row per session | refused as `already-obtained`; division runs at most once (below) |
| decomposition | `registerDecomposition` | `scenes (run_id, idx)` unique, and a scene count check | refused as `already-registered`, no scene added |
| image | `completeImageStage` | `scene_results` primary key (`commitSceneResult`) | the result is refused, **but `markImageComplete` has already run**: status set back to `image-complete`, `result` and `current_request_id` overwritten. The clip launch is correctly gated on the commit |
| clip | `completeVideoStage` | `scene_video_results` primary key, and `writeArtefactOnce` on `scene-N.mp4` | refused; no state write, no assembly trigger |
| assembly | `runAssemblyAttempt` → `setFinalVideoPath` | **none** | `final_video_path` overwritten; and a second run can start while one is in flight, because `triggerAssemblyIfReady` and the launcher's `heldWork` check only the gate |

So the image stage changes scene state on a refused confirmation. A scene in `video-generating` would go back to `image-complete`: the clip poll then finds a state it does not expect and stops, and the scene counts as a pending clip for continue and for boot recovery, which sends a second clip request. The assembly stage has no uniqueness at all.

The `stub` image path (`handleProviderResult`) also ends in `completeImageStage`, behind its own `provider_requests.resolved` check.

## Goals / Non-Goals

**Goals:**
- A refused confirmation changes nothing: no result, no state, no launch (AC1, AC2).
- The final video is stored once per session, and assembly runs one attempt at a time (AC1, AC2).
- Each scene enters the assembly input once (AC3).
- One test per acceptance criterion, per stage where the criterion applies.

**Non-Goals:**
- Provider-side deduplication.
- Replacing an accepted result with a later one.
- Retrying a failed final assembly (JOS-159).

## Decisions

**Decision 1 — An image confirmation changes the scene only when the store accepts it.**
`completeImageStage` commits first and returns at once when `commitSceneResult` reports the result was already stored. `markImageComplete` and the clip launch both run only after an accepted commit. The store's primary key stays the only judge of which confirmation wins, as `persistence-foundation` requires. No read of the scene's state decides it.

*Alternative rejected:* a conditional `UPDATE ... WHERE status = 'image-generating'` in `markImageComplete`. It also guards, but it is a second rule beside the commit, and the two could disagree.

**Decision 2 — The final video is recorded by a set-once write.**
`setFinalVideoPath(runId, path)` becomes `UPDATE runs SET final_video_path = ? WHERE id = ? AND final_video_path IS NULL` and returns whether it recorded the path. An assembly success whose write is refused ends its attempt as `superseded`, the outcome JOS-185 introduced for a result discarded because another one was accepted. It does not broadcast a change. No migration is needed.

**Decision 3 — Assembly starts only with no final video and nothing in flight.**
`runAssemblyAttempt` refuses before recording an attempt when the session has a `final_video_path` or an `assembly` attempt in flight. There is no `await` between this check and `recordStageAttempt`, so two launches in the same process cannot both pass it. The launcher's `heldWork` adds the same condition, so the held count, continue and boot (JOS-160's `pendingAtBoot`) agree.

*Alternative considered:* a partial unique index on `stage_attempts` allowing one `in-flight` assembly attempt per session. It is store-enforced, but it needs a migration and error handling in the shared `recordStageAttempt`. Decision 2 already makes the stored result unique at the store, which is what AC1 requires. The launch check only stops wasted work, and it is atomic within the single process.

**Decision 4 — The tests drive each stage's own completion path twice.**
Every stage gets a test that confirms success twice and asserts one result, one next-stage launch and unchanged state:

- voice-over, timestamps, decomposition and clip already hold; their tests pin it, reusing existing ones where they already prove it;
- image and assembly start failing.

`completeImageStage` gets a test-only export, like the other `reset*` and `set*` seams, because no public path can deliver two successes for one real image attempt. AC3 is tested through the assembly tool's captured input after a clip was confirmed twice.

## Risks / Trade-offs

- **[A refused assembly success has already rewritten `final-video.mp4`]** → The tool writes the file in place before the path is recorded. Decision 3 keeps two assemblies from running at once, so this can only happen if a future caller bypasses the guard. Writing to a temporary name and renaming on an accepted record would close it, and is left for when assembly writes become concurrent.
- **[JOS-159 changes how an assembly retry starts]** → Its manual retry must also respect "no final video, nothing in flight". The coordination note tells it.
- **[The test-only export widens the module surface]** → It is named and documented as a test seam, the same as the existing ones.

## Migration Plan

No migration. Sessions that already have a final video keep it. Rolling back restores the unconditional writes.

## Open Questions

None.
