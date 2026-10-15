# Design — Adjust the pause after a scene and rebuild the final video (JOS-190)

## Context

How timing works today (base `9c78fe0`):

- **D11, rule A** (`openspec/specs/silence-allocation`, `sentenceTimings.ts`): the boundary between scene *i* and *i+1* is the start of *i+1*'s speech. Scene *i*'s interval is its speech followed by the whole pause after it. The first boundary is 0 and the last is the MP3's duration.
- **Everything is locked once written.** DB triggers lock `narration_start/end_seconds`, `requested_duration_seconds`, `speed_factor`, `idx`, `prompt`, the narration timestamps and the voice-over row (`db.ts`).
- **Assembly** (`orchestrator.ts` `runAssemblyAttempt`, `ffmpegAssemblyTool.ts`) does three things:
  - retimes each clip to its stored interval with `setpts`, using cumulative frame accounting;
  - concatenates the clips;
  - muxes the MP3 with `-c:a copy`.
  The copy is load-bearing (ADR 0005 Decision 4b): re-encoding to AAC shifted the narration by about 7–11 ms of encoder priming.
- **The final video is one file.** `final-video.mp4` is written once, never replaced (`assembly-failure-recovery`), and assembly refuses to run when `run.finalVideoPath` is set.
- **Speed-factor limit** (`SPEED_FACTOR_LIMIT = 2.0`): the unsigned factor `max(clip/interval, interval/clip)` must stay ≤ 2.0. Clips are requested at the admitted duration (5–15 s) closest to the interval.
- **Data:** a scene's `PROMPT` is its verbatim script fragment, and the narration timestamps are stored per session. So each scene's speech span can be recomputed with `sentenceSpeechSpans` at any time.

The product owner's decisions are listed in the proposal: trim/extend the silence, after the final video, 0.2/3.0/0.1 s, clamp rather than regenerate, MVP.

## Goals / Non-Goals

**Goals:**
- Let the User shorten or lengthen the silence after any scene, after the final video exists, and rebuild the final video with those edits.
- Keep every locked record, the stored MP3 and every clip untouched.
- Keep untouched sessions byte-for-byte on today's path.
- Keep audio and video in sync within the existing ±1 frame bound.

**Non-Goals:**
- **Clip regeneration.** It was rejected in favour of clamping the range.
- **Editing the leading silence** before the first word.
- **Editing before the first final video exists.**
- **Any change to D11, segmentation, or the stored intervals.**
- **Per-version download URLs.** The download route serves the current version; earlier files stay on disk in the project folder (§12.1).

## Decisions

### 1. A scene's pause is derived, never stored

`originalPause(i) = interval_i.end − speechEnd(i)`. `speechEnd(i)` is the end of the last spoken character of scene *i*'s `PROMPT`, located in the script by walking the prompts in index order from a cursor. It is computed with the existing `sentenceSpeechSpans` over the stored timestamps, so it uses the same matching as segmentation. For the last scene, the pause runs to the MP3's duration.

A scene with no `PROMPT`, or a session whose timestamps don't match (`sentenceSpeechSpans` throws), gets no `pause` in the read and cannot be edited. This covers the legacy and test-endpoint scenes.

*Alternative:* store `speech_end_seconds` at registration. Rejected: existing sessions would need a backfill, and the value is fully derivable from locked data. This follows the project's "derived, not stored" pattern (JOS-136, JOS-168).

### 2. The allowed range per scene

Let `C` be the scene's `requestedDurationSeconds` (its clip length) and `S = interval length − originalPause` (its speech share).

- `min = max(0.2, C / 2.0 − S)` and `max = min(max(3.0, originalPause), 2.0 × C − S)`. These keep the new interval within `[C/2, 2C]`, i.e. a speed factor ≤ 2.0.
- If the original pause falls outside `[min, max]`, the range is widened to include it. Reset is always possible, and a scene that already violates the limit (recorded `speedFactorWarning`) is never made worse.
- Allowed values are the 0.1 s grid points inside `[min, max]`, plus the original value itself (usually off-grid, e.g. 2.63 s).
- `limitedBySpeedFactor` is true when the speed-factor term set `min` or `max`. The page then explains why the dial stops there.

`C` is the requested duration, not the measured clip length (which only assembly measures). The difference is a few tens of ms, and assembly does not refuse over-limit factors, so this cannot break a build.

### 3. Storage: one mutable table, one write-once table

- `scene_pause_edits (scene_id TEXT PRIMARY KEY REFERENCES scenes(id), run_id TEXT NOT NULL REFERENCES runs(id), pause_seconds REAL NOT NULL CHECK (pause_seconds >= 0), updated_at TEXT NOT NULL)`, indexed on `run_id` so a session's edits read without a join.
  - It is the only mutable timing data, deliberately: the dial is meant to be turned more than once.
  - Setting a scene back to its original pause deletes the row, so "no row" always means "original".
- `final_video_builds (run_id TEXT, version INTEGER, path TEXT NOT NULL, pauses TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (run_id, version))`.
  - `pauses` is a JSON map `sceneId → seconds` of the edits applied.
  - A no-update/no-delete trigger like the other write-once tables.
  - The existing `final-video.mp4` is version 1, with no edits, implicitly: there is no row and no backfill.
- `runs.final_video_path` keeps pointing at the current version. A rebuild changes it with a compare-and-set (`WHERE final_video_path = ?expected`), so two concurrent successes cannot both win. This mirrors JOS-161's "refused move means another won".
- **Pending edits** = the current edits ≠ the latest build's `pauses` (version 1 = `{}`).

### 4. Effective intervals are a pure function

`applyPauseEdits(intervals, pauses, mp3Duration) → { intervals', edits, durationSeconds' }`:

- Scene *i*'s delta is `newPause − originalPause`.
- `start'_i = start_i + Σ_{j<i} delta_j` and `end'_i = end_i + Σ_{j≤i} delta_j`. The result still partitions `[0, D + Σ delta]`, and the shared partition check is reused unchanged.
- `edits` lists, in the *original* timeline, `{ atSeconds: midpoint of scene i's pause, deltaSeconds }`.
- Cutting or inserting at the midpoint leaves the decay of the last word and the onset of the next untouched.

Assembly feeds `intervals'` to the existing frame-geometry code in place of the stored intervals; the stored intervals are never written.

### 5. Editing the narration in the assembly tool

`AssemblyInput` gains `narrationEdits?: { atSeconds; deltaSeconds }[]`.

- **No edits (or an empty list):** the ffmpeg adapter does exactly what it does today (`-c:a copy`). Untouched sessions keep Decision 4b's guarantee unchanged.
- **With edits:** it builds an audio filtergraph:
  - `atrim`/`asetpts` segments around each cut;
  - `anullsrc` silence of the probed sample rate and channel layout for each insertion;
  - `concat`, encoded once as AAC 192 kbps.
- It then **measures** the output with `ffprobe`, using `nb_frames` and stream durations per the ADR's methodological note. Audio duration must equal the video track's duration within ±1 frame. Otherwise the attempt fails (transient, so the retry budget applies) instead of shipping out-of-sync audio.

This is an explicit exception to Decision 4b, scoped to edited builds. It is recorded in ADR 0005 as a dated amendment.

**Gate (task 1) — passed 2026-10-15** (`reports/2026-10-15-step-1-narration-edit-spike.md`): an edited encode stayed within 1 ms of its expected duration and 12.7 ms of the frame-exact video (the baseline copy path: 12.1 ms), with no growth over 20 cuts. It was run on synthesized speech encoded to MP3, since no real voice-over was available; the AAC path stands.

*Alternative, and the fallback if the gate fails:* splice the MP3 with stream copy, snapping each cut to an MP3 frame boundary (26 ms), and use the snapped deltas as the real deltas in Decision 4. This preserves Decision 4b, but risks bit-reservoir artefacts at the splice. It was not chosen first because it is harder to verify, though the cuts fall in silence.

### 6. The rebuild command

`POST /sessions/:sessionId/final-video/rebuild` returns 202, or a refusal:

| Code | Reason |
|---|---|
| 404 | unknown session |
| 409 `no-final-video` | the session has no final video |
| 409 `assembly-in-progress` | an assembly is already running |
| 409 `nothing-to-rebuild` | no pending edits |

The rebuild goes through the existing `assemblyStageLauncher` as a fresh cycle, exactly like the JOS-159 manual retry (attempt numbers restart, full budget), and pause/continue holds it like any assembly.

`runAssemblyAttempt` gains a rebuild mode that differs from a first run in three ways:

1. it skips the "already has a final video" guard;
2. it snapshots the edits when the attempt starts, and passes `intervals'` and `edits` to the tool;
3. on success it moves the output to `final-video-<version>.mp4` without replacing anything, inserts the build row, then compare-and-sets `final_video_path`.

A failed rebuild is recorded on its stage attempt only, never as `runs.failure`, so the session never shows `failed` while it has a playable final video. The read derives `rebuildFailure` from the latest assembly attempt newer than the current build. The User can press Rebuild again.

### 7. State while a rebuild runs

- `deriveSessionState` gains `rebuildInFlight`. While it is true, the state is `final-video-generating` and the assembly phase reads *In progress*, as for any assembly.
- `finalVideoUrl` stays set, so the previous version is downloadable throughout.
- Pause edits are refused while a rebuild is in flight (409 `assembly-in-progress`), so the build's snapshot and the page never disagree.

### 8. Restart

At boot, an in-flight rebuild attempt is settled by the existing restart path as a failed attempt ("interrupted by a restart"). The current final video is unchanged, and leftover temp output under `PROJECTS_ROOT/.assembly-tmp-*` is cleaned as today. Nothing is relaunched automatically: the User presses Rebuild again. Rebuilding is a User decision, unlike a first assembly, which is automatic.

### 9. API and validation

- **`PUT /sessions/:sessionId/scenes/:sceneId/pause`**, body `{ seconds: number }` (Zod: finite, ≥ 0).
  - The server checks that the value is on the 0.1 s grid (tolerance 1e-9) or equals the original, and inside the scene's range. Otherwise it returns 422 with a sentence naming the range, and the clamp reason when relevant.
  - Also 404 (unknown session or scene), and 409 for no final video, an assembly in progress, or a scene with no derivable pause.
  - It answers 200 with the updated scene payload and broadcasts the snapshot.
- **Read additions:**
  - `scene.pause = { originalSeconds, seconds, minSeconds, maxSeconds, limitedBySpeedFactor }`, present only when the session has a final video and the pause is derivable.
  - `session.finalVideo = { version, pendingPauseEdits, rebuildFailure? }`, present only with a final video.
  - `finalVideoUrl` is unchanged.

### 10. Page

- **Expanded scene card:** a labelled number field **Pause after scene N** (`step=0.1`, `min`/`max` from the read). It is saved when it changes (blur or Enter). Next to it is **Reset scene N pause**, enabled when the value differs from the original. Helper text gives the range, and, when `limitedBySpeedFactor` is set, the sentence "Shorter than X s would speed this scene's clip past 2.0×". A refusal shows as a sentence (`role="status"`), like the JOS-157 refusals. The field is absent when `pause` is.
- **Final video card:** "Version N", the download link (unchanged name), and the primary **Rebuild final video** button, shown only when `pendingPauseEdits` is true. While rebuilding, the download stays and a status line says the new version is being built. A failed rebuild shows a callout with the cause and keeps the button.
- **New accessible names:** `Pause after scene {index}`, `Reset scene {index} pause`, `Rebuild final video`. The names are added to `docs/frontend-standards.md`, and no existing name changes.

## Risks / Trade-offs

- **[AAC re-encode drifts by the priming delay]** → The edited path measures sync and fails the attempt when it is out of bounds. The gate spike (task 1) decides between AAC and the MP3-splice fallback before any code.
- **[A mutable table in a write-once data model]** → It holds only User intent, never generated output. Builds are recorded write-once with the exact edits they used, so what each file contains stays auditable.
- **[Several final-video files per session]** → The project folder (§12.1) keeps them all. Only the current one is served. Disk use grows per rebuild, a deliberate User action.
- **[Requested vs measured clip length in the clamp]** → The error is a few tens of ms near the limit edge. Assembly tolerates it (it only records a warning).
- **[The feature may be rarely needed]** (JOS-142: no real pause above 1.26 s) → Scope is held to editing plus a rebuild. No regeneration, no new video-stage logic.
- **[`sentenceSpeechSpans` cannot locate a prompt]** (legacy scenes, test endpoints) → The pause is omitted for that scene and the dial absent. It never errors the read.

## Migration Plan

Two additive tables, created by migrations in `db.ts`, with the write-once triggers for `final_video_builds`. There is no backfill: an existing `final-video.mp4` is version 1 implicitly. Rollback: drop the two tables. `runs.final_video_path` still points at a readable file in either case.

## Open Questions

None blocking. The gate spike (task 1) may switch Decision 5 to its fallback. If it does, design.md is updated before coding.
