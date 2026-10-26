## Context

- Reports live in `backend/src/adminReportRoutes.ts` (registered inside the `/admin` plugin, so the 401 gate answers first) with the query in its own module (`providerUsageReport.ts`) and the table in `frontend/src/components/ReportsSection.tsx`. The latest migration on `origin/main` is 21.
- Session-level attempts (`voice-over`, `timestamps`, `decomposition`, `assembly`) are in `stage_attempts` with outcomes `timed-out`, `late-success` and `superseded` (JOS-185). Scene image and clip attempts are in `provider_requests` and record no such outcomes (the image stage "records no attempt row" for time-outs).
- Phase boundaries in the code: the voice-over starts at its first attempt and ends at `insertVoiceOver`; the decomposition phase (`timestamps` + `decomposition` stages) ends when `registerDecomposition` stores the scenes; the scenes phase ends when the last scene is `chunk-complete` (the assembly gate opens); assembly starts at its first attempt and ends when `final_video_path` is first set (`UPDATE … WHERE final_video_path IS NULL`).

## Goals / Non-Goals

**Goals:**
- Record each phase's start and end once (AC1); report no time where none was recorded (AC2).
- Report elapsed seconds per phase, per session and aggregated, plus timed-out, late and superseded attempts (AC3); refuse without the password (AC4).

**Non-Goals:**
- Backfilling or estimating instants for existing sessions, including voice-over and assembly (AC2).
- Counting time-outs of scene image and clip attempts (not recorded today; see Decision 5).
- Re-stamping on a retry, a rebuild or a restart: the first start and the first end stand.

## Decisions

### 1. One `phase_instants` table, not columns on `runs`
`phase_instants(run_id, phase, started_at, ended_at, PRIMARY KEY (run_id, phase))`. Four phases would need eight nullable `runs` columns, and the content-lock triggers already guard `runs`. Alternative rejected: derive from existing stamps at report time; the decomposition and scenes phases have none.

### 2. One stamping function, first write wins
`stampPhase(runId, phase, "started" | "ended", at)` upserts with `COALESCE(existing, new)`, so retries, rebuilds and restarts never move an instant. The calls sit at the boundaries listed in Context, next to the writes that already mark them, all in `db.ts`: `insertStageAttempt` (starts of voice-over, decomposition and assembly; `sentAt`, or `queuedAt` for a scheduled attempt), `insertVoiceOver` (voice-over end), `insertRegisteredScenes` (decomposition end and scenes start), `markChunkComplete` (scenes end when no scene of the session is left incomplete), `setFinalVideoPath` (assembly end, first set only). Alternative rejected: stamp from the session state machine; it is a pure function of stored state and has no write hook.

### 3. The scenes phase starts when the scenes are registered
Registration is the instant the scenes exist and chunk work can begin, and it is also the decomposition phase's end. This replaces the spike's approximation (first image request). A queue wait behind the request limit is therefore part of the scenes phase, which is what the Administrator tunes.

### 4. Period selection and aggregation
A phase belongs to the period when its `started_at` is in `[from, to)`; elapsed seconds exist only when `ended_at` is set. Aggregates are the session count, median and 95th percentile (reusing `nearestRankPercentile`). Attempt counts use `sent_at` in the period, as the usage report does. Per-session rows list the four phases with `null` where no time exists.
- Alternative: filter by `runs.created_at`. Rejected: it would drop long sessions that straddle the boundary the other reports use.

### 5. Scene attempts report no time-out counts
For the scenes phase the three attempt counts are `null` ("not recorded"), not 0: scene attempts store `success` / `transient_failure` / `not_retryable_failure` only. Voice-over, decomposition (both stages) and assembly are counted from `stage_attempts.outcome`.

## Risks / Trade-offs

- [A session started before the upgrade has a phase begun but not ended, or neither stamp] → shows no time (AC2); the report counts only phases with both instants.
- [Two paths complete the same phase] → `COALESCE` keeps the first.
- [A missed boundary call leaves a phase unstamped] → each boundary has a test through the real write path (tasks 3).

## Migration Plan

Migration 22 creates the table at start-up. Rollback: older code ignores the table; nothing is removed.

## Open Questions

- Should time-outs of scene clips be recorded to fill the scenes row? Out of scope here; would need a scene-level outcome.
