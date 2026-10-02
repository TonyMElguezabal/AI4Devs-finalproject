# Assign narration intervals that partition the voice-over

Linear-Issue: JOS-143 (US-10)

## Why

PRD §5 step 4 and §7.3 require every chunk to own a contiguous interval of the voice-over, with the intervals together covering it from second 0 to the MP3's full duration (AC19). Today segmentation computes those boundaries (`unitBoundaries`, rule A since D11 closed in JOS-142) only to measure fragment durations, then throws them away: a registered chunk stores its text and visual instructions, but not the interval it narrates. Assembly (JOS-149) and the speed-factor warnings (JOS-148) need that interval, and PRD §3 says the User may never edit it.

## What Changes

- **Segmentation hands over each fragment's interval**, taken from the same `unitBoundaries` array it already measures durations with: the fragment's first unit's boundary to its last unit's following boundary. The narrated duration becomes `end - start` of that interval, so the two can never disagree.
- **Registration checks the partition** before anything is generated or written: the first interval starts at 0, the last ends at the voice-over's measured duration, each interval starts where the previous one ends, and none is empty. A violation is a retryable decomposition failure worded like JOS-144's other checks.
- **Registration stores the interval on each chunk**, in the same transaction as the rest of the chunk.
- **The interval is locked**: a database trigger refuses any change to it once the chunk exists, and no route accepts it (AC4, PRD §3 "No permitida").
- **The interval is readable**: the session read and the scene events carry it, documented in `docs/api-spec.yml`.

## Capabilities

### New Capabilities

- `narration-intervals`: each registered chunk's narration interval, derived from the D11 boundary rule shared with segmentation, forming a partition of the voice-over (contiguous, non-overlapping, from 0 to the MP3's duration), stored with the chunk, readable, and immutable through processing and retries.

### Modified Capabilities

None in `openspec/specs/`. `content-lock` gains two more locked columns, but its requirement (established chunk content cannot change) is unchanged; the new locks are specified in `narration-intervals`.

## Non-goals

- Retiming or assembling clips to their intervals (JOS-149 / US-16) and recording speed-factor warnings (JOS-148).
- Changing the D11 rule or `unitBoundaries` itself: JOS-142 settled it.
- Showing intervals in the frontend.
- Backfilling intervals for chunks registered before this change: none exist outside tests and development databases, since nothing in production registers chunks yet.

## Impact

- **Depends on** JOS-142 (D11 rule A in `unitBoundaries`; this branch is stacked on `feature/jos-142-decide-silence-allocation` until its PR merges into `feature/entrega-2-JAME`), JOS-140/141 (segmentation), JOS-144 (registration and chunk locks) and JOS-136 (the voice-over's measured duration).
- **Code:** `backend/src/segmentation.ts`, `sceneRegistration.ts`, `db.ts` (migration 9: two columns and two triggers), `types.ts`, `orchestrator.ts`, `routes.ts`, and their tests.
- **Docs:** `docs/data-model.md`, `docs/api-spec.yml`, `docs/backend-standards.md`.
- **Unblocks** JOS-149 (assembly reads the stored intervals) and JOS-148.
