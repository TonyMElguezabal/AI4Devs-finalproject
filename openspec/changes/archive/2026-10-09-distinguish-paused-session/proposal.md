# Distinguish a paused session from running generations

Linear-Issue: JOS-153 (US-21)

## Why

PRD §9 requires the interface to tell apart "a generation that is still running" from "a phase that is waiting for the User to continue", and §8.3 says a pause is an extra control condition that keeps the phase and progress reached and is neither success nor failure. US-20 (`pause-and-continue-session`, JOS-152, merged) built the pause itself and exposed what is *held*, but the session page still cannot answer the User's real question — "is anything happening right now, or is it waiting for me?":

- The marker reads only "— paused". It does not say the session is waiting for the User.
- Nothing positively marks work that is still running during a pause. A scene `image-generating` beside held scenes looks the same as before the pause, and the header has no "N still generating" line. A paused session in `chunks-processing` with every scene held reads exactly like one that is busy.
- A held scene in `image-complete` (waiting for its video) keeps the amber "in progress" status colour, so the colour says "running" while the text says "waiting".
- The Continue button is shown only in `chunks-processing` and `final-video-generating`. US-20 allows pausing in every state (its Decision 8), so a session paused in `voice-over-complete`, `chunk-decomposing`, `submitted` or `failed` shows "paused" with no way to continue from the page.

## What Changes

- **Session payload gains `running`** (response only): the stages with work actually in flight and how many units each, derived from the stored in-flight records (scenes in `image-generating` / `video-generating`, stage attempts whose outcome is `in-flight`). It is the counterpart of US-20's `held`: the backend says what is running and what is held, and the frontend only renders both.
- **The paused marker says it waits for the User**: "Paused — waiting for you to continue", shown beside the session state, never in place of it.
- **The header shows held and running work as two separate lines while paused**: what will start on continue, and what is still generating (or that nothing is generating).
- **Scene rows mark the difference**: a held scene says it is waiting for continue and is styled as waiting, not as in progress; a scene whose request was sent before the pause says it is still generating.
- **Continue is reachable whenever the session is paused**, in every state. Pause is offered whenever the session is not paused and has not reached `final-video`.
- **Nothing is hidden or recoloured by the pause**: the state, failed phase, failed scenes and every scene row (the progress reached) stay visible; the paused marker never uses the success or failure colours.

## Capabilities

### New Capabilities

- `paused-session-display`: how a paused session is shown: the marker beside the state and progress, held work apart from running work at session and scene level, the `running` field that supports it, the pause neither shown as success nor failure, and Continue available whenever paused.

### Modified Capabilities

None. `visual-design` already requires the paused marker to be identifiable by text; this change keeps that and adds no new rule to it. `live-updates-foundation` already requires `paused` as a separate field; `running` is additive. US-20's `session-pause` capability is not archived yet (its change is still open), so the `held` contract it defines is consumed as-is, not modified.

## Impact

- **Depends on**: US-20 (JOS-152), merged into `feature/entrega-2-JAME`: `paused`, `held` on session and scenes, the launch gate and the image and video launchers.
- **Backend**: a derivation of running work beside `sessionHeldWork` (`launchGate.ts` / `orchestrator.ts`), the `toSnapshot` payload, `types.ts`, and the Zod response schema in `routes.ts`. No new table, no new column, no migration.
- **API contract**: the session schema in `GET /sessions/{id}`, `POST /sessions` and the live session event gains the response-only `running` field. `docs/api-spec.yml` and `docs/data-model.md` are updated.
- **Frontend**: `types.ts`, `SessionHeader.tsx`, `SceneRow.tsx`, and the shared status mapping in `styles/status.ts` (a held scene maps to the waiting style). Component and live-update tests in `frontend/test/`.
- **Later stages**: voice-over and assembly have no in-flight record yet on the integration branch (JOS-149's assembly attempts are on an open PR). Deriving `running` from `in-flight` stage attempts covers them as soon as they record attempts, with no change here.
- **Not included**: a section or tab per phase and a progress summary (US-18, JOS-168), per-scene progress beyond the scene list (US-19), cancelling a sent request (§2.3, §9), and changing what pause holds (US-20).
