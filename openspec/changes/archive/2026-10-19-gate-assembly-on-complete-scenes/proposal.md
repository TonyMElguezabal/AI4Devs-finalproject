# Prevent the final video while any scene is incomplete

Linear-Issue: JOS-150 (US-17)

## Why

The session state is derived from its scenes (`deriveSessionState`, `orchestrator.ts`), and the scene rules there still come from the skeleton. Three of them contradict PRD §8.1's v1.3 state rules and §7.3:

- **Every scene `chunk-complete` derives `final-video`.** No assembly has run and no MP4 exists, which breaks AC12 ("`final-video` solo se alcanza con todas las escenas completas y un MP4 … descargable"). The download route trusts that state.
- **The "still generating" set lists `submitted`, `image-generating` and `image-complete` but not `video-generating`.** Once JOS-146 adds the video stage, a session with one scene failed and another generating its clip would derive `failed` too early (AC10, §8.1 first rule).
- **A scene failure always reports `failedPhase: "image"`**, even for a clip failure, and never says which scenes failed, which §8.1 requires ("muestra qué escenas fallaron").

Assembly itself (US-16) is not built yet, so this is the moment to fix the gate it will rely on, before anything reaches `final-video` falsely.

## What Changes

- **One gate for assembly**: a pure `assemblyGate(scenes)` that opens only when there is at least one scene and every scene is `chunk-complete`. Otherwise it returns closed, with the indexes of the scenes still processing and of the failed ones. This is the single check US-16b's assembly launcher must pass (AC1, AC2). The session transition table gains `chunks-processing → final-video-generating` and `chunks-processing → failed`, the transitions this gate decides.
- **Still generating means not finished**: a scene counts as still generating unless it is `chunk-complete` or `failed`. Not finished is the complement of the two final states, not a hand-written list, so `video-generating` and any later stage state are covered without an edit (AC4, AC5).
- **All complete is not final**: when every scene is `chunk-complete`, the session derives `final-video-generating` (assembly starts automatically, §5 step 8). It derives `final-video` only when a final video exists. That is a new `hasFinalVideo` input to the derivation, defaulting to false, which US-16b sets from its record (AC12). Until US-16b lands, nothing derives `final-video`, and the final-video download stays refused, which is correct.
- **A failed session names its scenes**: when no scene is still generating and at least one has `failed`, the session derives `failed` with `failedPhase: "scenes"`. The session read gains `failedSceneIndexes`, ascending and read-only. The frontend header shows them beside the failed phase (AC5).
- **Results survive a failure**: no result, stored file or chunk-complete download is withdrawn because a sibling scene or the session failed. Tests pin this down (AC3).

## Capabilities

### New Capabilities

- `scene-completion-gate`: when a session may move from scene processing to assembly. Covers the all-complete gate, the session state while scenes fail or are still generating, identifying failed scenes, and keeping successful results available.

### Modified Capabilities

(none). `openspec/specs/` has no capability that specifies session state derivation for scenes; that skeleton behaviour is replaced here and specified for the first time.

## Impact

- **Backend**: `orchestrator.ts` (`deriveSessionState`, `toSnapshot`), a new pure `assemblyGate.ts`, `sessionStateMachine.ts` (two transitions), `types.ts` and `routes.ts` (`failedSceneIndexes` on the session payload and schema). No migration: everything stays derived, as the project's session state already is.
- **Frontend**: `types.ts` and `SessionHeader.tsx` show the failed scene indexes.
- **Behaviour change on purpose**: a session whose scenes are all `chunk-complete` now reads `final-video-generating` instead of `final-video`. No running code produces `chunk-complete` yet (JOS-146 is not implemented), so only one test sees the difference. `scene-registration-session.test.ts` asserts the old shortcut, and it is updated to the new rule.
- **Depends on**: nothing unmerged. Scene states, `SessionState` and the derived-state pattern are all on `feature/entrega-2-JAME`. JOS-146 is listed as a dependency in Linear, but the gate is written against the scene states, not against the video stage's code. It is tested by setting statuses directly, as `scene-registration-session.test.ts` already does.
- **Out of scope**:
  - launching assembly, the final video record and `hasFinalVideo`'s source (US-16b);
  - an assembly failure's `failedPhase: "assembly"` (US-16b);
  - manual scene retry returning a session to `chunks-processing` (US-26);
  - downloading a failed-at-video scene's image on its own (US-31, JOS-163). Today's per-scene download serves both kinds only at `chunk-complete`, by its own documented simplification.
