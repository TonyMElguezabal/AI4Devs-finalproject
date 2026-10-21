# Design — Prevent the final video while any scene is incomplete

## Context

Session state is derived, never stored. `deriveSessionState(scenes, failure, progress)` (`orchestrator.ts`) computes it on every read and broadcast, from the scenes, the session's recorded failure and a `progress` object of facts about earlier phases (`hasVoiceOver`, `timestampsStarted`). When a session has scenes, the current rule is:

```
anyProcessing = some scene in {submitted, image-generating, image-complete}  → chunks-processing
anyFailed                                                                     → failed, failedPhase "image"
otherwise                                                                     → final-video
```

This is the skeleton's single-stage rule, kept alive by JOS-145's narrow edit, which added `image-complete` to the processing set. The PRD v1.3 rules in §8.1 differ in three places (proposal "Why"). The session transition table (`sessionStateMachine.ts`) is closed by design: `chunks-processing` has no outgoing transitions yet, and "later phases … extend the table when they land".

No running code produces `chunk-complete` or `video-generating` yet (JOS-146 not implemented). Tests reach those states by setting statuses directly, as `scene-registration-session.test.ts` already does.

## Goals / Non-Goals

**Goals:**
- One gate predicate that US-16b's assembly launcher calls. It is the only definition of "may assemble".
- A derivation that follows §8.1's v1.3 rules for scenes, independent of which stage states exist.
- `failed` sessions that say which scenes failed, end to end, through to the session header.

**Non-Goals:**
- Launching assembly, its record, or an assembly failure (US-16b).
- Manual scene retry back to `chunks-processing` (US-26).
- Separate image and video downloads for a scene that failed at its clip (US-31).

## Decisions

**Decision 1 — The gate is a pure function returning the blocking scenes, not a boolean.**
`assemblyGate(scenes)` returns `{ open: true }` or `{ open: false, processingSceneIndexes, failedSceneIndexes }`. Both lists are ascending, and the result is closed for an empty scene list. US-16b gets one call that both decides and explains, for its logs and diagnostics.
*Alternative rejected:* `allScenesComplete(scenes): boolean`. Every caller that needs the reason would recompute the two lists, a second derivation of the same facts.

**Decision 2 — "Still generating" is defined as "not in a final scene state".**
`isSceneSettled(status) = status === "chunk-complete" || status === "failed"`. A scene is still generating otherwise. The derivation and the gate both use this one helper, so adding a stage state can never be forgotten in one of them. The current hand-written list already missed `video-generating`.
*Alternative rejected:* adding `video-generating` to the list. That fixes today's case and leaves the same trap for the next stage state.

**Decision 3 — All complete derives `final-video-generating`; `final-video` needs `progress.hasFinalVideo`.**
§5 step 8 makes assembly start automatically once every scene is complete, and §8.1 defines `final-video-generating` as "se está … ensamblando el MP4 final". `final-video` means "el MP4 final está terminado y disponible", which needs a file. `progress` gains `hasFinalVideo?: boolean`, defaulting to false, the same pattern as `hasVoiceOver`. `toSnapshot` passes `false` until US-16b adds its record and wires the real value. The final-video download already refuses anything but `final-video`, so it stays correctly closed with no edit.
*Alternative rejected:* keep `final-video` until US-16b. That leaves AC12 broken on the branch, and any `chunk-complete` JOS-146 produces first would immediately read as a finished video.
*Alternative rejected:* derive `chunks-processing` while all scenes are complete but assembly hasn't started. Assembly has no separate "queued" state in §8.1, and a session sitting in `chunks-processing` with nothing processing is the misleading reading §8.1's rules exist to prevent.
*Accepted consequence:* until US-16b lands, a session whose scenes all complete stays in `final-video-generating` with nothing assembling. That state is unreachable in running code until JOS-146 lands, and US-16b is the next story on this path.

**Decision 4 — Scene failures report `failedPhase: "scenes"` plus `failedSceneIndexes`.**
The existing phase values name session phases (`voice-over`, `decomposition`). "image" names a stage, and is wrong for a clip failure. `"scenes"` names the phase in which the session's scenes are generated (§8.1, "scene → `chunks-processing`"). Which stage each scene failed at is already per scene (`affectedStage`, JOS-146). `failedSceneIndexes` is derived, not stored, and appears only when `failedPhase` is `"scenes"`.
*Alternative rejected:* `failedPhase: "chunks-processing"`. That reuses a state name as a phase name and would read oddly in the header ("Failed phase: chunks-processing").

**Decision 5 — The transition table gains exactly the two transitions this gate decides.**
`chunks-processing → final-video-generating` and `chunks-processing → failed`. `final-video-generating`'s exits (to `final-video` or `failed`) are US-16b's and `failed → chunks-processing` is US-26's, each added when its own story lands, as the table's own comment requires.

## Risks / Trade-offs

- **A test asserts the old `final-video` shortcut** (`scene-registration-session.test.ts`). → It is updated to the new rule as part of this change, and the closed transition-table test gains the two pairs. Both edits are expected and listed in the tasks, not discovered.
- **`final-video-generating` with nothing assembling** once JOS-146 lands and before US-16b does. → Stated in Decision 3. The gate makes US-16b's launcher trivially correct, and the state is the PRD's own name for "assembly starts now".
- **Frontend reads `failedPhase` as free text.** → It only prints it, so a new value needs no frontend logic change. The header gains the scene list.

## Migration Plan

No schema change; everything is derived. Rollback is reverting the change.

## Open Questions

1. **Should the header list failed scenes by index or link to their rows?** This design shows the indexes ("Failed scenes: 2, 5"). Linking is a frontend refinement for US-19 (JOS-151, per-scene status view).
