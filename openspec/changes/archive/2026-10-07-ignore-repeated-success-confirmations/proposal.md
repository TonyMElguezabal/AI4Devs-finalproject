# Ignore repeated success confirmations

Linear-Issue: JOS-161 (US-29)

## Why

§12.1 and AC14 require that a repeated success confirmation for the same generation never duplicates a result, a launch or a scene. `persistence-foundation` already states this as a store-enforced requirement, and most stages meet it. Checked on `feature/entrega-2-JAME` (`5498360`), two places do not:

- **Image**: `completeImageStage` writes the scene's state (`image-complete`, its `result`) before it looks at whether the store accepted the commit. A duplicate success can move a scene that has gone on to its clip back to `image-complete`, which abandons the clip in flight and makes the clip count as pending again.
- **Final assembly**: the final video path is overwritten on every success, and nothing stops a second assembly from starting while one is running (for example a pause and continue during assembly), so two successes can be stored for one session.

## What Changes

- **Image**: a success confirmation changes the scene only when the store accepts its result. A duplicate stores nothing, changes no state and launches nothing.
- **Final assembly**:
  - the final video is recorded once, by the store: a later success for the same session is refused, not overwritten;
  - an assembly launch is refused while the session already has a final video or an assembly attempt in flight.
- **Pinning tests for every stage** (voice-over, timestamps, decomposition, image, clip, assembly), one per acceptance criterion: a repeated confirmation stores no second result, does not launch the next stage again, and adds no scene to the assembly twice. Most of these already hold; the tests prove it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `persistence-foundation`: the requirement "Repeated confirmations rejected by the store" gains scenarios that make explicit that a refused confirmation changes no scene state, and that the final video and the assembly launch are covered too.

## Impact

- **Backend**:
  - `orchestrator.ts`: `completeImageStage` returns before any state write when the commit is refused; `runAssemblyAttempt` refuses to start with a final video or an attempt in flight, and stores the final video through a set-once write.
  - `db.ts`: `setFinalVideoPath` becomes a conditional update that reports whether it recorded the path. No migration.
- **Frontend**: no change.
- **API contract**: no change. No route or schema changes; `docs/api-spec.yml` is confirmed unchanged.
- **Depends on**: nothing unmerged. US-03 (JOS-136), US-12 (JOS-145) and US-13 (JOS-146) are merged.
- **Coordination**: `retry-final-assembly` (JOS-159) also changes how assembly attempts start. Its manual retry must start a new attempt only when no final video exists and nothing is in flight, which matches this change's guard.
- **Out of scope**: provider-side deduplication; deciding whether a late clip result (JOS-185) may replace an accepted one, which is already refused by the store.
