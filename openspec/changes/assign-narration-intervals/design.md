# Design — Assign narration intervals that partition the voice-over (JOS-143)

## Context

What exists on `feature/jos-142-decide-silence-allocation` (the base of this branch):

- **The boundary rule (JOS-142, D11 closed).** `unitBoundaries(spans, D)` in `backend/src/sentenceTimings.ts` returns n + 1 boundaries for n units: 0, each following unit's speech start (rule A: the previous scene absorbs the silence after it), and D. The Linear hand-offs on JOS-143 from JOS-140 and JOS-142 both ask that intervals reuse it rather than re-derive a rule.
- **Segmentation (JOS-140/141).** `segmentScript` in `segmentation.ts` computes `boundaries = unitBoundaries(...)` over the final units, groups units into fragments, and emits each fragment's `text` and `narratedDurationSeconds = boundaries[last + 1] - boundaries[first]`. The boundaries themselves are discarded.
- **Registration (JOS-144).** `registerDecomposition` in `sceneRegistration.ts` validates fragments (`findFragmentProblem`: non-empty text, positive duration, §6.1 bounds with the two §6.1.1 exceptions, script reconstruction), obtains IMAGE/VIDEO instructions, and writes all chunks in one transaction (`insertRegisteredScenes` in `db.ts`). Migration 7 locks `idx`, `prompt` and `run_id` with `BEFORE UPDATE OF` triggers and forbids deletes.
- **The voice-over.** `getVoiceOver(runId).durationSeconds` is the MP3's measured duration; `segmentStoredTimestamps` passes exactly this value to `segmentScript` as `D`.
- **Exposure.** `sceneToPayload` (`orchestrator.ts`) builds scene events and snapshot entries; `routes.ts` declares their Zod schema, from which `@fastify/swagger` generates the OpenAPI. `docs/api-spec.yml` is the hand-maintained contract.

## Goals / Non-Goals

**Goals:**
- Every registered chunk carries its interval, taken from the same boundaries that measured it.
- The partition (AC19) is checked, not assumed, before anything is written.
- The interval cannot change after registration (AC4), enforced by the database.

**Non-Goals:**
- Assembly and retiming (JOS-149), speed-factor warnings (JOS-148), frontend display, backfilling old chunks.

## Decisions

**Decision 1 — The fragment carries its interval, and the duration is derived from it.**
`SegmentedFragment` replaces `narratedDurationSeconds` with `narrationInterval: { startSeconds, endSeconds }`, filled in `segmentScript` from `boundaries[first]` and `boundaries[last + 1]`. A small exported helper `intervalDurationSeconds(interval)` returns `end - start`, and `findFragmentProblem` uses it for the §6.1 bounds check.
*Why replace rather than add:* keeping both fields would let a caller hand over a duration that disagrees with its interval, which is the exact disagreement the JOS-140 hand-off warned about. One source of truth removes the case.
*Cost:* every test that builds a `SegmentedFragment` by hand (JOS-144's registration tests) changes shape. They are updated, not bulk-rewritten: each keeps its intent, with an interval whose length is the old duration.
*Not taken:* recomputing intervals inside registration from the timestamps. Registration does not know the units, and a second computation is a second rule.

**Decision 2 — Registration checks the partition, with exact comparisons.**
A new check, `findPartitionProblem(fragments, voiceOverDurationSeconds)`, runs in `registerDecomposition` right after `findFragmentProblem` and before the instruction call. It returns the first problem among: the first interval does not start at 0; an interval's start is not the previous interval's end (gap or overlap, naming the scene); an interval has a non-positive length; the last interval does not end at the voice-over's duration.
Comparisons are exact (`!==`), with no tolerance. Every boundary is an element of one `unitBoundaries` array, and its last element is the very `durationSeconds` value registration reads, so a correct segmentation produces bit-identical values. A tolerance would only hide a second rule creeping in. The failure goes through JOS-144's `recordFailure` as retryable, like the other validation failures, with a cause such as "scene 2 does not start where scene 1 ends".
Registration reads `getVoiceOver(runId)`. If there is none, the partition cannot be checked, and it records a non-retryable decomposition failure (retrying the same state gives the same result). In the pipeline this does not happen, since `segmentStoredTimestamps` already returns `no-timestamps` without a voice-over.

**Decision 3 — Two nullable REAL columns and two lock triggers, in migration 9.**
Migration 9 adds `scenes.narration_start_seconds REAL` and `scenes.narration_end_seconds REAL`, and one `BEFORE UPDATE OF <column>` trigger per column raising `locked: scenes.<column> cannot be modified once the chunk is established`, the message pattern migration 7 uses.
- *Nullable,* because the pre-decomposition skeleton path (`db.ts`, the `INSERT INTO scenes ... provider_mode` statement) still creates scenes without a decomposition, and SQLite's `ADD COLUMN` cannot add `NOT NULL` without a default that would be a fake interval. Registered chunks always have both values, since `insertRegisteredScenes` writes them.
- *A new constant, not an extension of `LOCKED_SCENE_COLUMNS`:* migration 7 builds its triggers from that array. Adding the columns to it would change what migration 7 creates on a fresh database and make migration 9's triggers collide. An applied migration's behaviour is never edited (the rule stated in `docs/data-model.md`).
- *Triggers, not only the absence of a route,* because AC4 says "processing or retries": those run inside the backend, not through a route, so the guarantee must hold below the application code.

**Decision 4 — Stored in the registration transaction.**
`RegisteredSceneInput` gains the interval, and `insertRegisteredScenes` writes both columns in its existing single `INSERT`, inside the existing transaction. No new write path, so the all-or-nothing guarantee of JOS-144 Decision 5 covers the intervals.

**Decision 5 — Exposed read-only as `narrationInterval`.**
`Scene` gains `narrationInterval: { startSeconds: number; endSeconds: number } | null` (null for skeleton scenes). `sceneToPayload` sets `narrationInterval` only when it is not null, so skeleton scenes omit it. The Zod scene schema in `routes.ts` adds it as optional with a `.describe()` citing PRD §3 and §7.3 and stating it is immutable. `docs/api-spec.yml` gets the same field on the scene objects of the session read and the event stream. No request schema changes, so no route can accept an interval.

**Decision 6 — Retries cannot reach the interval by construction.**
Automatic and manual retries update `status`, `attempts`, `current_request_id`, `last_error`, `result` and the correctable instructions, never the interval columns. A second decomposition is refused by the existing `already-registered` guards and the unique `(run_id, idx)` index. Tests pin both: a retry and a correction leave the interval as registered, and a second registration leaves stored intervals unchanged.

## Risks / Trade-offs

- **[This branch is stacked on JOS-142, whose PR is not merged]** → Rebase onto `feature/entrega-2-JAME` once JOS-142 merges, before opening this PR. The code touched here does not overlap JOS-142's diff apart from reading `unitBoundaries`.
- **[The shared local database leaks migrations across branches]** (project note) → Migration 9 must not already be taken on another branch. Verify the highest migration number on `feature/entrega-2-JAME` and the open JOS-145 branch before writing it, and renumber if needed.
- **[Exact float comparison]** → Correct because every value comes from one array (Decision 2). If a future change computes a boundary twice, the check fails loudly, which is the intent.
- **[Changing `SegmentedFragment`'s shape touches JOS-144's tests]** → Reviewed test by test in the mandatory test-review step.

## Migration Plan

Migration 9 is additive. Existing scenes, all from development or tests, get NULL intervals and are shown without `narrationInterval`. Rollback: revert the commits. The columns and triggers are harmless if left in a development database.

## Open Questions

None blocking.
