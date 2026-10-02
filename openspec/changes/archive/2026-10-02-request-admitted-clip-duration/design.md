# Design — Request the admitted clip duration closest to the narrated interval (JOS-147)

## Context

What exists on `feature/jos-143-assign-narration-intervals` (the base of this branch):

- **The rule.** `closestAdmittedDuration(narratedSeconds)` in `backend/src/admittedDurations.ts` (JOS-140) loops over `VIDEO_ADMITTED_DURATIONS_SECONDS` (whole seconds 5-15, `config/providers.ts`) and returns `{ admitted, speedRatio }` with `speedRatio = max(admitted / narrated, narrated / admitted)`. A tie within `1e-12` goes to the later, longer entry. Segmentation uses it to score groupings. Because the set is bounded, anything below 5 s returns 5 and anything above 15 s returns 15, so AC1-AC3 already hold for the function.
- **The interval.** `SegmentedFragment.narrationInterval` and `intervalDurationSeconds(interval)` (`sceneRegistration.ts`, JOS-143). Registration checks the fragments and the partition, gets the instructions, and writes every chunk in one `INSERT` per chunk inside one transaction (`insertRegisteredScenes`, `db.ts`), including the interval columns added by migration 9 and locked by their own triggers (`SCENE_INTERVAL_LOCK_TRIGGERS_DDL`).
- **The unsplittable flag.** Segmentation marks a fragment `exception: "unsplittable-sentence"`, and registration accepts a fragment over 15 s only with that flag. The flag is not stored on the chunk.
- **Exposure.** `sceneToPayload` (`orchestrator.ts`) and the Zod scene schema (`routes.ts`) already carry the optional read-only `narrationInterval`.
- **Downstream design.** JOS-146's design (Decision 4) assumed it would call a JOS-147 function at send time; JOS-148 records the applied factor; `SPEED_FACTOR_LIMIT` is `"undetermined"`.

Decided with the product owner on 2026-09-30: the requested duration is decided at registration and stored, not computed at send time.

## Goals / Non-Goals

**Goals:**
- Every registered chunk carries its requested duration, chosen by the one existing rule from its stored interval (AC1-AC3).
- An interval over the maximum records `exceeds-maximum`, never a failure (AC4).
- Neither value can change after registration, whatever later builds admit (AC5).

**Non-Goals:**
- Sending the clip (JOS-146), the applied speed factor and its limit warning (JOS-148, JOS-149), showing any of it in the scene details (JOS-148), frontend changes, backfilling old chunks.

## Decisions

**Decision 1 — A thin `requestedClipDuration(interval)` over the existing rule.**
`admittedDurations.ts` gains `requestedClipDuration(interval, admitted = VIDEO_ADMITTED_DURATIONS_SECONDS)` returning `{ seconds, warning: "exceeds-maximum" | null }`. It calls `closestAdmittedDuration(intervalDurationSeconds(interval), admitted)` for `seconds`, and sets the warning when the narrated duration is strictly greater than the largest admitted duration. `closestAdmittedDuration` takes the admitted list as an optional second argument, defaulting to the recorded one, so segmentation's calls are unchanged and AC5 can be tested against a different set.
*Why derive the warning from the interval, not the fragment's `unsplittable-sentence` flag:* registration already refuses an over-15 s fragment without that flag, so the two are equivalent for every registered chunk, and the interval is what is stored. Using it keeps one source of truth and needs no new column for the flag.
*Why the warning is "exceeds maximum", not "speed factor above limit":* §6.1.1 asks for a warning whenever an unsplittable sentence is slowed to fit, regardless of any limit, and `SPEED_FACTOR_LIMIT` is still undetermined. The limit-based warning is JOS-148's, recorded against the clip actually returned.
*Not taken:* a second implementation of the rule here. `closestAdmittedDuration` is already tested against the §7.2 "not fewest seconds" trap and the tie; a copy could drift.

**Decision 2 — Decided at registration, stored with the chunk, in the same `INSERT`.**
`registerDecomposition` computes `requestedClipDuration(fragment.narrationInterval)` for each fragment after the partition check (JOS-143 Decision 2), and `insertRegisteredScenes` writes `requested_duration_seconds` and `duration_warning` in the existing single `INSERT`, inside the existing transaction. The computation cannot fail: the interval is already checked finite and positive. So the all-or-nothing guarantee (JOS-144 Decision 5) covers these values too.
*Why at registration and not at send time:* AC5 then holds for the request itself, not only for the interval — a build with a different admitted set never changes what an established chunk asks for, even if its clip has not been sent yet. JOS-146 reads one stored number instead of re-deriving it, and JOS-148 computes the factor against a request that is fixed.
*Not taken:* a pure function called by JOS-146 at send time (product owner decision, 2026-09-30). It would leave AC4's "recorded" to JOS-148 and let a later build change the request of a chunk not yet sent.

**Decision 3 — Migration 10: two nullable columns and two lock triggers.**
Migration 10 adds `scenes.requested_duration_seconds INTEGER` and `scenes.duration_warning TEXT`, and one `BEFORE UPDATE OF <column>` trigger per column raising `locked: scenes.<column> cannot be modified once the chunk is established`, built from a new constant `LOCKED_SCENE_DURATION_REQUEST_COLUMNS` (not the migration-7 or migration-9 arrays, which applied migrations already consume).
- *INTEGER:* every admitted duration is a whole number of seconds (`VIDEO_ADMITTED_DURATIONS_SECONDS`, verified by JOS-165). A future provider with fractional durations would be its own change.
- *Nullable:* the pre-decomposition skeleton path still creates scenes with no interval, hence no request; a default would be a fake request. `duration_warning` is also null for every chunk without a warning.
- *Only `exceeds-maximum` is ever written.* The type is a one-member union in TypeScript. JOS-148's limit warning is stored by JOS-148 in its own column, since this one is locked at registration.
- *Migration number:* 10 is free on this branch and on `feature/entrega-2-JAME`; JOS-146's design had planned 10 for itself and re-checks at its gate (its task 1.4).

**Decision 4 — Exposed read-only as `requestedDurationSeconds` and `durationWarning`.**
`Scene` gains `requestedDurationSeconds: number | null` and `durationWarning: "exceeds-maximum" | null`. `sceneToPayload` sets each only when not null, so skeleton scenes and chunks without a warning omit them. The Zod scene response schema adds both as optional with `.describe()` citing PRD §7.2 and §6.1.1 and stating they are immutable. No request schema changes.

## Risks / Trade-offs

- **[Stacked on two unmerged branches, JOS-143 on JOS-142]** → Rebase onto `feature/entrega-2-JAME` once both merge, before the PR. This change touches `sceneRegistration.ts`, `db.ts`, `types.ts`, `orchestrator.ts`, `routes.ts` next to JOS-143's lines, so conflicts during that rebase are expected and small.
- **[Migration collision with JOS-146]** → JOS-146 takes the next free number at its gate; recorded in the hand-off comment.
- **[`generate-chunk-image` (JOS-145) also edits `db.ts`, `orchestrator.ts` and `sceneToPayload`]** → Whichever merges later resolves the conflict; no behaviour overlaps.
- **[The warning ignores the speed-factor limit]** → Intended (Decision 1). A chunk slowed from 16 s to 15 s gets `exceeds-maximum` although its factor is small; that is what §6.1.1 asks for, and JOS-148 decides about limits.

## Migration Plan

Migration 10 is additive. Existing scenes, all from development or tests, get null values and omit both fields. Rollback: revert the commits; the columns and triggers are harmless if left in a development database.

## Open Questions

None blocking.
