# Design — Distinguish a paused session from running generations

## Context

PRD §9: "La interfaz debe distinguir entre una generación que sigue en curso y una fase que está esperando la continuación del usuario." §8.3: a pause is an extra control condition that keeps the phase and progress reached and is neither success nor failure. §8.1: the pause is a marker on top of the state, never a state.

What US-20 (`pause-and-continue-session`, JOS-152, merged into `feature/entrega-2-JAME`) left in place:

- `runs.paused`, the launch gate (`admitLaunch`), and launchers registered for the image and video stages (`launchGate.ts`; voice-over, decomposition and assembly are still in `NOT_YET_LAUNCHABLE`).
- `toSnapshot` adds `held` to the session (stages with held work and counts, only while paused) and `held: true` to held scenes, both from `sessionHeldWork`, the same function continue uses (US-20 Decision 7).
- `SessionHeader.tsx` renders `Session state: <state> — paused (N image held)`; `SceneRow.tsx` appends `— waiting for continue` to a held scene. The Pause/Continue button renders only when the state is `chunks-processing` or `final-video-generating`.
- `styles/status.ts` maps states to four classes. `image-complete` maps to `status-progress` (amber), whatever `held` says.

What is missing for US-21 is the other half of the distinction: nothing says what is *running*. A scene's in-progress state (`image-generating`, `video-generating`) is written by `markSceneInFlight` / the video equivalent only after the gate admits the launch (US-20 Decision 2), so it already means "a request was sent". Session-level stages record an `in-flight` row in `stage_attempts` before their request (`generate-voice-over` Decision 2). The facts exist in the store; the representation does not report them.

Constraints: strip-only TypeScript in the backend (no parameter properties, no enums); the frontend renders what the backend sends and does not re-derive pipeline rules (consult-session Decision 6, US-20 Decision 7); status is never colour-only (`visual-design`).

## Goals / Non-Goals

**Goals:**

- At a glance, a paused session says: this is where it stands, nothing new will start until you continue, and here is what (if anything) is still generating.
- The backend states both what is held and what is running; the frontend renders both.
- A held unit never looks like progress, and a pause never looks like success or failure.
- The User can always continue a paused session from its page.

**Non-Goals:**

- A section or tab per phase, or a progress summary such as "3 of 5 scenes" (US-18, JOS-168, not started). Progress here is the state plus the scene list, which already exist.
- Changing what a pause holds or how continue launches (US-20).
- Running-work derivations for stages that do not record in-flight work yet; they appear automatically once they do (Decision 2).

## Decisions

**Decision 1 — The backend reports `running`; the frontend does not infer it.**
The session payload gains `running: Array<{ stage, count }>`, the counterpart of `held`. The header and scene rows render it; they do not count scene states themselves.
*Alternatives:* derive "still generating" in the frontend from scene states (rejected: it works for scenes but not for session-level phases, where `chunks-processing` and `final-video-generating` are derived states that can hold while nothing is in flight; the page would need to know which session states are "entered at launch" and which are derived, which is exactly the pipeline knowledge US-20 Decision 7 kept out of the frontend); a single `idle: boolean` (rejected: the User cannot tell how much is still running, and AC2 asks for the generation to be shown, not just a yes/no).

**Decision 2 — `running` is derived from in-flight records, not from launchers.**
`sessionRunningWork(runId)` reads: scenes in `image-generating` (stage `image`) and `video-generating` (stage `video`); and `stage_attempts` rows with outcome `in-flight`, mapped to pipeline stages (`voice-over` → `voice-over`, `timestamps` → `decomposition`, `assembly` → `assembly`). Stages appear in `PIPELINE_STAGES` order and only with a count above zero.
*Alternatives:* add `runningWork` to `StageLauncher` (rejected: only image and video have launchers; voice-over and decomposition already record in-flight attempts but have no launcher, so a launcher-based list would hide them); store a running flag (rejected: a second copy of what the scene status and attempt outcome already say, and it could drift).
*Consequence:* JOS-149's assembly attempts (open PR #25) and the voice-over launcher of JOS-136 show up in `running` as soon as they record `in-flight` attempts, with no change here. A stage-attempt stage name with no mapping is a test failure, not a silent omission (task 2.3).

**Decision 3 — `running` is computed always; it is displayed while paused.**
Unlike `held`, which only exists while paused (US-20 Decision 7), running work is a fact either way, so the payload always carries it. The page shows the running and held lines only beside the paused marker; when the session is not paused, the in-progress state already says the session is working, and a running line there is progress display, which is US-18's.
*Alternatives:* compute only while paused (rejected: a consumer would read an empty list as "nothing running" on an unpaused session, which is false); display always (rejected: scope of US-18).

**Decision 4 — By construction a unit cannot be both held and running.**
Held scenes are `submitted` (image) or `image-complete` without video (video); running scenes are `image-generating` / `video-generating`. A session-level stage is held only when its prerequisite completed and no attempt was started; running only when an attempt is `in-flight`. A test asserts the two sets are disjoint for a session with both (task 2.2), so a later launcher whose `heldWork` overlaps an in-flight state fails loudly.

**Decision 5 — Marker and lines are text, in a fixed order.**
While paused, the header reads, top to bottom:
1. `Session state: <state>` with its own state styling, unchanged by the pause;
2. `Paused — waiting for you to continue`;
3. `Still generating: 1 image` or `Nothing is generating`;
4. `Waiting for continue: 2 image` (only when `held` is not empty).

The failed phase, failed scenes and the final-video download keep their places. The marker is a status line, not `role="alert"`: an alert is reserved for failures and warnings in this UI, and announcing a pause as an alert would present it as a problem (AC3).
*Alternatives:* one combined sentence (rejected: "running" and "waiting" must be distinguishable, and two lines read better in the accessibility tree and in tests); replacing the state with "Paused" (rejected by §8.1 and §8.3).

**Decision 6 — Scene rows: a held scene is styled as waiting; a sent scene says it is still generating.**
`sceneStatusClass` stays the one mapping, gaining an optional `held` argument: a held scene maps to `status-queued` whatever its state. A scene whose state is in progress while the session is paused and the scene is not held gets the text `— still generating`. The page decides this from `session.paused` plus the scene's own `held` flag and its state name; it does not count anything.
*Alternatives:* a fifth `status-paused` class (rejected: `visual-design` fixes four status colours, and "waiting" already exists as `status-queued`); a scene-level `running` flag from the backend (rejected: the scene's own state already says its request is in flight, by Decision 2 of US-20; a flag would duplicate it).

**Decision 7 — Pause styling never borrows success or failure.**
The marker line has its own class (`session-paused-marker`) coloured with the queued token. The header's border keeps the state's class, so a paused `final-video` stays green and a paused `failed` stays red: that colour comes from the state, not the pause, and §8.3 says the pause keeps the phase reached.

**Decision 8 — Continue whenever paused; Pause whenever not paused and not `final-video`.**
US-20 Decision 8 accepts pause and continue in every state. The current button rule (only `chunks-processing` / `final-video-generating`) contradicts it and strands a session paused in `voice-over-complete`, `chunk-decomposing`, `submitted` or `failed`. Continue is always reachable when paused. Pause is hidden only in `final-video`, where nothing can launch.
*Alternatives:* keep the state list and add the missing states (rejected: a second table of states that must track US-20's "every state" rule).

## Risks / Trade-offs

- [A future stage records in-flight work somewhere other than `stage_attempts` or a scene status] → it would be missing from `running`. Mitigation: the mapping test fails for an unmapped `AttemptStage` (task 2.3), and the backend standards gain one line: in-flight work must be visible to `sessionRunningWork`.
- [`chunks-processing` while paused with `running` empty reads oddly ("in progress" state, nothing generating)] → This is exactly what §9 wants made explicit; the "Nothing is generating" line says it. The state itself is not changed (§8.1).
- [Snapshot cost] → one extra indexed query per read (in-flight stage attempts for the run) plus a pass over scenes already loaded. Negligible next to the existing reads.
- [Text strings are asserted in tests] → wording changes break tests. Accepted: the text is the accessibility contract (`visual-design`).

## Migration Plan

No schema change, no data migration. `running` is an additive, response-only field; existing consumers ignore it. The frontend changes ship with it. Rollback is reverting the change.

## Open Questions

1. **Wording.** "Paused — waiting for you to continue", "Still generating", "Nothing is generating", "Waiting for continue" are proposed. Product owner may adjust; only tests and the spec text change.
2. **Should an unpaused session also show "Still generating"?** Left to US-18 (Decision 3). The payload already supports it.
