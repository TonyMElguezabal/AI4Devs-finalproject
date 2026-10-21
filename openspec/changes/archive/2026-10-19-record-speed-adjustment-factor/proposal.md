# Record requested duration and speed-adjustment factor per scene

Linear-Issue: JOS-148 (US-15)

## Why

`request-admitted-clip-duration` (JOS-147) already picks, for each chunk, the admitted duration needing the smallest speed change to match its narrated interval — but it stores only the chosen duration and an over-maximum warning, never the ratio itself. Nothing today tells the User how much a scene's clip had to be sped up or slowed down, and nothing flags a scene whose adjustment is severe enough that the result will look wrong (§7.2, AC23). Both values the ratio needs — the requested duration and the narrated interval — are already final and locked on the chunk; the ratio just has nowhere to live yet.

## What Changes

- Compute each chunk's speed-adjustment factor as `max(requestedDurationSeconds / narratedDurationSeconds, narratedDurationSeconds / requestedDurationSeconds)` from the two values already stored on the chunk (`requested_duration_seconds` from JOS-147, `narration_start_seconds`/`narration_end_seconds` from JOS-143) — never from an actual returned clip's measured length, and never a value chosen independently of those two (§7.2: "no es un parámetro independiente").
- Store the factor (`speed_factor`) in the same registration transaction that already writes `requested_duration_seconds`/`duration_warning`, and **lock it** the same way (an established chunk's factor never changes, no request schema accepts it).
- Record a new, separate warning (`speed_factor_warning`) when the factor exceeds the hardcoded acceptable limit (`SPEED_FACTOR_LIMIT`, `define-provider-configuration`/JOS-165) — a diagnosable warning, never a chunk or session failure, and never conflated with JOS-147's `exceeds-maximum` duration warning (a chunk can carry one, the other, both, or neither).
- Expose `requestedDurationSeconds`, `speedFactor`, and, when recorded, `speedFactorWarning`, read-only, on the same session/scene representation JOS-147 already extended (`consult-session`) — no new endpoint. A scene without a stored request (the pre-decomposition skeleton path) continues to omit all of them.
- Show the requested duration, speed factor, and any warning in the scene-details panel the frontend skeleton already renders per scene (`SceneRow.tsx`'s `scene-details` list, expanded via "View scene details"). That component's own existing comment names this exact gap ("PRD §3/§7.2/AC23 also calls for ... requested duration and speed factor in scene details; those come from stories this skeleton does not model (US-15 ...)") — this story is what removes it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-duration-request`: new requirements for computing the speed-adjustment factor from the chunk's own stored requested duration and narrated interval, storing and locking it, recording a `speed_factor_warning` against the hardcoded acceptable limit, exposing all three on the session/scene read, and showing them in the scene-details panel.

## Impact

- **Depends on `request-admitted-clip-duration` (JOS-147, merged)** for `requested_duration_seconds`/`narration_start_seconds`/`narration_end_seconds` already being stored and locked per chunk.
- **Depends on `define-provider-configuration` (JOS-165)** for `SPEED_FACTOR_LIMIT`. That constant is currently `"undetermined"` in `backend/src/config/providers.ts` on this branch; the real value (0.5x-2.0x) exists only on the unmerged `define-media-assembly` (JOS-182) pull request. Implementation must gate on that value landing, or record it as an explicit blocker, before group 3 (the warning comparison) — the same provisional-constant pattern `generate-chunk-video`'s own gate already follows.
- **Data model**: migration 11 adds `scenes.speed_factor` (`REAL`) and `scenes.speed_factor_warning` (`TEXT`), each locked by its own trigger, mirroring migration 10's pattern for `requested_duration_seconds`/`duration_warning`.
- **Backend**: `registerDecomposition`/`insertRegisteredScenes` compute and persist the factor and its warning alongside the existing requested-duration write; the session/scene read model consumed by `consult-session` gains the three fields.
- **No dependency on `generate-chunk-video` (JOS-146) or actual clip generation**: both inputs to the factor are final at registration time, before any video request is ever sent, so this story's persistence work can land independently of JOS-146's progress.
- **Frontend**: `frontend/src/types.ts`'s hand-written `SceneEventPayload` gains `requestedDurationSeconds`, `durationWarning`, `speedFactor` and `speedFactorWarning` (the first two already sent by the backend since JOS-147 but never typed or rendered on the frontend); `SceneRow.tsx`'s `scene-details` list renders them and removes the deferral comment.
- **`US-19` (JOS-151, not started)**: Linear lists it as a dependency for the broader "view per-scene status and results" story, but the scene-details panel this story extends already exists in the skeleton (provider/attempts are already rendered there). This story does not wait on JOS-151 to add its three fields to that existing panel.
- **Docs**: `docs/data-model.md` and `docs/api-spec.yml` are updated to match.
