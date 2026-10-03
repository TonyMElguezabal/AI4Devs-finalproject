# Request the admitted clip duration closest to the narrated interval

Linear-Issue: JOS-147 (US-14)

## Why

Every chunk now carries its narration interval (JOS-143), but nothing turns that interval into the duration the clip is requested at. The video provider only admits whole seconds from 5 to 15 (PRD §11.3), so the requested duration has to be chosen from that set. The choice matters: it fixes how much each clip is later sped up or slowed down (§7.2), and a wrong reading of "closest" (fewest seconds instead of smallest speed change) produces visibly worse clips. A sentence that cannot be split (§6.1.1) has an interval longer than the maximum; its clip must be requested at the maximum with a warning, not fail.

The selection rule itself already exists: `closestAdmittedDuration` (`backend/src/admittedDurations.ts`, JOS-140) implements "smallest speed change, an exact tie goes to the longer duration", and segmentation already uses it to score groupings. This story applies it to each chunk's interval, stores the result with the chunk, and records the over-maximum warning.

## What Changes

- **AC1 — Closest by speed change:** each registered chunk's requested duration is the admitted duration needing the smallest speed change to match its interval's duration, even when shorter than the interval; an exact tie goes to the longer duration.
- **AC2 — Below the minimum:** an interval shorter than the smallest admitted duration requests the smallest admitted duration.
- **AC3 — Never above the maximum:** no requested duration exceeds the provider's maximum.
- **AC4 — Over the maximum:** an interval longer than the maximum (an unsplittable sentence) requests the maximum, and the chunk records the warning `exceeds-maximum`. It is not a failure.
- **AC5 — Stable across builds:** the requested duration and its warning are decided once, at registration, and stored with the chunk in the same transaction as its interval. Store-level locks refuse any later change, so a build with different admitted durations never alters an established chunk's request.
- The session read and scene events expose `requestedDurationSeconds` and, when set, `durationWarning`, read-only.

## Out of Scope (owned by other tickets)

- Sending the clip request: **JOS-146 (US-13)**, which reads the stored requested duration instead of choosing one.
- The applied speed factor (measured clip duration ÷ interval duration), the factor-limit warning and showing both in the scene details: **JOS-148 (US-15)** and **JOS-149 (US-16)**. `SPEED_FACTOR_LIMIT` is still undetermined.
- Changing the admitted durations or the segmentation bounds: JOS-165 decisions.

## Capabilities

### New Capabilities

- `clip-duration-request`: choosing each chunk's requested clip duration from the provider's admitted set, storing it with the chunk, recording the over-maximum warning, and keeping both unchanged afterwards.

### Modified Capabilities

None. `narration-intervals` (JOS-143) is not archived yet and is consumed as it is.

## Impact

- **Depends on** JOS-143 (US-10) for the stored narration interval. This branch is stacked on `feature/jos-143-assign-narration-intervals`, which is itself stacked on JOS-142, and must be rebased onto `feature/entrega-2-JAME` once both merge. JOS-165 (US-33, done) supplies the admitted durations.
- **Backend:** `admittedDurations.ts` gains `requestedClipDuration(interval)`; `closestAdmittedDuration` takes the admitted set as an optional argument, defaulting to the recorded one. Registration computes both values per chunk and `insertRegisteredScenes` writes them.
- **Data model:** migration 10 adds `scenes.requested_duration_seconds` and `scenes.duration_warning` (both nullable, for skeleton scenes) and one lock trigger per column. `docs/data-model.md` is updated. JOS-146's design planned migration 10 for itself; it takes the next free number at its gate.
- **API:** two optional read-only fields on the scene response; no request schema changes. `docs/api-spec.yml` is regenerated.
- **Downstream:** JOS-146's design (Decision 4) changes from "call JOS-147's function" to "read the stored value"; JOS-148 records the speed factor against a stored request.
